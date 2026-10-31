---
title: "cfnDeploy & terraformApply: CloudFormation & Terraform"
tags: [shared-library, aws, deploy]
---

# `cfnDeploy` & `terraformApply`

Two ways to apply infrastructure changes from a pipeline, each showing what will change and, by default, pausing for approval before applying it. `cfnDeploy` uses AWS CloudFormation change sets and `terraformApply` uses a saved Terraform plan. Run both inside [`withAws`](with-aws.md); Terraform's AWS provider picks up the same credentials and region from the environment.

`terraformApply` needs the Terraform CLI on the agent's `PATH`.

## `vars/cfnDeploy.groovy`

```groovy
/**
 * creates or updates a cloudformation stack through a change set
 *  - stackName: the stack to create or update
 *  - template: path to the template file, e.g. 'infra/network.yml'
 *  - parameters: template parameters as a map, defaults to [:]
 *  - capabilities: e.g. ['CAPABILITY_NAMED_IAM'], defaults to none
 *  - approve: pause for a person to approve the change set, defaults to true
 *  - approvalTimeout: minutes to wait for the approval before giving up, defaults to 30
 */
def call(Map args) {
    ['stackName', 'template'].each {
        if (!args[it]) {
            error("cfnDeploy: '${it}' is required")
        }
    }

    int approvalTimeout = args.approvalTimeout ?: 30
    Map parameters = args.parameters ?: [:]
    List<String> capabilities = args.capabilities ?: []
    // change set names must start with a letter and use only letters, digits and hyphens
    String changeSetName = "jenkins-${env.BUILD_NUMBER}"

    // a missing stack is the only describe-stacks error that means "create"; any other error stops the step
    String describeStack = """
        if output=\$(aws cloudformation describe-stacks --stack-name '${args.stackName}' --query 'Stacks[0].StackStatus' --output text 2>&1); then
            echo "\$output"
        elif echo "\$output" | grep -q 'does not exist'; then
            echo NONE
        else
            echo "\$output" >&2
            exit 1
        fi
    """
    String stackStatus = sh(script: describeStack, returnStdout: true).trim()
    if (stackStatus == 'ROLLBACK_COMPLETE') {
        error("cfnDeploy: stack '${args.stackName}' is in ROLLBACK_COMPLETE and can't be updated; delete it and run again")
    }
    // a stack left in REVIEW_IN_PROGRESS by an unexecuted create still needs a CREATE change set
    String changeSetType = stackStatus in ['NONE', 'REVIEW_IN_PROGRESS'] ? 'CREATE' : 'UPDATE'

    String parameterFlag = ''
    if (parameters) {
        String pairs = parameters.collect { k, v -> "'ParameterKey=${k},ParameterValue=${v}'" }.join(' ')
        parameterFlag = "--parameters ${pairs}"
    }
    String capabilityFlag = capabilities ? "--capabilities ${capabilities.join(' ')}" : ''

    sh """
        aws cloudformation create-change-set \
          --stack-name '${args.stackName}' \
          --change-set-name '${changeSetName}' \
          --change-set-type ${changeSetType} \
          --template-body 'file://${args.template}' \
          ${parameterFlag} \
          ${capabilityFlag} \
          --query Id \
          --output text
    """

    String waitForChangeSet = """
        aws cloudformation wait change-set-create-complete \
          --stack-name '${args.stackName}' \
          --change-set-name '${changeSetName}'
    """
    int status = sh(script: waitForChangeSet, returnStatus: true)
    if (status != 0) {
        String describeReason = """
            aws cloudformation describe-change-set \
              --stack-name '${args.stackName}' \
              --change-set-name '${changeSetName}' \
              --query StatusReason \
              --output text
        """
        String reason = sh(script: describeReason, returnStdout: true).trim()

        // an update with nothing to change fails the change set, but isn't a failed deploy
        if (reason.contains("didn't contain changes") || reason.contains('No updates are to be performed')) {
            echo "Stack ${args.stackName} is already up to date"
            deleteChangeSet(args.stackName, changeSetName)
            return
        }

        error("cfnDeploy: change set for '${args.stackName}' failed: ${reason}")
    }

    sh """
        aws cloudformation describe-change-set \
          --stack-name '${args.stackName}' \
          --change-set-name '${changeSetName}' \
          --query 'Changes[].ResourceChange.[Action, LogicalResourceId, ResourceType, Replacement]' \
          --output table
    """

    if (args.approve != false) {
        try {
            timeout(time: approvalTimeout, unit: 'MINUTES') {
                input(message: "Execute change set ${changeSetName} on ${args.stackName}?", ok: 'Execute')
            }
        } catch (err) {
            // rejected or timed out, so don't leave the change set behind
            deleteChangeSet(args.stackName, changeSetName)
            throw err
        }
    }

    sh """
        aws cloudformation execute-change-set \
          --stack-name '${args.stackName}' \
          --change-set-name '${changeSetName}'
    """

    String waiter = changeSetType == 'CREATE' ? 'stack-create-complete' : 'stack-update-complete'
    String waitForStack = """
        aws cloudformation wait ${waiter} \
          --stack-name '${args.stackName}'
    """
    status = sh(script: waitForStack, returnStatus: true)
    if (status != 0) {
        sh """
            aws cloudformation describe-stack-events \
              --stack-name '${args.stackName}' \
              --max-items 10 \
              --query 'StackEvents[].[ResourceStatus, LogicalResourceId, ResourceStatusReason]' \
              --output table
        """
        error("cfnDeploy: stack '${args.stackName}' did not reach ${waiter}")
    }

    echo "Stack ${args.stackName} deployed"
}

// best effort, so a cleanup failure doesn't hide the real outcome
private void deleteChangeSet(String stackName, String changeSetName) {
    String deleteCommand = """
        aws cloudformation delete-change-set \
          --stack-name '${stackName}' \
          --change-set-name '${changeSetName}'
    """
    sh(script: deleteCommand, returnStatus: true)
}
```

## `vars/terraformApply.groovy`

```groovy
/**
 * plans and applies a terraform configuration, pausing for approval in between
 *  - dir: directory holding the terraform configuration, e.g. 'infra'
 *  - approve: pause for a person to approve the plan, defaults to true
 *  - approvalTimeout: minutes to wait for the approval before giving up, defaults to 30
 */
def call(Map args) {
    if (!args.dir) {
        error("terraformApply: 'dir' is required")
    }

    int approvalTimeout = args.approvalTimeout ?: 30

    dir(args.dir) {
        sh 'terraform init -input=false -no-color'

        // -detailed-exitcode: 0 means no changes, 1 an error, 2 changes to apply
        String plan = '''
            terraform plan \
              -input=false \
              -no-color \
              -detailed-exitcode \
              -out=tfplan
        '''
        int status = sh(script: plan, returnStatus: true)
        if (status == 1) {
            error("terraformApply: plan failed in '${args.dir}'")
        }
        if (status == 0) {
            echo "No infrastructure changes in ${args.dir}"
            return
        }

        if (args.approve != false) {
            timeout(time: approvalTimeout, unit: 'MINUTES') {
                input(message: "Apply the plan above to ${args.dir}?", ok: 'Apply')
            }
        }

        // applying the saved plan means exactly what was approved gets applied
        sh 'terraform apply -input=false -no-color tfplan'
    }
}
```

## Usage

```groovy
stage('Infrastructure') {
    steps {
        withAws {
            cfnDeploy(
                stackName: 'my-app-network',
                template: 'infra/network.yml',
                parameters: [Environment: 'production']
            )
            terraformApply(dir: 'infra/terraform')
        }
    }
}
```

> [!WARNING]
> `input` inside these steps pauses the build while it still holds the agent's executor and workspace. Each step limits only the wait for approval, with `approvalTimeout` (30 minutes by default); a rejected or timed-out approval fails the step. Nothing limits the apply itself, because stopping a CloudFormation or Terraform run part-way can leave a half-applied stack or a locked state. Don't wrap these steps in a `timeout` unless it is longer than your slowest apply. These steps plan and apply in one call, so they suit approvals that are answered within minutes. For approvals that can wait hours or days, review the change before the pipeline runs (for example the plan in a pull request) and pass `approve: false`, or use a pipeline with its own approval stage and `agent none`; see [Parameters and Approval Gates](../fundamentals/parameters-and-approval-gates.md).

Parameter values go through the CLI's shorthand syntax, so values containing commas need the JSON form of `--parameters` instead. `--template-body` takes templates up to 51,200 bytes; larger ones need uploading to S3 and passing with `--template-url`.

The `tfplan` file holds any sensitive values from the plan in plain text. Don't archive or stash it, and let `cleanWs` remove it with the workspace.

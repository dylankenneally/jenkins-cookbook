# Add an Environment or AWS Account

How to add a new deploy target, such as a QA environment between dev and staging, or a new production region, to a pipeline that promotes one image through several AWS accounts. The cloud administrator creates the account, the infrastructure and a deploy role; you add a stage to the `Jenkinsfile` that assumes that role. The examples extend [Promote, Don't Rebuild](../pipelines/promote-across-environments.md) with a `qa` environment in account `444444444444`.

## Before you start

- The pipeline already deploys to at least one account with [`assumeRole`](../library/assume-role.md). If not, start with [How to Work with Promotions](promotions.md).
- You know the IAM ARN of the Jenkins identity behind the base AWS credential. The Jenkins administrator can tell you; it's needed for the trust policy.
- You've agreed with your team where the new environment sits in the promotion order and whether it needs an approval.

## 1. Ask the cloud administrator for the environment

Send something like this:

```text
Subject: New qa environment for my-backend-service

Service: my-backend-service, Amazon ECS (Fargate), region us-east-1
Position in promotion: after dev, before staging

Please create:
1. An AWS account (or isolated environment) for qa, with a VPC and an
   ECS cluster named qa
2. The ECS service my-backend-service with a task definition whose
   container is named "app", plus its task role and execution role
3. Environment config for qa (database URL, feature flags, secrets) in
   the task definition, Parameter Store or Secrets Manager, in the qa account
4. A deploy role, jenkins-deploy, that:
   - trusts the Jenkins identity: arn:aws:iam::123456789012:role/jenkins-ci
   - allows only the ECS deploy actions on this service (policy attached)
5. ECR cross-account pull: the repository policy on my-backend-service in
   the registry account should allow the qa execution role to pull
6. The deployment circuit breaker with rollback on the qa service

The Jenkins identity also needs sts:AssumeRole on
arn:aws:iam::444444444444:role/jenkins-deploy.

Please send back: the deploy role ARN, cluster name and service name.
```

## 2. What the cloud administrator sets up

These are starting points for the administrator, not a substitute for their review. Account IDs, role and resource names are placeholders.

The deploy role's trust policy lets the Jenkins identity assume it, and nothing else:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowJenkinsToAssume",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:role/jenkins-ci"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

The principal is whatever identity the base credential belongs to, a role or a user. Naming it exactly, rather than trusting the whole Jenkins account, means no other identity in that account can deploy.

The deploy role's permissions cover what [`ecsDeploy`](../library/ecs-deploy.md) calls. `RegisterTaskDefinition` and `DescribeTaskDefinition` don't support resource-level restrictions, so they use `*`; `iam:PassRole` is limited to this service's two roles and to ECS:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcsDeploy",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:UpdateService"
      ],
      "Resource": "arn:aws:ecs:us-east-1:444444444444:service/qa/my-backend-service"
    },
    {
      "Sid": "EcsTaskDefinitions",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PassServiceRoles",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::444444444444:role/my-backend-service-task",
        "arn:aws:iam::444444444444:role/my-backend-service-execution"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ecs-tasks.amazonaws.com"
        }
      }
    }
  ]
}
```

The image stays in the registry account. Its ECR repository policy lets the new account's execution role pull it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowQaPull",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::444444444444:role/my-backend-service-execution"
      },
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ]
    }
  ]
}
```

The execution role also needs `ecr:GetAuthorizationToken` in its own account, which the AWS managed `AmazonECSTaskExecutionRolePolicy` includes.

## 3. Add the deploy stage

Add a stage in the promotion order, using the role ARN, cluster and service the administrator sent back. Copy the shape of the neighbouring deploy stages so the new one behaves the same way:

```groovy
stage('Deploy QA') {
    agent any
    when {
        beforeAgent true
        branch 'main'
    }
    steps {
        // aborts older runs that haven't reached this point yet
        milestone(ordinal: 15)
        withAws {
            assumeRole(roleArn: 'arn:aws:iam::444444444444:role/jenkins-deploy') {
                ecsDeploy(
                    cluster: 'qa',
                    service: 'my-backend-service',
                    image: env.IMAGE_URI,
                    container: 'app'
                )
            }
        }
    }
}
```

Put it between `Deploy Dev` and `Approve Staging`. If you use milestones, pick an ordinal between the neighbouring stages' values.

If the environment needs a person to sign off before it changes, for example because testers use it, add an approval stage in front of it. Keep it out of any agent so the wait holds no executor:

```groovy
stage('Approve QA') {
    when {
        // off main, skip the prompt and its timeout entirely
        beforeOptions true
        branch 'main'
    }
    options {
        timeout(time: 1, unit: 'DAYS')
    }
    input {
        message 'Promote this image to qa?'
        ok 'Promote'
    }
    steps {
        echo "Promoting ${env.IMAGE_URI} to qa"
    }
}
```

Add `submitter` if only some people should be able to approve. See [Parameters & Approval Gates](../fundamentals/parameters-and-approval-gates.md).

## 4. Keep environment config outside the image

The same image runs in every environment, so nothing environment-specific can be baked into it. Settings that differ between accounts live in that account:

- plain settings as environment variables in the qa task definition
- secrets in Secrets Manager or Parameter Store in the qa account, referenced from the task definition's `secrets` section, so they never pass through Jenkins
- infrastructure differences (instance sizes, scaling) in the infrastructure code for that account

`ecsDeploy` copies the service's current task definition and changes only the image, so whatever the administrator configured for qa carries over on every deploy. Don't add `--build-arg ENV=qa` or a per-environment image tag; that is a different artifact per environment, which is what [build once, promote many](../concepts/build-once-promote-many.md) avoids.

## 5. Test the change

1. Open a pull request with the new stage. PR builds don't deploy, so this only checks the `Jenkinsfile` parses and the build still works.
2. After merging, watch the first `main` run reach `Deploy QA`. An `AccessDenied` on `sts:AssumeRole` means the trust policy or the Jenkins identity's permissions are missing; an `AccessDenied` on an `ecs:` or `iam:PassRole` action means the deploy role's permissions are. Send the exact error line to the cloud administrator.
3. A `CannotPullContainerError` in the ECS service events means the repository policy doesn't allow the qa execution role yet.
4. Once it deploys, update your team's list of environments and the build description helper, if you use one; see [How to Work with Promotions](promotions.md).

## Related

- [`assumeRole`](../library/assume-role.md)
- [`ecsDeploy`](../library/ecs-deploy.md)
- [Promote, Don't Rebuild](../pipelines/promote-across-environments.md)
- [How to Work with Promotions](promotions.md)
- [Build once, promote many](../concepts/build-once-promote-many.md)
- [Add a Secret or Credential](add-a-credential.md)
- [Roles and responsibilities](roles-and-responsibilities.md)

# `ecsDeploy`

Rolls an Amazon ECS service onto a new container image. It copies the service's current task definition, swaps the image for one container, registers the copy as a new revision, points the service at it and waits for the deployment to settle. Run it inside [`withAws`](with-aws.md), typically with the URI returned by [`dockerPushToEcr`](docker-push-to-ecr.md).

It needs the [Pipeline Utility Steps](https://plugins.jenkins.io/pipeline-utility-steps/) plugin for `readJSON` and `writeJSON`.

## `vars/ecsDeploy.groovy`

```groovy
/**
 * deploys a new image to an ecs service and returns the new task definition arn
 *  - cluster: cluster name or arn
 *  - service: service name
 *  - image: full image uri, e.g. the value returned by dockerPushToEcr
 *  - container: name of the container in the task definition to update
 */
String call(Map args) {
    ['cluster', 'service', 'image', 'container'].each {
        if (!args[it]) {
            error("ecsDeploy: '${it}' is required")
        }
    }

    String describeService = """
        aws ecs describe-services \
          --cluster '${args.cluster}' \
          --services '${args.service}' \
          --query 'services[0].taskDefinition' \
          --output text
    """
    String currentArn = sh(script: describeService, returnStdout: true).trim()
    if (!currentArn || currentArn == 'None') {
        error("ecsDeploy: service '${args.service}' not found in cluster '${args.cluster}'")
    }

    String describeTaskDefinition = """
        aws ecs describe-task-definition \
          --task-definition '${currentArn}' \
          --query taskDefinition \
          --output json
    """
    String taskDefinitionJson = sh(script: describeTaskDefinition, returnStdout: true).trim()
    // plain maps and lists rather than json-lib objects, so they serialise cleanly between steps
    Map taskDefinition = readJSON(text: taskDefinitionJson, returnPojo: true)

    Map container = taskDefinition.containerDefinitions.find { it.name == args.container }
    if (!container) {
        error("ecsDeploy: no container named '${args.container}' in ${currentArn}")
    }
    container.image = args.image

    // describe output includes fields register-task-definition rejects
    List<String> readOnlyFields = [
        'taskDefinitionArn',
        'revision',
        'status',
        'requiresAttributes',
        'compatibilities',
        'registeredAt',
        'registeredBy'
    ]
    readOnlyFields.each {
        taskDefinition.remove(it)
    }
    writeJSON(file: 'ecs-task-definition.json', json: taskDefinition, pretty: 2)

    String registerTaskDefinition = """
        aws ecs register-task-definition \
          --cli-input-json file://ecs-task-definition.json \
          --query 'taskDefinition.taskDefinitionArn' \
          --output text
    """
    String newArn = sh(script: registerTaskDefinition, returnStdout: true).trim()
    echo "Registered ${newArn}"

    sh """
        aws ecs update-service \
          --cluster '${args.cluster}' \
          --service '${args.service}' \
          --task-definition '${newArn}' \
          --query 'service.taskDefinition' \
          --output text
    """

    // polls every 15s and gives up after 10 minutes, exiting non-zero
    String waitForStable = """
        aws ecs wait services-stable \
          --cluster '${args.cluster}' \
          --services '${args.service}'
    """
    int status = sh(script: waitForStable, returnStatus: true)
    if (status != 0) {
        error("ecsDeploy: service '${args.service}' did not become stable on ${newArn}")
    }

    // a circuit breaker rollback also ends stable, but on the old revision
    String runningArn = sh(script: describeService, returnStdout: true).trim()
    if (runningArn != newArn) {
        error("ecsDeploy: service '${args.service}' is running ${runningArn}, not ${newArn} (rolled back?)")
    }

    echo "ECS service ${args.service} is stable on ${newArn}"
    return newArn
}
```

## Usage

```groovy
stage('Deploy') {
    steps {
        withAws {
            ecsDeploy(
                cluster: 'production',
                service: 'my-backend-service',
                image: env.IMAGE_URI,
                container: 'app'
            )
        }
    }
}
```

The `services-stable` waiter gives up after 10 minutes (40 checks, 15 seconds apart). A slow rollout, such as a large service or long health check grace period, can outlast it, so the step fails while ECS carries on deploying. Check the service events in the console before retrying.

> [!NOTE]
> Turn on the [deployment circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html) with rollback on the service (`--deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true}"`). ECS then rolls a failing deployment back to the last good revision by itself, and the step reports it as a failure because the service ended up on the old task definition.

Tags on the old revision aren't carried over. `describe-task-definition` only returns them with `--include TAGS`, and then beside the task definition rather than inside it, so they'd need merging into the JSON before registering.

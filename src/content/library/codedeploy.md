# `codeDeploy`

Bundles a deployment directory (with its `appspec.yml`), uploads it to S3, starts an AWS CodeDeploy deployment and waits for it to succeed. Run it inside [`withAws`](with-aws.md).

## `vars/codeDeploy.groovy`

```groovy
/**
 * deploys a revision with codedeploy and returns the deployment id
 *  - application, deploymentGroup: the codedeploy application and group
 *  - bucket: s3 bucket for revision bundles
 *  - source: directory holding appspec.yml and its scripts, e.g. 'deploy' (not the workspace root)
 *  - key: s3 key, defaults to '<application>/<BUILD_TAG>.zip'
 *  - wait: block until the deployment succeeds, defaults to true
 */
String call(Map args) {
    ['application', 'deploymentGroup', 'bucket', 'source'].each {
        if (!args[it]) {
            error("codeDeploy: '${it}' is required")
        }
    }

    if (!fileExists("${args.source}/appspec.yml")) {
        error("codeDeploy: no appspec.yml in '${args.source}'")
    }

    String key = args.key ?: "${args.application}/${env.BUILD_TAG}.zip"

    // deploy push zips the source dir and uploads it, so no plugin is needed and only that dir ships
    sh """
        aws deploy push \
          --application-name '${args.application}' \
          --s3-location 's3://${args.bucket}/${key}' \
          --source '${args.source}' \
          --ignore-hidden-files
    """

    String createDeployment = """
        aws deploy create-deployment \
          --application-name '${args.application}' \
          --deployment-group-name '${args.deploymentGroup}' \
          --s3-location 'bucket=${args.bucket},key=${key},bundleType=zip' \
          --query deploymentId \
          --output text
    """
    String deploymentId = sh(script: createDeployment, returnStdout: true).trim()
    echo "CodeDeploy deployment started: ${deploymentId}"

    if (args.wait == false) {
        return deploymentId
    }

    // the waiter polls every 15s for up to 30 minutes, and exits non-zero on failure or timeout
    String waitForSuccess = """
        aws deploy wait deployment-successful \
          --deployment-id '${deploymentId}'
    """
    int status = sh(script: waitForSuccess, returnStatus: true)
    if (status != 0) {
        sh """
            aws deploy get-deployment \
              --deployment-id '${deploymentId}' \
              --query 'deploymentInfo.[status, errorInformation]' \
              --output json
        """
        error("codeDeploy: deployment ${deploymentId} did not succeed")
    }

    echo "CodeDeploy deployment ${deploymentId} succeeded"
    return deploymentId
}
```

## Usage

```groovy
stage('Deploy') {
    steps {
        withAws {
            codeDeploy(
                application: 'my-app',
                deploymentGroup: 'production',
                bucket: 'my-codedeploy-artifacts-bucket',
                source: 'deploy'
            )
        }
    }
}
```

Keep `appspec.yml`, its hook scripts and the files to install in a dedicated directory such as `deploy/`. Bundling the workspace root would ship `.git`, build intermediates and anything else lying around.

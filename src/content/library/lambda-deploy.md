# `lambdaDeploy`

Updates an AWS Lambda function's code from a zip file or a container image, waits for the update to finish, publishes a version and optionally moves an alias onto it. Run it inside [`withAws`](with-aws.md).

## `vars/lambdaDeploy.groovy`

```groovy
/**
 * updates a lambda function's code and returns the published version ('$LATEST' if not publishing)
 *  - functionName: function name or arn
 *  - zipFile: path to a deployment package, e.g. 'build/function.zip'
 *  - imageUri: ecr image uri, for container image functions
 *    (exactly one of zipFile / imageUri)
 *  - publish: publish a new version, defaults to true
 *  - alias: alias to point at the new version, e.g. 'live' (optional, needs publish)
 */
String call(Map args) {
    if (!args.functionName) {
        error("lambdaDeploy: 'functionName' is required")
    }

    boolean hasZip = args.zipFile as boolean
    boolean hasImage = args.imageUri as boolean
    if (hasZip == hasImage) {
        error("lambdaDeploy: exactly one of 'zipFile' or 'imageUri' is required")
    }

    boolean publish = args.publish != false
    if (args.alias && !publish) {
        error("lambdaDeploy: 'alias' needs a published version, so it can't be used with publish: false")
    }

    // fileb:// sends the file as raw bytes rather than text
    String source = hasZip ? "--zip-file 'fileb://${args.zipFile}'" : "--image-uri '${args.imageUri}'"
    String publishFlag = publish ? '--publish' : ''

    String updateCode = """
        aws lambda update-function-code \
          --function-name '${args.functionName}' \
          ${source} \
          ${publishFlag} \
          --query Version \
          --output text
    """
    String version = sh(script: updateCode, returnStdout: true).trim()

    // polls every second for up to 5 minutes until LastUpdateStatus is Successful
    String waitForUpdate = """
        aws lambda wait function-updated-v2 \
          --function-name '${args.functionName}'
    """
    int status = sh(script: waitForUpdate, returnStatus: true)
    if (status != 0) {
        sh """
            aws lambda get-function-configuration \
              --function-name '${args.functionName}' \
              --query '[LastUpdateStatus, LastUpdateStatusReason]' \
              --output json
        """
        error("lambdaDeploy: update of '${args.functionName}' did not succeed")
    }
    echo "Lambda ${args.functionName} updated, version ${version}"

    if (!args.alias) {
        return version
    }

    sh """
        aws lambda update-alias \
          --function-name '${args.functionName}' \
          --name '${args.alias}' \
          --function-version '${version}'
    """
    echo "Alias ${args.alias} now points at version ${version}"
    return version
}
```

## Usage

```groovy
stage('Deploy') {
    steps {
        withAws {
            lambdaDeploy(
                functionName: 'my-function',
                zipFile: 'build/function.zip',
                alias: 'live'
            )
        }
    }
}
```

`update-alias` only moves an existing alias. Create it once with `aws lambda create-alias` (or in your infrastructure code) before the first deploy. Pointing callers and triggers at the alias rather than the bare function means each release is a published, immutable version you can move back to.

`function-updated-v2` needs a recent AWS CLI v2. On an older CLI use `function-updated`, which polls every 5 seconds for up to 5 minutes.

The zip upload is limited to 50 MB. Larger packages need uploading to S3 first and passing `--s3-bucket` and `--s3-key` instead of `--zip-file`.

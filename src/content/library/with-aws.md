# `withAws`

Runs a block with AWS credentials from the Jenkins credentials store and a default region, so the steps inside can call the AWS CLI without `--region` on every command. The other AWS building blocks expect to run inside it.

## `vars/withAws.groovy`

```groovy
/**
 * runs body with aws credentials bound and AWS_REGION / AWS_DEFAULT_REGION set
 *  - credentialsId: jenkins credential id, defaults to 'aws-credentials-id'
 *  - region: defaults to env.AWS_REGION
 */
def call(Map args = [:], Closure body) {
    String credentialsId = args.credentialsId ?: 'aws-credentials-id'
    String region = args.region ?: env.AWS_REGION
    if (!region) {
        error('withAws: no region given and AWS_REGION is not set')
    }

    List<String> regionEnv = ["AWS_REGION=${region}", "AWS_DEFAULT_REGION=${region}"]
    // exposes AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, masked in the console log
    Map awsBinding = [$class: 'AmazonWebServicesCredentialsBinding', credentialsId: credentialsId]

    withEnv(regionEnv) {
        withCredentials([awsBinding]) {
            body()
        }
    }
}
```

## Usage

```groovy
stage('Deploy') {
    steps {
        withAws(region: 'us-east-1') {
            sh 'aws sts get-caller-identity'
        }
    }
}
```

With `AWS_REGION` in the pipeline's `environment` block, a plain `withAws { … }` is enough. Pass `credentialsId:` to use a different AWS account.

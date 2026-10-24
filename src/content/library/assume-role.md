# `assumeRole`

Runs a block with short-lived credentials for another IAM role, typically a deploy role in a different AWS account. Run it inside [`withAws`](with-aws.md): the outer credentials are what call `sts assume-role`, and the region carries through.

## `vars/assumeRole.groovy`

```groovy
/**
 * runs body with temporary credentials for another iam role
 *  - roleArn: the role to assume, e.g. 'arn:aws:iam::210987654321:role/jenkins-deploy'
 *  - sessionName: shows in cloudtrail, defaults to BUILD_TAG
 *  - durationSeconds: defaults to 3600 (also the cap when the outer credentials are themselves a role)
 */
def call(Map args, Closure body) {
    if (!args.roleArn) {
        error("assumeRole: 'roleArn' is required")
    }

    // session names allow [\w+=,.@-] only
    String rawName = args.sessionName ?: env.BUILD_TAG
    String sessionName = rawName.replaceAll(/[^\w+=,.@-]/, '-')

    // and up to 64 characters; keep the end, where the build number is
    if (sessionName.length() > 64) {
        sessionName = sessionName.substring(sessionName.length() - 64)
    }

    int duration = (args.durationSeconds ?: 3600) as int

    String assume = """
        aws sts assume-role \
          --role-arn '${args.roleArn}' \
          --role-session-name '${sessionName}' \
          --duration-seconds ${duration} \
          --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
          --output text
    """
    // returnStdout output isn't written to the console log, and the command itself holds no secrets
    String output = sh(script: assume, returnStdout: true).trim()
    List<String> creds = output.split(/\s+/) as List
    if (creds.size() != 3) {
        // don't include the output in the message, it may hold part of a key
        error("assumeRole: unexpected output from sts assume-role for '${args.roleArn}'")
    }

    // these override the outer withAws keys for the body only
    List<String> roleEnv = [
        "AWS_ACCESS_KEY_ID=${creds[0]}",
        "AWS_SECRET_ACCESS_KEY=${creds[1]}",
        "AWS_SESSION_TOKEN=${creds[2]}"
    ]

    withEnv(roleEnv) {
        body()
    }
}
```

## Usage

```groovy
stage('Deploy to Production') {
    steps {
        withAws {
            assumeRole(roleArn: 'arn:aws:iam::210987654321:role/jenkins-deploy') {
                sh 'aws sts get-caller-identity'
                s3Sync(source: 'dist', bucket: 'my-production-bucket')
            }
        }
    }
}
```

The credential in Jenkins only needs permission to call `sts:AssumeRole` on the deploy roles. Each target account owns its own role and trust policy, so production access is granted (and revoked) in the production account, and nothing long-lived in Jenkins can touch it directly. The temporary keys expire on their own, so a leaked set is useful for an hour at most, unlike an access key that stays valid until someone rotates it.

> [!WARNING]
> Values passed to `withEnv` are not masked. If the body prints its environment (`env`, `printenv`, `set -x` on a line that expands the variables) the keys appear in the console log, and Jenkins records `withEnv` arguments with the build's step metadata. The keys are short-lived, which limits the damage, but treat the build record as sensitive while they are valid.

If the role is fixed per account rather than chosen at run time, the [AWS Credentials](https://plugins.jenkins.io/aws-credentials/) plugin can do this for you: set **IAM Role To Use** in the credential's advanced options, then pass that credential to `withAws(credentialsId: …)`. The plugin assumes the role and binds the temporary keys through `withCredentials`, which masks them in the log.

`durationSeconds` can't exceed the role's maximum session duration, and role chaining (assuming a role from credentials that are already a role session) is capped at one hour.

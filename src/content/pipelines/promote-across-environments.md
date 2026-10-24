# Promote, Don't Rebuild

Builds and pushes an image once, scans it, then deploys that same image URI to dev, staging and prod, each in its own AWS account, with an approval before staging and prod. Uses the [shared library](../library/setup.md) steps [`withAws`](../library/with-aws.md), [`assumeRole`](../library/assume-role.md), [`gitVersion`](../library/git-version.md), [`dockerPushToEcr`](../library/docker-push-to-ecr.md), [`ecrScan`](../library/ecr-scan.md), [`ecsDeploy`](../library/ecs-deploy.md), [`notifySlack`](../library/notify.md) and [`dockerCleanup`](../library/docker-cleanup.md). The approval gates are the ones from [parameters and approval gates](../fundamentals/parameters-and-approval-gates.md).

```groovy
@Library('cookbook@v1.2.0') _

pipeline {
    // no global agent, so the approval waits below hold no executor
    agent none

    options {
        // only the build stage needs the source; it checks out explicitly
        skipDefaultCheckout()
    }

    environment {
        AWS_REGION   = 'us-east-1'
        ECR_REGISTRY = '123456789012.dkr.ecr.us-east-1.amazonaws.com'
    }

    stages {
        stage('Build, Push & Scan') {
            agent {
                label 'docker'
            }
            steps {
                checkout scm
                withAws {
                    script {
                        env.VERSION = gitVersion()
                        env.IMAGE_URI = dockerPushToEcr(
                            registry: env.ECR_REGISTRY,
                            image: 'my-backend-service',
                            tag: env.VERSION
                        )
                    }
                    // stop here, before the image reaches any environment
                    ecrScan(
                        repository: 'my-backend-service',
                        tag: env.VERSION,
                        failOn: 'CRITICAL'
                    )
                }
            }
            post {
                // stage-level, because with agent none there is no workspace at the pipeline level
                cleanup {
                    dockerCleanup()
                    cleanWs()
                }
            }
        }

        stage('Deploy Dev') {
            agent any
            when {
                beforeAgent true
                branch 'main'
            }
            steps {
                // aborts older runs that haven't reached this point yet
                milestone(ordinal: 10)
                withAws {
                    assumeRole(roleArn: 'arn:aws:iam::111111111111:role/jenkins-deploy') {
                        ecsDeploy(
                            cluster: 'dev',
                            service: 'my-backend-service',
                            image: env.IMAGE_URI,
                            container: 'app'
                        )
                    }
                }
            }
        }

        stage('Approve Staging') {
            when {
                // off main, skip the prompt and its timeout entirely
                beforeOptions true
                branch 'main'
            }
            options {
                // options apply before input, so an ignored prompt aborts the run after a day
                timeout(time: 1, unit: 'DAYS')
            }
            input {
                message 'Promote this image to staging?'
                ok 'Promote'
            }
            steps {
                echo "Promoting ${env.IMAGE_URI} to staging"
            }
        }

        stage('Deploy Staging') {
            agent any
            when {
                beforeAgent true
                branch 'main'
            }
            steps {
                milestone(ordinal: 20)
                withAws {
                    assumeRole(roleArn: 'arn:aws:iam::222222222222:role/jenkins-deploy') {
                        ecsDeploy(
                            cluster: 'staging',
                            service: 'my-backend-service',
                            image: env.IMAGE_URI,
                            container: 'app'
                        )
                    }
                }
            }
        }

        stage('Approve Production') {
            when {
                beforeOptions true
                branch 'main'
            }
            options {
                timeout(time: 1, unit: 'DAYS')
            }
            input {
                message 'Promote this image to production?'
                ok 'Promote'
                submitter 'release-managers'
                submitterParameter 'APPROVED_BY'
            }
            steps {
                echo "Promoting ${env.IMAGE_URI} to production, approved by ${APPROVED_BY}"
            }
        }

        stage('Deploy Production') {
            agent any
            when {
                beforeAgent true
                branch 'main'
            }
            steps {
                milestone(ordinal: 30)
                withAws {
                    assumeRole(roleArn: 'arn:aws:iam::333333333333:role/jenkins-deploy') {
                        ecsDeploy(
                            cluster: 'production',
                            service: 'my-backend-service',
                            image: env.IMAGE_URI,
                            container: 'app'
                        )
                    }
                }
            }
        }
    }

    post {
        // also fires on an aborted or timed-out approval
        always {
            notifySlack(channel: '#deployments')
        }
    }
}
```

## Why not rebuild per environment

A build for staging and another for prod are two different artifacts, even from the same commit. Base image tags, package registries and build tools can all move between runs, so prod would get an image nobody tested in dev or staging, and the scan result from the first build no longer describes it. Building once and passing the URI along means each approval is for the exact bytes that already ran in the environment before it. It is also faster, and a rollback is just a redeploy of the previous tag.

## Notes

- Every branch builds and scans; only `main` deploys. `beforeAgent true` and `beforeOptions true` make the skipped stages cost nothing on other branches.
- `env.IMAGE_URI` is set once and read by every later stage, so no stage can pick up a different image. Turn on tag immutability for the ECR repository so the tag can't be overwritten after it was approved.
- The image lives in the account that owns the registry. The ECR repository policy has to let the task execution roles in the dev, staging and prod accounts pull it.
- Each `roleArn` is a deploy role in the target account that trusts the Jenkins identity used by `withAws`. Credentials from `assumeRole` are short-lived and only exist inside its block.
- With several runs waiting at an approval, approving an older one after a newer one would roll production back. The `milestone` at the start of each deploy stage (Pipeline: Milestone Step plugin) aborts older runs once a newer one passes it. The ordinals only need to increase through the pipeline. See [How to Work with Promotions](../guides/promotions.md).

For per-stage agents and executors, see [agents and labels](../fundamentals/agents-and-labels.md). For other `when` options, see [`when` conditions](../fundamentals/when-conditions.md).

---
tags: [docker, aws, deploy]
---

# Container Service: ECR & CodeDeploy

Builds a Docker image, pushes it to ECR, then rolls it out with CodeDeploy and waits for the result. Works for any stack whose build lives in its `Dockerfile` (Node.js, .NET, C++). Uses the [shared library](../library/setup.md) steps [`withAws`](../library/with-aws.md), [`gitVersion`](../library/git-version.md), [`dockerPushToEcr`](../library/docker-push-to-ecr.md), [`codeDeploy`](../library/codedeploy.md) and [`dockerCleanup`](../library/docker-cleanup.md).

```groovy
@Library('cookbook@v1.2.0') _

pipeline {
    agent any

    options {
        timeout(time: 30, unit: 'MINUTES')
    }

    environment {
        AWS_REGION   = 'us-east-1'
        ECR_REGISTRY = '123456789012.dkr.ecr.us-east-1.amazonaws.com'
    }

    stages {
        stage('Build & Push Image') {
            steps {
                withAws {
                    script {
                        // the version is unique to the commit, so branches can't push the same tag
                        env.VERSION = gitVersion()
                        env.IMAGE_URI = dockerPushToEcr(
                            registry: env.ECR_REGISTRY,
                            image: 'my-backend-service',
                            tag: env.VERSION
                        )
                    }
                }
            }
        }

        stage('Deploy') {
            when {
                branch 'master'
            }
            steps {
                // the appspec hooks read this to know which image to pull and run
                writeFile file: 'deploy/image.env', text: "IMAGE_URI=${env.IMAGE_URI}\n"
                withAws {
                    codeDeploy(
                        application: 'my-backend-service',
                        deploymentGroup: 'production',
                        bucket: 'my-deployment-bundles-bucket',
                        source: 'deploy'
                    )
                }
            }
        }
    }

    post {
        success {
            echo "Deployed ${env.IMAGE_URI}"
        }
        failure {
            echo 'Pipeline failed. Check stage logs for errors.'
        }
        // runs last, whatever the result, so a failed deploy still frees the agent's disk
        cleanup {
            dockerCleanup()
            cleanWs()
        }
    }
}
```

The `deploy/` directory in the repo holds `appspec.yml` and its hook scripts. Writing the image URI into it means the instances run exactly the image this build pushed, rather than whatever `latest` points to.

Every branch and pull request builds and pushes an image, but only `master` deploys. Without the `when` condition, any branch or pull request would roll its image out to production. The image tag comes from `gitVersion`, not `BUILD_NUMBER`: build numbers restart for each branch in a multibranch job, so `master` build 12 and `feature/x` build 12 would push the same tag. `gitVersion` needs the repository's tags in the workspace; see the warning on the [`gitVersion`](../library/git-version.md) page.

---
tags: [nodejs, aws, deploy]
---

# Static Frontend: S3 & CloudFront

Builds a Node.js frontend, syncs the output to an S3 bucket and invalidates the CloudFront cache. The build stages are the [Node.js recipe](../builds/nodejs.md); the deploy uses the [shared library](../library/setup.md) steps [`withAws`](../library/with-aws.md), [`s3Sync` and `cloudFrontInvalidate`](../library/s3-cloudfront.md).

```groovy
@Library('cookbook@v1.2.0') _

pipeline {
    agent any

    options {
        timeout(time: 30, unit: 'MINUTES')
    }

    environment {
        AWS_REGION = 'us-east-1'
    }

    stages {
        stage('Install, Build & Test') {
            steps {
                sh 'npm ci'
                sh 'npm run build'
                sh 'npm test'
            }
        }

        stage('Deploy') {
            when {
                branch 'master'
            }
            steps {
                withAws {
                    s3Sync(source: 'dist', bucket: 'my-frontend-app-bucket')
                    cloudFrontInvalidate(distributionId: 'EXXXXXXXXXXXXX')
                }
            }
        }
    }

    post {
        cleanup {
            cleanWs()
        }
    }
}
```

Every branch and pull request builds and tests, but only `master` deploys. Without the `when` condition, any branch or pull request would sync its output over the live site. To preview pull requests without touching production, see [Pull Request Previews](pr-preview.md).

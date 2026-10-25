---
tags: [git, aws, deploy]
---

# Pull Request Previews

Extends the [static frontend](static-frontend.md) so every pull request gets its own copy of the site under `previews/pr-<number>/`, with the link posted on the PR. `main` still deploys to production. Uses the [shared library](../library/setup.md) steps [`withAws`](../library/with-aws.md), [`s3Sync` and `cloudFrontInvalidate`](../library/s3-cloudfront.md); the PR handling is covered in [multibranch and pull requests](../fundamentals/multibranch-and-pull-requests.md).

```groovy
@Library('cookbook@v1.2.0') _

pipeline {
    agent any

    environment {
        AWS_REGION              = 'us-east-1'
        PREVIEW_BUCKET          = 'my-frontend-previews-bucket'
        PREVIEW_DISTRIBUTION_ID = 'EYYYYYYYYYYYYY'
    }

    stages {
        stage('Install & Test') {
            steps {
                sh 'npm ci'
                sh 'npm test'
            }
        }

        stage('Deploy Preview') {
            when {
                changeRequest()
            }
            environment {
                PREVIEW_PREFIX = "previews/pr-${env.CHANGE_ID}"
                PREVIEW_URL    = "https://previews.example.com/previews/pr-${env.CHANGE_ID}/"
            }
            steps {
                // the site is served from a sub-path, so asset urls need that base (vite's --base here)
                sh 'npm run build -- --base "/$PREVIEW_PREFIX/"'
                withAws {
                    s3Sync(source: 'dist', bucket: "${env.PREVIEW_BUCKET}/${env.PREVIEW_PREFIX}")
                    cloudFrontInvalidate(
                        distributionId: env.PREVIEW_DISTRIBUTION_ID,
                        paths: ["/${env.PREVIEW_PREFIX}/*"]
                    )
                }
                withCredentials([string(credentialsId: 'github-token', variable: 'GH_TOKEN')]) {
                    // edit the bot's last comment rather than adding one per push
                    sh '''
                        gh pr comment "$CHANGE_ID" \
                          --edit-last \
                          --create-if-none \
                          --body "Preview: $PREVIEW_URL"
                    '''
                }
                script {
                    currentBuild.description = env.PREVIEW_URL
                }
            }
        }

        stage('Deploy Production') {
            when {
                branch 'main'
            }
            steps {
                sh 'npm run build'
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

## Notes

- `changeRequest()` is true only in PR builds of a multibranch job, which is also where `CHANGE_ID` is set.
- Keep previews in their own bucket and CloudFront distribution, away from production. `s3Sync` deletes by default, but only under the prefix it is given, so one PR can't remove another's files.
- `gh` reads `GH_TOKEN` from the environment and works out the repo from the checkout's `origin` remote. `--edit-last` edits the token owner's latest comment, so use a dedicated bot account.
- The build description puts the link on the build page too, which is handy on servers other than GitHub.

> [!WARNING]
> A PR build runs the PR's own `npm` scripts with AWS and GitHub credentials in scope. Only build PRs from people you trust, or don't build forks at all. The branch source's fork trust setting controls which PRs are built.

## Tearing previews down

Jenkins has no built-in "PR closed" event in a multibranch job. When a PR is closed or merged, branch indexing notices it has gone and, depending on the orphaned item strategy, deletes the PR's job. No pipeline code runs at that point, so the preview stays in S3 until something removes it.

Removing one preview by hand:

```bash
aws s3 rm --recursive "s3://my-frontend-previews-bucket/previews/pr-123/"
```

There are two ways to make this automatic, and they combine well.

An S3 lifecycle rule expires everything under `previews/` after a fixed age:

```json
{
  "Rules": [
    {
      "ID": "expire-pr-previews",
      "Filter": {
        "Prefix": "previews/"
      },
      "Status": "Enabled",
      "Expiration": {
        "Days": 14
      }
    }
  ]
}
```

Apply it with `aws s3api put-bucket-lifecycle-configuration --bucket my-frontend-previews-bucket --lifecycle-configuration file://lifecycle.json`. Expiry counts from each object's upload, and `s3Sync` only uploads files that changed, so a long-lived PR can lose files it hasn't touched. The next build of that PR puts them back.

A separate cleanup job, on a cron [trigger](../fundamentals/triggers.md), removes previews whose PR is no longer open. Run this inside `withAws` with `GH_TOKEN` bound, in a single-quoted `sh '''...'''` block:

```bash
open_prs=$(gh pr list --state open --limit 1000 --json number --jq '.[].number')

aws s3 ls "s3://$PREVIEW_BUCKET/previews/" | awk '/PRE pr-/ {print $2}' | while read -r dir; do
    number=${dir#pr-}
    number=${number%/}

    if ! printf '%s\n' "$open_prs" | grep -qx "$number"; then
        aws s3 rm --recursive "s3://$PREVIEW_BUCKET/previews/$dir"
    fi
done
```

The cleanup job is the precise option; the lifecycle rule is the backstop if the job stops running.

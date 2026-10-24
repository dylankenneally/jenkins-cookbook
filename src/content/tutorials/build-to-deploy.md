# From Build to Deploy

This tutorial grows the pipeline from [Your First Pipeline](first-pipeline.md) into the [Static Frontend](../pipelines/static-frontend.md) pipeline. By the end, every branch and pull request builds and tests, and pushes to `main` also publish the site to an S3 bucket and refresh the CloudFront cache in front of it. It takes about 45 minutes of your time, plus the wait for the AWS resources and credential.

## Before you start

You need:

- the `Jenkinsfile` from [Your First Pipeline](first-pipeline.md), building green
- a frontend whose `npm run build` writes the site to a directory, `dist` in this tutorial
- an S3 bucket and CloudFront distribution for the site, created by your cloud administrator

From your cloud administrator, get the bucket name, the CloudFront distribution ID (it looks like `EXXXXXXXXXXXXX`), the AWS region and the site URL. Steps 2 and 3 cover what to ask your Jenkins administrator for.

## 1. Add a Build stage

Add a `Build` stage between `Install` and `Test`, so the pipeline produces the files it will deploy:

```groovy
stage('Build') {
    steps {
        sh 'npm run build'
    }
}
```

Push and check that the build is still green, and that the `Build` stage log shows your bundler writing to `dist`.

## 2. Load the shared library

A [shared library](../concepts/glossary.md) is a separate Git repo of pipeline steps that any `Jenkinsfile` can call by name. This cookbook's AWS and Docker steps, such as `withAws` and `s3Sync`, live in one, so every repo deploys the same tested way instead of copying shell scripts around. See [Shared Library Setup](../library/setup.md) for what's inside.

Your Jenkins administrator registers the library on the controller, under a name, once for everyone. You can't do this from a `Jenkinsfile`. Ask them:

```text
Is the cookbook shared library registered on our Jenkins?

- What name is it registered under? (the cookbook examples use "cookbook")
- Which version tags are available? We want to pin a tag rather than use the default branch.
```

Then add one line at the very top of the `Jenkinsfile`, above `pipeline {`:

```groovy
@Library('cookbook@v1.2.0') _
```

- `cookbook` is the name the library is registered under.
- `@v1.2.0` pins a tag, so a change to the library can't break your pipeline without you choosing to upgrade. Use a tag your Jenkins administrator gave you.
- The trailing `_` is required. The annotation needs something to attach to.

Push. The Console Output should now start with a line like `Loading library cookbook@v1.2.0`. If it shows `No library named cookbook found` or a similar error instead, check the name with your Jenkins administrator.

## 3. Get an AWS credential

The deploy needs AWS access keys. These must never go in the repo. Instead, Jenkins stores them as a [credential](../concepts/glossary.md) and your pipeline refers to it only by its ID. Jenkins hands the keys to the build at run time and masks them in the log.

You can't create the credential yourself, and it takes two people:

1. Your cloud administrator creates an IAM identity for the deploy with only the permissions it needs, and its access keys.
2. Your Jenkins administrator stores the keys in Jenkins as an AWS credential.

The `withAws` step looks for the ID `aws-credentials-id` unless you pass a different one, so ask for that ID. Many Jenkins installs scope credentials to a folder, so each team's `aws-credentials-id` points at its own AWS account.

Send your cloud administrator:

```text
Please create an IAM identity for Jenkins to deploy our frontend, and pass its access keys to the Jenkins administrator.

- S3 bucket: my-frontend-app-bucket
  - s3:ListBucket on the bucket
  - s3:PutObject and s3:DeleteObject on objects in the bucket
- CloudFront distribution: EXXXXXXXXXXXXX
  - cloudfront:CreateInvalidation and cloudfront:GetInvalidation on the distribution
```

Send your Jenkins administrator:

```text
Please store an AWS credential for our multibranch job.

- Kind: AWS Credentials (from the AWS Credentials plugin)
- ID: aws-credentials-id
- Scope: the folder or job for our repo, not global, if possible
- Keys: from the cloud administrator, for the IAM identity that deploys my-frontend-app-bucket
- Agents: our build agents need the AWS CLI v2 on the PATH
```

> [!WARNING]
> Don't paste access keys into chat, tickets or the `Jenkinsfile`. The keys go straight from the cloud administrator to the Jenkins administrator.

## 4. Add a Deploy stage

Add an `environment` block above `stages`, and a `Deploy` stage after `Test`:

```groovy
environment {
    // withAws reads the region from here
    AWS_REGION = 'us-east-1'
}
```

```groovy
stage('Deploy') {
    // pull requests and other branches build and test, but only main deploys
    when {
        branch 'main'
    }
    steps {
        withAws {
            s3Sync(source: 'dist', bucket: 'my-frontend-app-bucket')
            cloudFrontInvalidate(distributionId: 'EXXXXXXXXXXXXX')
        }
    }
}
```

Replace the region, bucket and distribution ID with the values from your cloud administrator.

What each step does:

- [`withAws`](../library/with-aws.md) binds the `aws-credentials-id` credential and sets the region for the steps inside it. Pass `credentialsId: 'another-id'` to use a different credential.
- [`s3Sync`](../library/s3-cloudfront.md) mirrors `dist` to the bucket, uploading changed files and deleting ones that no longer exist locally.
- [`cloudFrontInvalidate`](../library/s3-cloudfront.md) tells CloudFront to drop its cached copies and waits until it has, so a green build means visitors get the new files.

The `when { branch 'main' }` condition is what makes this safe in a multibranch job. Every branch and pull request runs the same `Jenkinsfile`. Without the condition, pushing a feature branch would deploy it over the live site. Pull requests build under names like `PR-42`, so the condition is false for them, even for a pull request into `main`. That also keeps the AWS credential away from code that hasn't been reviewed yet. See [`when` Conditions](../fundamentals/when-conditions.md) for other conditions.

> [!NOTE]
> If your default branch is called something other than `main`, use that name in the `when` condition.

Push your branch. The `Deploy` stage appears as skipped, because the branch isn't `main`. That is the expected result.

## 5. Add a timeout and cleanup

Two more blocks make the pipeline behave well on shared agents:

```groovy
options {
    // a hung build is aborted instead of holding an agent forever
    timeout(time: 30, unit: 'MINUTES')
}
```

```groovy
post {
    // cleanup runs last, whatever the result
    cleanup {
        cleanWs()
    }
}
```

- `options` sets behaviour for the whole run. `timeout` aborts it after 30 minutes. Pick a limit a little above your slowest normal build. [Options Defaults](../fundamentals/options-defaults.md) has more options worth adding.
- `post` at pipeline level runs after all the stages. `cleanWs()` deletes the workspace, so `node_modules` and `dist` don't fill the agent's disk. It needs the Workspace Cleanup plugin; if the build reports `No such DSL method 'cleanWs'`, ask your Jenkins administrator to install it.

The complete `Jenkinsfile` now looks like this:

```groovy
@Library('cookbook@v1.2.0') _

pipeline {
    agent {
        label 'linux'
    }

    options {
        // a hung build is aborted instead of holding an agent forever
        timeout(time: 30, unit: 'MINUTES')
    }

    environment {
        // withAws reads the region from here
        AWS_REGION = 'us-east-1'
    }

    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Test') {
            environment {
                JEST_JUNIT_OUTPUT_DIR = 'reports'
            }
            steps {
                sh '''
                    npm test -- \
                      --ci \
                      --reporters=default \
                      --reporters=jest-junit
                '''
            }
            post {
                always {
                    junit 'reports/junit.xml'
                }
            }
        }

        stage('Deploy') {
            // pull requests and other branches build and test, but only main deploys
            when {
                branch 'main'
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
        // cleanup runs last, whatever the result
        cleanup {
            cleanWs()
        }
    }
}
```

## 6. Verify the deploy

1. Open a pull request from your branch into `main`. The PR build should run `Install`, `Build` and `Test`, and skip `Deploy`.
2. Merge the pull request. The `main` branch job builds the merge commit.
3. Open that build and click the `Deploy` stage. Its log should show `aws s3 sync` uploading files, then `CloudFront invalidation started:` with an invalidation ID, and then the wait completing.
4. Open the site URL in a private browser window, so your browser's cache doesn't hide the change, and check that it shows the new version.

If the `Deploy` stage fails, the first error usually says what's wrong:

- `Could not find credentials entry with ID 'aws-credentials-id'`: the credential doesn't exist, or isn't visible to this job. Ask your Jenkins administrator to check its ID and scope.
- `AccessDenied` from `aws s3 sync` or `aws cloudfront`: the credential works but lacks a permission. Send the error line to your cloud administrator.
- `aws: command not found`: the agent doesn't have the AWS CLI. Ask your Jenkins administrator.

[Reading a Failed Build](reading-a-failed-build.md) covers how to find that first error.

## Next steps

- [Container Service](../pipelines/container-service.md) builds a Docker image, pushes it to ECR and rolls it out, for apps that run as containers.
- [Promotions](../guides/promotions.md) covers deploying the same build to several environments, such as dev, staging and production.
- [Onboard a New Repo](../guides/onboard-a-new-repo.md) is a checklist for bringing the next repo onto Jenkins.
- [Add a Credential](../guides/add-a-credential.md) covers requesting other credentials, such as API tokens.

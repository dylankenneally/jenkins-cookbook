# How to Work with Promotions

A promotion moves one built image through dev, staging and production, in that order, with an approval in front of each later stage. This guide covers setting that up for a service, approving a promotion, finding out what is deployed where, and the less common cases: promoting an older build, skipping an environment, and rolling back. It builds on the [Promote, Don't Rebuild](../pipelines/promote-across-environments.md) pipeline. For why the image is built only once, see [build once, promote many](../concepts/build-once-promote-many.md).

## Before you start

- Your service builds a Docker image and runs on Amazon ECS. For other targets the shape is the same; swap [`ecsDeploy`](../library/ecs-deploy.md) for the matching deploy step.
- The repo already has a multibranch job in Jenkins. If not, start with [Onboard a New Repo](onboard-a-new-repo.md).
- The `cookbook` shared library is registered on your Jenkins. See [Shared Library Setup](../library/setup.md).
- You know who your cloud administrator and Jenkins administrator are. See [roles and responsibilities](roles-and-responsibilities.md).

## 1. Ask the cloud administrator for the environments

Each environment should be its own AWS account, or at least its own isolated environment, so a mistake in dev can't touch production. The pipeline never holds long-lived keys for those accounts. It signs in with one base credential and assumes a deploy role in each target account for the length of the deploy.

Send your cloud administrator something like this:

```text
Subject: AWS environments for my-backend-service (dev, staging, production)

Service: my-backend-service
Runs on: Amazon ECS (Fargate), region us-east-1
Image registry: ECR repository my-backend-service in the shared tooling account

Please create or confirm, for each of dev, staging and production:
1. An AWS account (or isolated environment) for the stage
2. An ECS cluster and service for my-backend-service, with a task definition
   whose container is named "app"
3. A deploy role (suggested name: jenkins-deploy) that:
   - trusts the Jenkins identity (the Jenkins administrator can confirm its ARN)
   - allows only what an ECS deploy needs: ecs:DescribeServices,
     ecs:DescribeTaskDefinition, ecs:RegisterTaskDefinition, ecs:UpdateService,
     and iam:PassRole for this service's task role and execution role
4. Permission for the stage's task execution role to pull from the ECR
   repository (a repository policy in the registry account)
5. The deployment circuit breaker with rollback turned on for the service

Please send back for each stage: the account ID, deploy role ARN,
cluster name and service name.
```

[Add an Environment or AWS Account](add-an-environment.md) has an example trust policy and permissions policy if the administrator wants a starting point.

## 2. Ask the Jenkins administrator for the base credential

The base credential is the identity Jenkins uses to call `sts:AssumeRole`. It needs no other permissions. Many Jenkins installations already have one, used by every pipeline through [`withAws`](../library/with-aws.md) under the ID `aws-credentials-id`.

```text
Subject: AWS base credential for my-backend-service promotions

Repo: https://git.example.com/my-org/my-backend-service
Job folder: my-backend-service

Please confirm which AWS credential ID my pipeline should pass to withAws
(or whether the default aws-credentials-id applies), and the IAM ARN of the
identity behind it, so the cloud administrator can add it to the trust policy
of these deploy roles:

  arn:aws:iam::111111111111:role/jenkins-deploy   (dev)
  arn:aws:iam::222222222222:role/jenkins-deploy   (staging)
  arn:aws:iam::333333333333:role/jenkins-deploy   (production)

The base identity also needs sts:AssumeRole on those three role ARNs.
```

Never ask for, or accept, access keys in chat or a ticket. See [Add a Secret or Credential](add-a-credential.md).

## 3. Adapt the pipeline

Copy the `Jenkinsfile` from [Promote, Don't Rebuild](../pipelines/promote-across-environments.md) into the root of your repo and change these values:

| What | Where in the `Jenkinsfile` | Example |
| --- | --- | --- |
| Region | `AWS_REGION` in `environment` | `us-east-1` |
| Registry | `ECR_REGISTRY` in `environment` | `123456789012.dkr.ecr.us-east-1.amazonaws.com` |
| Image and repository name | `image:` in `dockerPushToEcr`, `repository:` in `ecrScan` | `my-backend-service` |
| Deploy role per stage | `roleArn:` in each `assumeRole` | `arn:aws:iam::111111111111:role/jenkins-deploy` |
| Cluster per stage | `cluster:` in each `ecsDeploy` | `dev`, `staging`, `production` |
| Service | `service:` in each `ecsDeploy` | `my-backend-service` |
| Container | `container:` in each `ecsDeploy` | `app` |
| Who approves production | `submitter` in `Approve Production` | `release-managers` |
| Notification channel | `notifySlack` in `post` | `#deployments` |

Role ARNs, account IDs and cluster names are identifiers, not secrets, so they can live in the `Jenkinsfile`. Keep them in the `environment` block if you'd rather see them in one place:

```groovy
environment {
    AWS_REGION       = 'us-east-1'
    ECR_REGISTRY     = '123456789012.dkr.ecr.us-east-1.amazonaws.com'
    DEV_ROLE_ARN     = 'arn:aws:iam::111111111111:role/jenkins-deploy'
    STAGING_ROLE_ARN = 'arn:aws:iam::222222222222:role/jenkins-deploy'
    PROD_ROLE_ARN    = 'arn:aws:iam::333333333333:role/jenkins-deploy'
}
```

Then pass `roleArn: env.DEV_ROLE_ARN` and so on. Environment-specific settings for the service itself (database URLs, feature flags, secrets) belong in each account's task definition or parameter store, not in the image or the `Jenkinsfile`. The same image has to run unchanged in every stage.

Open a pull request with the change. The PR build runs the build and scan stages only; deploys run from `main`.

## 4. Approve a promotion

When a `main` build reaches `Approve Staging` or `Approve Production`, it pauses and waits. The run holds no executor while it waits, and it aborts on its own after the one-day timeout.

To find the prompt:

1. Open the job for the `main` branch and click the running build.
2. Click **Paused for Input** in the left menu, or open **Console Output** and scroll to the bottom. Both show the message, such as "Promote this image to production?", with **Promote** and **Abort** buttons. The stage view on the job page also shows the paused stage; hovering over it offers the same buttons.
3. Check the image URI printed by the earlier stages, and that the stage before succeeded, then click **Promote**.

Who can approve:

- Without `submitter`, anyone with build permission on the job can approve. That is how `Approve Staging` is set up.
- With `submitter 'release-managers'`, only the listed users or groups can approve. The list is comma-separated and the names must match Jenkins user IDs or groups from your Jenkins security realm. Ask the Jenkins administrator which group names exist.
- Jenkins administrators can always approve, whatever `submitter` says.
- `submitterParameter 'APPROVED_BY'` records who clicked, and the pipeline echoes it to the log.

> [!TIP]
> If the Promote button isn't there for you, you aren't in the `submitter` list. Someone who is has to approve, or the list needs changing in a reviewed pull request.

## 5. See what's deployed where

Jenkins doesn't track deployments on its own, so make each build say what it did. Add a helper above the `pipeline` block that appends the environment to the build description:

```groovy
@Library('cookbook') _

// appends to the build description, e.g. "v1.4.0-3-g1a2b3c4 deployed to dev, staging"
void recordDeploy(String environment) {
    String current = currentBuild.description
    if (current) {
        currentBuild.description = "${current}, ${environment}"
    } else {
        currentBuild.description = "${env.VERSION} deployed to ${environment}"
    }
}

pipeline {
    // ...
}
```

Call it after each deploy succeeds:

```groovy
stage('Deploy Production') {
    // agent, when and steps as before
    post {
        success {
            script {
                recordDeploy('production')
            }
        }
    }
}
```

The description shows next to each build in the job's build history, so the history becomes a deploy log: the newest build that mentions production is what production should be running. The stage view on the job page shows the same thing as a grid of stages per build.

Images are tagged with the [`gitVersion`](../library/git-version.md) output, such as `v1.4.0-3-g1a2b3c4`, which names the commit (`1a2b3c4`). Don't add moving tags like `prod` to images. With tag immutability turned on in ECR they can't be moved, and without it they can be moved to an image nobody approved.

Jenkins records what was deployed; AWS knows what is running. To check, someone with read access to the account can run:

```sh
aws ecs describe-services \
  --cluster production \
  --services my-backend-service \
  --query 'services[0].taskDefinition' \
  --output text

aws ecs describe-task-definition \
  --task-definition '<task-definition-arn-from-above>' \
  --query 'taskDefinition.containerDefinitions[?name==`app`].image' \
  --output text
```

If you don't have that access, ask the cloud administrator for a read-only role in each account.

## 6. Promote an older build

If the older run is still waiting at an approval, you can approve it, but read the milestone section below first. Once a run has finished or timed out, its approval is gone, and the image URI was only set inside that run. To promote an existing image again, add a parameter that skips the build and uses a tag you give it:

```groovy
parameters {
    string(
        name: 'IMAGE_TAG',
        defaultValue: '',
        description: 'Promote an existing image tag instead of building. Leave empty to build this commit.'
    )
}
```

Guard the build stage so it only runs without a tag:

```groovy
stage('Build, Push & Scan') {
    agent {
        label 'docker'
    }
    when {
        beforeAgent true
        expression { !params.IMAGE_TAG }
    }
    // steps and post as before
}
```

Then add a stage straight after it that sets the URI from the tag:

```groovy
stage('Use Existing Image') {
    agent any
    when {
        beforeAgent true
        expression { params.IMAGE_TAG }
    }
    steps {
        script {
            // the tag ends up in shell commands, so accept only characters a docker tag can hold
            if (!(params.IMAGE_TAG ==~ /[A-Za-z0-9_.-]+/)) {
                error("IMAGE_TAG '${params.IMAGE_TAG}' is not a valid image tag")
            }
            env.VERSION = params.IMAGE_TAG
            env.IMAGE_URI = "${env.ECR_REGISTRY}/my-backend-service:${params.IMAGE_TAG}"
        }
        withAws {
            // fails the run if the tag was never pushed or has been cleaned up
            sh '''
                aws ecr describe-images \
                  --repository-name my-backend-service \
                  --image-ids imageTag="$IMAGE_TAG" \
                  --query 'imageDetails[0].imageDigest' \
                  --output text
            '''
        }
    }
}
```

To use it, open the `main` branch job, click **Build with Parameters**, enter the tag from the build description of the run you want (for example `v1.4.0-3-g1a2b3c4`) and start the build. It goes through dev, staging and production with the usual approvals. The parameter appears only after the first run that includes it.

> [!NOTE]
> The scan result is from when the image was built. New vulnerabilities may have been published since, so consider calling [`ecrScan`](../library/ecr-scan.md) in this stage too.

## 7. Skip an environment (not recommended)

The pipeline has no way to skip dev or staging, on purpose. Skipping one means:

- production gets an image that never ran in the environment before it, so the approval is for something untested
- the skipped environment falls behind production, and the next normal promotion tests a different change set from the one production will get
- the build history no longer shows a clean order of deploys, which makes incidents harder to reconstruct

For an urgent fix, use the normal path and approve quickly; dev and staging deploys usually take minutes. If your team decides it does need a skip, add it as a `booleanParam` checked in a `when` condition on the stage, restrict who can run it with `submitter` on the next approval, and get the change reviewed by the repo owner. Record every use in the build description.

## 8. Roll back

A rollback is a promotion of an older image, or a redeploy of an earlier task definition revision. Both are covered, with the other deploy targets, in [Roll Back a Bad Deploy](roll-back-a-deploy.md).

## 9. Stop older runs overtaking newer ones

Several `main` builds can be waiting at the same approval. If someone approves an older run after a newer one has already deployed, the older image replaces the newer one, which is an accidental rollback. The `milestone` step prevents this. When a run passes a milestone, Jenkins aborts any older run of the same job that hasn't passed it yet.

Add one at the start of each deploy stage, with increasing ordinals:

```groovy
stage('Deploy Staging') {
    agent any
    when {
        beforeAgent true
        branch 'main'
    }
    steps {
        // aborts older runs that haven't reached this point yet
        milestone(ordinal: 20)
        withAws {
            assumeRole(roleArn: env.STAGING_ROLE_ARN) {
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
```

Use `milestone(ordinal: 10)` in `Deploy Dev` and `milestone(ordinal: 30)` in `Deploy Production`. The ordinals only need to increase through the pipeline; gaps leave room for a stage added later. The step comes from the Pipeline: Milestone Step plugin, which is part of the standard Pipeline plugin set. If Jenkins reports `No such DSL method 'milestone'`, ask the Jenkins administrator to install it.

> [!NOTE]
> Promoting an older image with `IMAGE_TAG` isn't affected. The parameterised run is started after the others, so it counts as the newest run, and older runs waiting at an approval are aborted once it passes a milestone.

## Related

- [Promote, Don't Rebuild](../pipelines/promote-across-environments.md)
- [Parameters & Approval Gates](../fundamentals/parameters-and-approval-gates.md)
- [Add an Environment or AWS Account](add-an-environment.md)
- [Roll Back a Bad Deploy](roll-back-a-deploy.md)
- [`assumeRole`](../library/assume-role.md) and [`ecsDeploy`](../library/ecs-deploy.md)
- [Build once, promote many](../concepts/build-once-promote-many.md)
- [Release a version](release-a-version.md)

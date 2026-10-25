---
tags: [shared-library]
---

# Shared Library Setup

The Docker and AWS building blocks in this cookbook are [shared library](https://www.jenkins.io/doc/book/pipeline/shared-libraries/) steps. Each one is written once in its own repo and every `Jenkinsfile` calls it by name, rather than copying helper functions between repositories.

## Repository layout

Each file under `vars/` becomes a pipeline step named after the file, and its `call` method is what runs.

```text
jenkins-shared-library/
├── vars/
│   ├── withAws.groovy               # AWS credentials and region for a block
│   ├── assumeRole.groovy            # short-lived credentials for another IAM role
│   ├── dockerPushToEcr.groovy       # build, tag and push an image to ECR
│   ├── ecrScan.groovy               # fail on ECR scan findings above a severity
│   ├── dockerCleanup.groovy         # remove this build's images from the agent
│   ├── s3Sync.groovy                # sync a directory to an S3 bucket
│   ├── cloudFrontInvalidate.groovy  # invalidate a CloudFront distribution
│   ├── codeDeploy.groovy            # bundle, deploy and wait on CodeDeploy
│   ├── ecsDeploy.groovy             # roll an ECS service onto a new image
│   ├── lambdaDeploy.groovy          # update Lambda code, publish and move an alias
│   ├── cfnDeploy.groovy             # CloudFormation change set with approval
│   ├── terraformApply.groovy        # Terraform plan, approve, apply
│   ├── gitVersion.groovy            # version string from git describe
│   ├── sbom.groovy                  # CycloneDX SBOM with Syft, archived
│   ├── notifySlack.groovy           # build result to a Slack channel
│   ├── notifyTeams.groovy           # build result to a Teams channel
│   ├── withNodeCache.groovy         # npm cache outside the workspace
│   └── withNuGetCache.groovy        # NuGet packages outside the workspace
├── test/                            # JenkinsPipelineUnit tests
└── Jenkinsfile                      # tests the library itself
```

See [Testing the Shared Library](testing.md) for `test/` and the library's own `Jenkinsfile`.

## Registering the library

In **Manage Jenkins → System → Global Trusted Pipeline Libraries**, add the repo with the name `cookbook` and a default version (a branch or tag). Any pipeline can then load it with an annotation at the top of its `Jenkinsfile`:

```groovy
@Library('cookbook') _

pipeline {
    // ...
}
```

Pin a version with `@Library('cookbook@v1.2.0') _` so a library change can't break every pipeline at once. The trailing `_` is required; it gives the annotation something to attach to. Pinning a version other than the default needs **Allow default version to be overridden** turned on for the library. See [Change the Shared Library Safely](../guides/change-the-shared-library.md) for how versions are released.

## What the agents need

- the AWS CLI v2 and Docker on the agent's `PATH`, plus the Terraform CLI for `terraformApply`
- the [AWS Credentials](https://plugins.jenkins.io/aws-credentials/) plugin, with an AWS credential stored in Jenkins (the steps default to the ID `aws-credentials-id`)
- the [Pipeline Utility Steps](https://plugins.jenkins.io/pipeline-utility-steps/) plugin, for the `readJSON` / `writeJSON` used by `ecrScan` and `ecsDeploy`
- the [Slack Notification](https://plugins.jenkins.io/slack/) plugin for `notifySlack`
- the [Workspace Cleanup](https://plugins.jenkins.io/ws-cleanup/) plugin for `cleanWs()`

## The building blocks

- AWS access: [`withAws`](with-aws.md), [`assumeRole`](assume-role.md)
- Images: [`dockerPushToEcr`](docker-push-to-ecr.md), [`ecrScan`](ecr-scan.md), [`dockerCleanup`](docker-cleanup.md)
- Deploy targets: [`s3Sync` and `cloudFrontInvalidate`](s3-cloudfront.md), [`codeDeploy`](codedeploy.md), [`ecsDeploy`](ecs-deploy.md), [`lambdaDeploy`](lambda-deploy.md)
- Infrastructure: [`cfnDeploy` and `terraformApply`](infrastructure-deploy.md)
- Build metadata: [`gitVersion`](git-version.md), [`sbom`](sbom.md)
- Notifications: [`notifySlack` and `notifyTeams`](notify.md)
- Caching: [`withNodeCache` and `withNuGetCache`](dependency-cache.md)

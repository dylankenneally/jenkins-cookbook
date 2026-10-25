---
searchable: false
---

# Browse All Recipes

Every page in the `Jenkinsfile` Cookbook, grouped by layer. To look for something specific, press `Cmd+K` (or `Ctrl+K`) to search instead.

The tutorials and concepts get you started, the guides walk through common tasks, and the rest is reference: fundamentals cover pipeline features that work with any stack, build recipes cover one stack each, the building blocks are shared-library steps for Docker and AWS, and the composed pipelines put them together end to end. Each Docker or AWS action is written once, as a building block, and everything else calls it.

## New to Jenkins? Start here

Work through these in order. Together they take an afternoon, plus any wait for your Jenkins administrator.

1. [CI/CD in One Page](concepts/ci-cd-basics.md): what continuous integration and delivery are, and why the pipeline lives in the repo.
2. [Your First Pipeline](tutorials/first-pipeline.md): request a job, add a `Jenkinsfile`, publish test results, then break a test and fix it.
3. [How Jenkins Runs Your Pipeline](concepts/how-jenkins-runs-your-pipeline.md): controller, agents, executors and workspaces, and the errors each one explains.
4. [Reading a Failed Build](tutorials/reading-a-failed-build.md): find the failing stage, read from the first error, and know when to ask for help.
5. [From Build to Deploy](tutorials/build-to-deploy.md): grow the first pipeline into one that deploys a static site from `main`.

Keep the [Glossary](concepts/glossary.md) open while you read, and see [Roles and Responsibilities](guides/roles-and-responsibilities.md) for who to ask for what.

## Concepts

- [CI/CD in One Page](concepts/ci-cd-basics.md): continuous integration, delivery and deployment, pipelines as code, and keeping `main` green.
- [How Jenkins Runs Your Pipeline](concepts/how-jenkins-runs-your-pipeline.md): which machine and directory each line runs in, the queue, multibranch, and the errors each concept explains.
- [Build Once, Promote Many](concepts/build-once-promote-many.md): artifacts, immutable versions, environments, promotion versus rebuilding, and rollback.
- [Secrets in CI](concepts/secrets-in-ci.md): where credentials live, why masking isn't protection, short-lived credentials, and what to do after a leak.
- [Branches, Pull Requests and What Runs Where](concepts/branches-and-pull-requests.md): what branch, PR and tag builds are each for, and why deploys come only from `main` and tags.
- [Glossary](concepts/glossary.md): short definitions of the Jenkins and CI/CD terms used across the cookbook.

## Guides

Getting set up:

- [Onboard a New Repo](guides/onboard-a-new-repo.md): pick a recipe, add the `Jenkinsfile`, request the job and webhook, and require a green build on `main`.
- [Add a Secret or Credential](guides/add-a-credential.md): choose the type and scope, request it with a secure handover, use it safely, and rotate it.
- [Conventions](guides/conventions.md): the credential IDs, labels, tags, branch names and stage names the cookbook assumes, and which pipeline to copy for each project type.
- [Roles and Responsibilities](guides/roles-and-responsibilities.md): who owns what, and what to include when you request a change.

Shipping:

- [How to Work with Promotions](guides/promotions.md): set up dev, staging and prod, approve a promotion, see what's deployed where, and promote an older build.
- [Add an Environment or AWS Account](guides/add-an-environment.md): what the cloud administrator creates, then the new deploy stage.
- [Roll Back a Bad Deploy](guides/roll-back-a-deploy.md): roll back or fix forward, then the steps for ECS, CodeDeploy, Lambda and static sites.
- [Release a New Version](guides/release-a-version.md): choose the version, push an annotated tag, check the release, and ship a hotfix.
- [Ship a Mobile Build](guides/ship-a-mobile-build.md): signing, credentials and agents for a Play internal track and TestFlight.

Keeping pipelines healthy:

- [Troubleshooting](guides/troubleshooting.md): common pipeline errors, each with the symptom, cause and fix.
- [Speed Up a Slow Pipeline](guides/speed-up-a-pipeline.md): measure where the time goes, then parallelise, cache and cut agent hops.
- [Deal with a Flaky Test](guides/flaky-tests.md): confirm it, quarantine it without hiding it, and fix the usual causes.
- [Pipeline Review Checklist](guides/pipeline-review-checklist.md): what to check in a pull request that changes a `Jenkinsfile` or library step.
- [Change the Shared Library Safely](guides/change-the-shared-library.md): branch, test, try it from a pipeline, tag a version, and bump pins.

## Fundamentals

- [Pipeline Skeleton](fundamentals/pipeline-skeleton.md): the stage structure of a typical multi-stage CI workflow.
- [Options Defaults](fundamentals/options-defaults.md): `timeout`, `timestamps()`, `disableConcurrentBuilds()`, `buildDiscarder` and `ansiColor` for nearly every pipeline.
- [Environment Variables & Secure Credentials](fundamentals/environment-variables-and-secure-credentials.md): injecting environment variables and pulling secrets from the Jenkins credentials store without leaking them in logs.
- [Agents & Labels](fundamentals/agents-and-labels.md): labelled agents, `agent none` with per-stage agents, and Docker agents pinned to an exact image tag.
- [`when` Conditions](fundamentals/when-conditions.md): running stages by branch, tag, changeset or environment, and skipping the agent with `beforeAgent true`.
- [Parameters & Approval Gates](fundamentals/parameters-and-approval-gates.md): build parameters and a production `input` gate that waits without holding an executor.
- [Parallel Execution](fundamentals/parallel-execution.md): running independent test suites or multi-platform builds simultaneously to cut build times.
- [Matrix Builds](fundamentals/matrix-builds.md): the same stages across platform and version axes, including a CMake Linux + macOS matrix.
- [Stash & Unstash](fundamentals/stash-and-unstash.md): passing build output between stages on different agents, and when to use artifacts or S3 instead.
- [Retries & Error Handling](fundamentals/retries-and-error-handling.md): `retry`, `timeout`, `catchError`, `warnError` and `unstable` for flaky external steps, without hiding real failures.
- [Post-Actions & Status Notifications](fundamentals/post-actions-and-status-notifications.md): cleanup, artifact archiving, and conditional alerts based on whether the pipeline succeeded or failed.
- [Triggers](fundamentals/triggers.md): `cron` with `H` hashing, branch-only schedules, `pollSCM` versus webhooks, and `upstream` triggers.
- [Multibranch & Pull Requests](fundamentals/multibranch-and-pull-requests.md): `BRANCH_NAME` and the `CHANGE_*` variables, `changeRequest()`, and keeping deploys off pull requests.
- [`Jenkinsfile` Tips](fundamentals/tips.md): linting before you push, pinning versions, quoting secrets, CPS gotchas, Replay and Restart from Stage.

## Build recipes

Not sure which one you need? The [which pipeline to copy](guides/conventions.md) table maps project types to a build recipe and a composed pipeline.

- [Node.js](builds/nodejs.md): install from the lockfile with a cached download dir, audit gate, build, and test with JUnit results and Cobertura coverage.
- [.NET](builds/dotnet.md): restore, format gate, build, test with JUnit results and Coverlet coverage, publish, and pack/push a NuGet package.
- [C++ / CMake](builds/cpp-cmake.md): configure, build on every core and test with ctest, plus a sanitizer build, ccache, clang-tidy and Conan/vcpkg caching.
- [Java](builds/java.md): Maven Wrapper `verify` with Surefire/Failsafe results and JaCoCo coverage, the Gradle equivalent, JDK pinning, a shared local repo with file locking, and `deploy` with a managed settings.xml.
- [Android](builds/android.md): Android Lint through Warnings NG, unit tests, a pinned SDK on JDK 17, release signing from credentials, instrumented tests on an emulator or Firebase Test Lab, and Play publishing.
- [React Native](builds/react-native.md): JS checks on Linux, then parallel Android and iOS builds, with fastlane `match` or a temporary keychain for iOS signing, and Expo EAS as a cloud alternative.
- [Docker Image Builds](builds/docker.md): multi-stage Dockerfiles, a BuildKit layer cache in ECR, and multi-arch `amd64`/`arm64` images.
- [Lint & Static Analysis](builds/static-analysis.md): ESLint findings through Warnings NG with quality gates, and SonarQube analysis that waits on the quality gate.

## Shared library building blocks

Start with [Shared Library Setup](library/setup.md) for the repo layout, registering the library, and what the agents need.

- [`withAws`](library/with-aws.md): AWS credentials and region for a block of steps.
- [`assumeRole`](library/assume-role.md): short-lived credentials for another IAM role, for cross-account deploys.
- [`dockerPushToEcr`](library/docker-push-to-ecr.md): build, tag and push an image to ECR.
- [`ecrScan`](library/ecr-scan.md): wait for the ECR image scan and fail on findings at or above a severity, with Trivy as an alternative.
- [`dockerCleanup`](library/docker-cleanup.md): remove only this build's images from the agent.
- [`s3Sync` & `cloudFrontInvalidate`](library/s3-cloudfront.md): publish static assets and refresh the CDN.
- [`codeDeploy`](library/codedeploy.md): bundle a revision, deploy it with CodeDeploy and wait for the result.
- [`ecsDeploy`](library/ecs-deploy.md): register a task definition with the new image, update the service and wait until it's stable.
- [`lambdaDeploy`](library/lambda-deploy.md): update function code from a zip or image, publish a version and move an alias.
- [`cfnDeploy` & `terraformApply`](library/infrastructure-deploy.md): CloudFormation change sets and Terraform saved plans, each with an approval.
- [`gitVersion`](library/git-version.md): a version string from `git describe`, safe to use as an image tag.
- [`sbom`](library/sbom.md): generate and archive a CycloneDX SBOM with Syft.
- [`notifySlack` & `notifyTeams`](library/notify.md): post the build result to Slack or Teams.
- [`withNodeCache` & `withNuGetCache`](library/dependency-cache.md): keep npm and NuGet package caches outside the workspace.
- [Testing the Shared Library](library/testing.md): JenkinsPipelineUnit tests for `vars/` steps, plus the library repo's own `Jenkinsfile`.

## Composed pipelines

- [Container Service: ECR & CodeDeploy](pipelines/container-service.md): Docker image to ECR, rolled out by CodeDeploy.
- [Promote, Don't Rebuild](pipelines/promote-across-environments.md): build and scan one image, then promote the same URI through dev, staging and prod in separate AWS accounts.
- [Static Frontend: S3 & CloudFront](pipelines/static-frontend.md): Node.js build published to S3 behind CloudFront.
- [Pull Request Previews](pipelines/pr-preview.md): each PR's frontend on its own S3 prefix, linked from the PR, with teardown.
- [Tag-Triggered Release](pipelines/release.md): artifacts, SBOM and changelog published as a GitHub release, with the Gitea equivalent.
- [Monorepo: Build Only What Changed](pipelines/monorepo.md): per-package parallel stages gated by `changeset`, and a `git diff` fallback.
- [Nightly Build & Agent Maintenance](pipelines/nightly.md): full test suite, a dependency report, and a Docker prune on every agent.

Which shared-library building blocks each composed pipeline calls:

| Pipeline | Building blocks |
| --- | --- |
| [Container Service](pipelines/container-service.md) | [`withAws`](library/with-aws.md), [`dockerPushToEcr`](library/docker-push-to-ecr.md), [`codeDeploy`](library/codedeploy.md), [`dockerCleanup`](library/docker-cleanup.md) |
| [Promote, Don't Rebuild](pipelines/promote-across-environments.md) | [`withAws`](library/with-aws.md), [`assumeRole`](library/assume-role.md), [`gitVersion`](library/git-version.md), [`dockerPushToEcr`](library/docker-push-to-ecr.md), [`ecrScan`](library/ecr-scan.md), [`ecsDeploy`](library/ecs-deploy.md), [`dockerCleanup`](library/docker-cleanup.md), [`notifySlack`](library/notify.md) |
| [Static Frontend](pipelines/static-frontend.md) | [`withAws`](library/with-aws.md), [`s3Sync`, `cloudFrontInvalidate`](library/s3-cloudfront.md) |
| [Pull Request Previews](pipelines/pr-preview.md) | [`withAws`](library/with-aws.md), [`s3Sync`, `cloudFrontInvalidate`](library/s3-cloudfront.md) |
| [Tag-Triggered Release](pipelines/release.md) | [`gitVersion`](library/git-version.md), [`sbom`](library/sbom.md) |
| [Monorepo](pipelines/monorepo.md) | none |
| [Nightly](pipelines/nightly.md) | [`notifySlack`](library/notify.md) |

[`lambdaDeploy`](library/lambda-deploy.md), [`cfnDeploy` and `terraformApply`](library/infrastructure-deploy.md), [`notifyTeams`](library/notify.md) and the [dependency caches](library/dependency-cache.md) aren't used by a composed pipeline yet; their pages show them in a stage on their own.

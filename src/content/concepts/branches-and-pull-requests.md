# Branches, Pull Requests and What Runs Where

In a multibranch job, one `Jenkinsfile` serves every branch, pull request and tag. They shouldn't all do the same thing: a feature branch has no business deploying to production, and a release tag shouldn't skip the tests. This page explains what each kind of build is for and how that maps to stages. The mechanics are in [Multibranch & Pull Requests](../fundamentals/multibranch-and-pull-requests.md).

## Three kinds of build

**Branch build.** Runs when someone pushes to a branch, including `main`. On a feature branch it answers "does my work build and pass its tests?" On `main` it answers "is the shared code still healthy?" and, if so, is the starting point for deploys. `BRANCH_NAME` is the branch name.

**Pull request build.** Runs when a PR is opened or updated. It answers "would merging this break `main`?" By default Jenkins builds the PR merged with its target branch, so the tests see the result of merging, not just the branch on its own. The result is reported back to the PR as a status check. `BRANCH_NAME` is `PR-<number>` and the `CHANGE_*` variables describe the PR.

**Tag build.** Runs for a Git tag such as `v1.4.0`, when tag discovery and a build strategy are set up. It answers "produce the release for this exact version." Tags don't move, so a tag build is the natural source of versioned, published artifacts. `TAG_NAME` is the tag.

## Typical stages per build type

| Stage | Feature branch | Pull request | `main` | Tag |
| --- | --- | --- | --- | --- |
| Build | yes | yes | yes | yes |
| Unit tests, lint | yes | yes | yes | yes |
| Integration tests | optional | yes | yes | yes |
| Security scan | optional | yes | yes | yes |
| Preview environment | no | yes | no | no |
| Push artifact | no | no | yes | yes |
| Deploy dev | no | no | yes | no |
| Deploy staging, prod | no | no | after approval | optional, after approval |
| Publish release | no | no | no | yes |

The pattern: checks run everywhere, so problems show up as early as possible. Anything that changes shared state (pushing to a registry, deploying, publishing) runs only from `main` or tags. Some teams deploy staging and prod from `main` with approvals, others only from tags; pick one and stick to it.

Each row is a `when` condition on a stage: `changeRequest()` for PR-only stages, `branch 'main'` for deploys, `buildingTag()` or `tag 'v*'` for releases. See [`when` Conditions](../fundamentals/when-conditions.md), [Pull Request Previews](../pipelines/pr-preview.md) and [Tag-Triggered Release](../pipelines/release.md).

> [!TIP]
> Add `beforeAgent true` to `when` on stages that are often skipped, so skipping them doesn't wait for an executor first.

## Required status checks

Jenkins reports each PR build's result back to the Git host. On its own, that is only information: someone can still merge a PR with a red build.

Branch protection on the Git host makes it a rule. Mark the Jenkins check as **required** on `main`, and the host won't allow a merge until the latest PR build passes. Combined with "require branches to be up to date", it means nothing reaches `main` without having been built and tested against current `main`. That is what keeps `main` green; see [CI/CD in One Page](ci-cd-basics.md).

A few things to know:

- The check's name comes from Jenkins and the job setup. If the job is renamed or moved, the name can change and the required check will wait forever for a status that never arrives. Update the branch protection when that happens.
- Branch protection is configured on the Git host by a repository administrator, not in the `Jenkinsfile`.
- A required check is only as good as the stages behind it. If the PR build skips the tests, a green check means nothing.

Setting up a new repository, including the webhook and required check, is covered in [Onboard a New Repo](../guides/onboard-a-new-repo.md).

## Why deploys only come from `main` and tags

**Reviewed code only.** Code on `main` has been through a PR, review and a green build. Code on a feature branch has had none of that yet. Deploying from branches means deploying unreviewed code.

**One source of truth.** If any branch can deploy to staging, staging holds whatever was pushed last, and nobody knows which version is there. With deploys from `main` only, staging is always a recent `main`.

**Credentials stay contained.** Deploy credentials only need to be bound in stages that run on `main` and tags. A PR, possibly from a fork, never runs with them in scope. See [Secrets in CI](secrets-in-ci.md).

**A clear rollback target.** Every deployed version maps to a commit on `main` or a tag, so going back means redeploying an earlier artifact from the same line of history. See [Build Once, Promote Many](build-once-promote-many.md).

> [!WARNING]
> `when { branch 'main' }` is what keeps a deploy off PRs, because PR builds are named `PR-<number>`. Checking `CHANGE_TARGET == 'main'` instead would deploy every PR into `main`, which is the opposite of what you want.

## Related pages

- [Multibranch & Pull Requests](../fundamentals/multibranch-and-pull-requests.md): the variables and conditions.
- [How Jenkins Runs Your Pipeline](how-jenkins-runs-your-pipeline.md): what a multibranch job creates.
- [Triggers](../fundamentals/triggers.md): webhooks, and scheduled builds on some branches only.

---
tags: [conventions]
---

# Conventions

The names and defaults the rest of the cookbook assumes. Adopt them as they are, or override them, but pick one set per Jenkins controller and use it everywhere. Pipelines and library steps can then rely on a name instead of taking it as a parameter.

> [!NOTE]
> These are defaults, not rules your Jenkins already follows. Agree them with your Jenkins administrator before you rely on them. Your controller may already have different credential IDs, agent labels or a different library name, and theirs win.

## Credential IDs

- Kebab-case, in the form `<system>-<purpose>`: `github-token`, `slack-webhook`, `npm-publish-token`, `android-release-keystore`.
- `aws-credentials-id` is the one fixed name. It is the default for [`withAws`](../library/with-aws.md) and the steps that run inside it, so most pipelines never pass a `credentialsId`.
- Credentials are scoped to each team's folder. A job looks in its own folder before the global store, so the same ID can point at a different account per team, and one team's jobs can't see another's secrets.
- One credential per system and purpose. Sharing one secret across systems means rotating it breaks all of them at once.

Your Jenkins administrator creates and scopes credentials. See [Add a Credential](add-a-credential.md) and [Secrets in CI](../concepts/secrets-in-ci.md).

## Agent labels

| Label | Means |
| --- | --- |
| `linux` | a Linux agent with the common build tools |
| `macos` | a macOS agent, for Xcode and native macOS builds |
| `docker` | an agent with a Docker daemon, for Docker agents and image builds |
| `android` | an agent with the pinned Android SDK and JDK |

Combine labels with `&&` when a stage needs more than one, for example `label 'linux && docker'`. Never use `agent any`. See [Agents & Labels](../fundamentals/agents-and-labels.md).

## Image tags

- Tag images with a version (from [`gitVersion`](../library/git-version.md)) or the build number, so every deploy names exactly one build.
- Pin Docker agent images to an exact tag, such as `node:22.11.0`, not `node` or `node:22`.
- Never deploy `latest`. A moving tag can't tell you which build is running, and a rollback has nothing to roll back to.

See [Build Once, Promote Many](../concepts/build-once-promote-many.md).

## Branch names

| Branch or tag | Purpose | Deploys |
| --- | --- | --- |
| `main` | the integration branch, always releasable | yes, to the first environment |
| `feature/*` | short-lived work, merged by pull request | no |
| `release/*` | stabilising a release, when a team needs one | as agreed per repo |
| `vX.Y.Z` tags | a released version | yes, as the release |

Pull request builds never deploy. See [Branches and Pull Requests](../concepts/branches-and-pull-requests.md) and [Multibranch & Pull Requests](../fundamentals/multibranch-and-pull-requests.md).

## Library pinning

Load the shared library as `cookbook` and pin a tagged version, `@Library('cookbook@vX.Y.Z') _`. Unpinned, a library change reaches every pipeline at once. Upgrade the pin in a pull request like any other dependency. See [Shared Library Setup](../library/setup.md) and [Change the Shared Library](change-the-shared-library.md).

## Jenkinsfile location

One `Jenkinsfile` at the repo root, named exactly that. Multibranch jobs look there by default, so no job configuration is needed. A monorepo still has one root `Jenkinsfile`; see [Monorepo](../pipelines/monorepo.md).

## Stage names

Short verb phrases, in title case, the same across repos: `Install`, `Lint`, `Build`, `Test`, `Package`, `Publish`, `Deploy Dev`, `Approve Production`, `Deploy Production`. Consistent names make the stage view and build history readable to anyone on any repo.

## Timeouts

Every pipeline sets a `timeout` in `options`, a little above its slowest normal build. Every `input` stage sets its own. A hung build otherwise holds an executor until someone notices. See [Options Defaults](../fundamentals/options-defaults.md).

## All together

```groovy
@Library('cookbook@v1.2.0') _

pipeline {
    agent {
        label 'linux && docker'
    }

    options {
        // a hung build is aborted instead of holding the agent
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }

    stages {
        stage('Build') {
            steps {
                sh 'make build'
            }
        }

        stage('Test') {
            steps {
                sh 'make test'
            }
        }
    }
}
```

## Which pipeline to copy

Start from the build recipe for your stack, then the composed pipeline for how it ships.

| Project type | Build recipe | Pipeline |
| --- | --- | --- |
| Static website or single-page app | [Node.js](../builds/nodejs.md) | [Static Frontend](../pipelines/static-frontend.md), plus [Pull Request Previews](../pipelines/pr-preview.md) |
| Containerised service, one environment | [Docker Image Builds](../builds/docker.md) with the stack's recipe | [Container Service](../pipelines/container-service.md) |
| Containerised service, dev to prod | [Docker Image Builds](../builds/docker.md) with the stack's recipe | [Promote, Don't Rebuild](../pipelines/promote-across-environments.md) |
| .NET service or NuGet package | [.NET](../builds/dotnet.md) | [Promote, Don't Rebuild](../pipelines/promote-across-environments.md) or [Tag-Triggered Release](../pipelines/release.md) |
| Java service or library | [Java](../builds/java.md) | [Promote, Don't Rebuild](../pipelines/promote-across-environments.md) or [Tag-Triggered Release](../pipelines/release.md) |
| C++ tool or library | [C++ / CMake](../builds/cpp-cmake.md) | [Tag-Triggered Release](../pipelines/release.md) |
| Android app | [Android](../builds/android.md) | none yet; the build recipe covers signing and Play publishing |
| React Native app | [React Native](../builds/react-native.md) | none yet; the build recipe covers both platforms |
| Several packages in one repo | the recipe for each package | [Monorepo](../pipelines/monorepo.md) |
| Any repo, scheduled full run | the stack's recipe | [Nightly](../pipelines/nightly.md) |

Add [Lint & Static Analysis](../builds/static-analysis.md) to any of them. For a new repo end to end, see [Onboard a New Repo](onboard-a-new-repo.md).

---
tags: [git, declarative]
---

# Multibranch & Pull Requests

A Multibranch Pipeline job scans a repo and creates a child job for every branch, tag and pull request that has a `Jenkinsfile`. One `Jenkinsfile` then serves them all, and environment variables and `when` conditions decide what each kind of build does.

```groovy
pipeline {
    agent any

    options {
        // a new push to a branch or pr aborts the build of the commit it replaces
        disableConcurrentBuilds(abortPrevious: true)
    }

    stages {
        stage('Build & Test') {
            steps {
                sh 'make build'
                sh 'make test'
            }
        }

        stage('PR Checks') {
            when {
                changeRequest()
            }
            steps {
                echo "PR #${env.CHANGE_ID}: ${env.CHANGE_BRANCH} into ${env.CHANGE_TARGET}"
                sh 'make lint'
            }
        }

        stage('Deploy') {
            // prs build under their own name (PR-42), so this skips them
            when {
                beforeAgent true
                branch 'main'
            }
            steps {
                sh 'make deploy'
            }
        }
    }
}
```

## Branch and PR variables

| Variable | Set for | Example |
| --- | --- | --- |
| `BRANCH_NAME` | every build | `main`, `feature/login`, `PR-42` |
| `CHANGE_ID` | pull requests | `42` |
| `CHANGE_TARGET` | pull requests | `main` |
| `CHANGE_BRANCH` | pull requests | `feature/login` |
| `CHANGE_AUTHOR` | pull requests | the author's username |
| `CHANGE_URL` | pull requests | link to the PR on the Git host |
| `TAG_NAME` | tag builds | `v1.4.0` |

For a pull request, `BRANCH_NAME` is `PR-<number>`, not the source branch. Use `CHANGE_BRANCH` for the source branch and `CHANGE_TARGET` for the branch it merges into. The `CHANGE_*` variables are unset on branch builds, so `env.CHANGE_ID` is `null` there.

## Building PRs differently

- `when { changeRequest() }` is true for any pull request build.
- `when { changeRequest target: 'main' }` narrows it to PRs into `main`.
- `when { not { changeRequest() } }` runs only on branch and tag builds.
- `when { branch 'main' }` is false on PRs, even PRs into `main`, so deploy stages guarded by it never run from a PR.

In a `script` block, check `env.CHANGE_ID` directly:

```groovy
script {
    if (env.CHANGE_ID) {
        echo "Building PR #${env.CHANGE_ID} against ${env.CHANGE_TARGET}"
    } else {
        echo "Building branch ${env.BRANCH_NAME}"
    }
}
```

> [!WARNING]
> PR builds run code from the PR branch, which for public repos may come from a fork. Keep deploy credentials out of stages that run on PRs, and check the branch source's trust setting for forks.

## Notes

- By default the branch source builds a PR merged with its target branch, so tests see the result of merging. This is configurable under the source's discovery settings.
- Tags are only built if tag discovery is enabled on the branch source, and discovered tags are not built automatically unless a build strategy says so.
- A webhook from the Git host makes new branches and PRs appear straight away; otherwise they wait for the next periodic scan. See [triggers](triggers.md).

Per-PR environments are in [PR preview pipeline](../pipelines/pr-preview.md). The full list of conditions is on [`when` conditions](when-conditions.md).

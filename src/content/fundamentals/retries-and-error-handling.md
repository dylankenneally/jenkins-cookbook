---
tags: [declarative, troubleshooting]
---

# Retries & Error Handling

Steps that talk to the network (package registries, artifact stores, cloud APIs) fail now and then for reasons unrelated to your code. Jenkins has steps to retry them, cap how long they take, and mark a non-critical failure without stopping the run.

> [!WARNING]
> Every pattern here can hide a real problem. Retry only steps that are known to be flaky for external reasons, never the build or the tests. A test that passes on the second try is a flaky test to fix, not a pass.

```groovy
pipeline {
    agent any

    stages {
        stage('Install') {
            steps {
                // each attempt gets 5 minutes; a hung download is killed and tried again
                retry(3) {
                    timeout(time: 5, unit: 'MINUTES') {
                        sh 'npm ci'
                    }
                }
            }
        }

        stage('Build & Test') {
            steps {
                // no retry: a failure here is a real failure
                sh 'npm run build'
                sh 'npm test'
            }
        }

        stage('Upload Coverage') {
            steps {
                // a coverage service outage shouldn't fail the build, but the stage should show red
                catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
                    sh 'npm run coverage:upload'
                }
            }
        }

        stage('Audit') {
            steps {
                // vulnerabilities flag the build as unstable without blocking it
                warnError('npm audit found vulnerabilities') {
                    sh 'npm audit --audit-level=high'
                }
            }
        }
    }
}
```

## Retry and timeout order

- `retry(3) { timeout(...) { } }` gives each attempt its own limit, and a timed-out attempt is retried.
- `timeout(...) { retry(3) { } }` gives all attempts one shared limit.
- `retry(3)` means up to three attempts in total, not three retries after the first.
- Older Pipeline: Basic Steps plugin versions don't retry when a `timeout` inside `retry` fires. Update the plugin if timed-out attempts abort the run instead.
- There is no built-in delay between attempts. Add a `sleep` at the start of the block if the remote side needs a moment.

## Marking results

- `catchError(buildResult:, stageResult:)` catches a failure, sets the build and stage results you choose, and lets the run continue. With no arguments it sets the build to `FAILURE`, leaves the stage looking successful, and carries on, which is easy to miss in the UI; pass both arguments explicitly.
- `catchError` and `warnError` also catch aborts and `timeout` interruptions by default. Add `catchInterruptions: false` if clicking Abort should still stop the run.
- `warnError('message')` is shorthand for catching a failure and marking both build and stage `UNSTABLE`.
- `unstable('message')` marks the build and stage `UNSTABLE` without needing a failure, for example after a check you run yourself.
- `error('message')` fails the run on purpose.

```groovy
script {
    // npm outdated exits 1 when anything is behind; that's worth flagging, not failing
    int status = sh(script: 'npm outdated', returnStatus: true)
    if (status != 0) {
        unstable('some dependencies are outdated')
    }
}
```

## Retrying a whole stage

Stage `options` accept `retry`, which reruns the whole stage, including its agent allocation. Useful when an agent can drop out mid-stage, less so for a single flaky command.

```groovy
stage('Integration Tests') {
    options {
        retry(2)
        timeout(time: 20, unit: 'MINUTES')
    }
    steps {
        sh 'make integration-test'
    }
}
```

Pipeline-wide timeouts are on [options defaults](options-defaults.md). For reacting to the final result, see [post actions](post-actions-and-status-notifications.md).

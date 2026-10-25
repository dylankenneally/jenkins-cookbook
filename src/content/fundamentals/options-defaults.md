---
tags: [declarative]
---

# Options Defaults

A set of pipeline-level `options {}` worth adding to nearly every `Jenkinsfile`. They cap runaway builds, make logs easier to read and stop old builds from filling the controller's disk.

```groovy
pipeline {
    agent any

    options {
        // a hung build gets aborted instead of holding an executor forever
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
        // a newer push to the same branch aborts the build it replaces
        disableConcurrentBuilds(abortPrevious: true)
        buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5'))
        ansiColor('xterm')
    }

    stages {
        stage('Build') {
            steps {
                sh 'make build'
            }
        }
    }
}
```

## What each one does

- `timeout(time:, unit:)` aborts the whole run once the limit is reached. Units are `SECONDS`, `MINUTES`, `HOURS` and so on. Pick a limit a little above your slowest normal build.
- `timestamps()` prefixes every console line with the time it was written, which makes slow steps easy to spot. Needs the Timestamper plugin.
- `disableConcurrentBuilds()` stops two runs of the same job (or the same branch, in a multibranch job) from running at once. Without `abortPrevious: true` the newer run queues behind the older one; with it, the older run is aborted.
- `buildDiscarder(logRotator(...))` keeps only recent build records. `numToKeepStr` limits builds kept, `artifactNumToKeepStr` limits how many of them keep their archived artifacts. `daysToKeepStr` and `artifactDaysToKeepStr` work the same way by age.
- `ansiColor('xterm')` renders ANSI colour codes from tools like npm, CMake or dotnet instead of printing raw escape sequences. Needs the AnsiColor plugin.

## Stage-level options

Some options also work on a single stage, which is handy when one stage needs a tighter limit than the whole run.

```groovy
stage('Integration Tests') {
    options {
        timeout(time: 10, unit: 'MINUTES')
    }
    steps {
        sh 'make integration-test'
    }
}
```

> [!NOTE]
> `disableConcurrentBuilds` and `buildDiscarder` are pipeline-wide only. Stage `options` accept steps like `timeout`, `retry` and `timestamps`, plus `skipDefaultCheckout()`.

For retrying flaky steps rather than whole stages, see [retries and error handling](retries-and-error-handling.md). The full skeleton these options slot into is in [pipeline skeleton](pipeline-skeleton.md).

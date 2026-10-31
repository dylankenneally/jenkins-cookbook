---
description: A starting Jenkinsfile for a Declarative Pipeline with build and test stages, a timeout, timestamps, an environment block and workspace cleanup.
tags: [declarative]
---

# Pipeline Skeleton

This is your go-to template for a typical multi-stage CI workflow. Swap the `make` calls for your stack's commands; the build recipes have them for [Node.js](../builds/nodejs.md), [.NET](../builds/dotnet.md) and [C++/CMake](../builds/cpp-cmake.md).

```groovy
pipeline {
    agent {
        label 'linux'
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }

    environment {
        CI = 'true'
    }

    stages {
        // no checkout stage: a pipeline loaded from SCM, as in a multibranch job, checks out the commit before the first stage
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

    post {
        cleanup {
            cleanWs()
        }
    }
}
```

`options`, `environment` and `post` sit around the stages. See [Options Defaults](options-defaults.md) for more options, [Environment Variables and Secure Credentials](environment-variables-and-secure-credentials.md) for `environment`, and [Post-Actions and Status Notifications](post-actions-and-status-notifications.md) for `post`. `cleanWs` needs the Workspace Cleanup plugin.

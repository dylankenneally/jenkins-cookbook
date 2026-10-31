---
tags: [declarative, performance]
---

# Parallel Execution (Speed Booster)

If you want to cut down build times by running independent test suites or multi-platform builds simultaneously.

```groovy
pipeline {
    agent none
    stages {
        stage('Parallel Test Suites') {
            failFast true
            parallel {
                stage('Unit Tests') {
                    agent {
                        label 'linux'
                    }
                    steps {
                        sh 'npm ci'
                        sh 'npm run test:unit'
                    }
                }
                stage('Integration Tests') {
                    agent {
                        label 'linux'
                    }
                    steps {
                        sh 'npm ci'
                        sh 'npm run test:integration'
                    }
                }
                stage('Lint Check') {
                    agent {
                        label 'linux'
                    }
                    steps {
                        sh 'npm ci'
                        sh 'npm run lint'
                    }
                }
            }
        }
    }
}
```

Each parallel stage declares its own `agent`, so the three run on separate executors, each with its own workspace and checkout. That is why each one installs its own dependencies. Without a stage-level `agent`, parallel stages share the executor and workspace of the pipeline's top-level `agent`, and the work runs side by side on one machine rather than spreading out. `failFast true` aborts the other stages as soon as one fails. When the stages differ only by platform or version, a [Matrix Builds](matrix-builds.md) section is shorter. See [Agents and Labels](agents-and-labels.md) for labels.

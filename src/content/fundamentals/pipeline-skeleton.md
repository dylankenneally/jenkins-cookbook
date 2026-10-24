# Pipeline Skeleton

This is your go-to template for a typical multi-stage CI workflow. Swap the `make` calls for your stack's commands; the build recipes have them for [Node.js](../builds/nodejs.md), [.NET](../builds/dotnet.md) and [C++/CMake](../builds/cpp-cmake.md).

```groovy
pipeline {
    agent any
    stages {
        // no checkout stage: declarative pipelines check out scm automatically before the first stage
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

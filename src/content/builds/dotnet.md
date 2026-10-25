---
tags: [dotnet, testing]
---

# .NET Build, Test & Publish

Handles multi-stage builds for modern .NET applications, runs unit tests, and outputs a deployment-ready package.

```groovy
pipeline {
    agent any
    stages {
        stage('Restore & Build') {
            steps {
                sh 'dotnet restore'
                sh 'dotnet build --configuration Release --no-restore'
            }
        }
        stage('Test') {
            steps {
                // jenkins' junit step can't read .trx, so log in junit format instead
                sh '''
                    dotnet test \
                      --configuration Release \
                      --no-build \
                      --logger "junit;LogFilePath=TestResults/{assembly}.xml"
                '''
            }
            post {
                always {
                    // Publishes test results back to Jenkins
                    junit '**/TestResults/*.xml'
                }
            }
        }
        stage('Publish') {
            steps {
                sh '''
                    dotnet publish src/MyApp.csproj \
                      --configuration Release \
                      --output ./publish \
                      --no-build
                '''
            }
        }
    }
}
```

The `junit` logger comes from the [`JunitXml.TestLogger`](https://www.nuget.org/packages/JunitXml.TestLogger) package, which each test project needs as a reference. The alternative is keeping `trx` and publishing it with the MSTest plugin.

To keep restored NuGet packages on the agent between builds, wrap `dotnet restore` in `withNuGetCache` from the [dependency cache](../library/dependency-cache.md) building block.

## Format gate

```groovy
stage('Format') {
    steps {
        // exits non-zero if any file would be reformatted, without changing anything
        sh 'dotnet format --verify-no-changes --no-restore'
    }
}
```

Run it after `dotnet restore`. The rules come from `.editorconfig` and the SDK version, so pin the SDK with `global.json` to stop an agent upgrade from failing builds on its own.

## Coverage

Coverlet's data collector writes Cobertura XML when the tests run with `--collect:"XPlat Code Coverage"`. Each test project needs a reference to the [`coverlet.collector`](https://www.nuget.org/packages/coverlet.collector) package; the xUnit project template already includes it.

```groovy
stage('Test') {
    steps {
        sh '''
            dotnet test \
              --configuration Release \
              --no-build \
              --logger "junit;LogFilePath=TestResults/{assembly}.xml" \
              --collect:"XPlat Code Coverage"
        '''
    }
    post {
        always {
            junit '**/TestResults/*.xml'
            // coverlet writes one file per test project, under a guid-named folder
            recordCoverage(
                tools: [[parser: 'COBERTURA', pattern: '**/TestResults/**/coverage.cobertura.xml']]
            )
        }
    }
}
```

`recordCoverage` comes from the Coverage plugin and merges the files into one report.

## Publishing a NuGet package

```groovy
stage('Pack & Push') {
    when {
        branch 'main'
    }
    steps {
        sh '''
            dotnet pack src/MyLibrary/MyLibrary.csproj \
              --configuration Release \
              --no-build \
              --output ./artifacts \
              -p:PackageVersion=1.0.$BUILD_NUMBER
        '''
        withCredentials([string(credentialsId: 'nuget-api-key', variable: 'NUGET_API_KEY')]) {
            // single quotes: the shell expands the key, groovy never sees it
            sh '''
                dotnet nuget push 'artifacts/*.nupkg' \
                  --api-key "$NUGET_API_KEY" \
                  --source https://api.nuget.org/v3/index.json \
                  --skip-duplicate
            '''
        }
    }
}
```

`withCredentials` comes from the Credentials Binding plugin. `--skip-duplicate` treats an already-published version as success, so re-running a build doesn't fail the stage. A `.snupkg` symbols package next to the `.nupkg` is pushed along with it. Point `--source` at a private feed URL to publish internally instead.

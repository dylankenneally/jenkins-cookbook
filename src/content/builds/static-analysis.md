---
tags: [code-quality]
---

# Lint & Static Analysis

Publishes linter findings into Jenkins with the Warnings Next Generation plugin, gates the build on the number of issues, and runs a SonarQube analysis that waits for the server's quality gate.

## ESLint

The Warnings Next Generation plugin's `recordIssues` step reads ESLint's `json` output, which is the format it recommends. The `checkstyle` formatter it used to read was removed from ESLint 9 core and now ships separately as `eslint-formatter-checkstyle`.

```groovy
stage('Lint') {
    steps {
        sh '''
            npx eslint . \
              --format json \
              --output-file eslint.json
        '''
    }
    post {
        always {
            // warnings next generation plugin; always, so findings show even when eslint fails the stage
            recordIssues(
                enabledForFailure: true,
                tools: [esLint(pattern: 'eslint.json')]
            )
        }
    }
}
```

ESLint exits non-zero when it finds errors, so errors fail the stage on their own and warnings don't. The issues page shows each finding against its source line, with trends across builds.

## Quality gates

A quality gate sets the build result from the issue count, which covers warnings too. This marks the build unstable as soon as there is one issue:

```groovy
recordIssues(
    enabledForFailure: true,
    tools: [esLint(pattern: 'eslint.json')],
    qualityGates: [[threshold: 1, type: 'TOTAL', criticality: 'UNSTABLE']]
)
```

`criticality` is usually `UNSTABLE` or `FAILURE`. Older examples write `unstable: true` instead; it is deprecated in current plugin versions. Other `type` values include `TOTAL_ERROR`, `TOTAL_HIGH` and `NEW`. `NEW` counts only issues that weren't in the reference build, which lets an existing codebase adopt a zero-new-issues rule without fixing everything first:

```groovy
// git forensics plugin; picks the matching build of the target branch as the baseline
discoverGitReferenceBuild()
recordIssues(
    enabledForFailure: true,
    tools: [esLint(pattern: 'eslint.json')],
    qualityGates: [[threshold: 1, type: 'NEW', criticality: 'FAILURE']]
)
```

The same step reads other tools, for example `clangTidy()` for [C++](cpp-cmake.md) and `msBuild()` for compiler warnings in a [.NET](dotnet.md) build log.

## SonarQube

Needs the SonarQube Scanner for Jenkins plugin, with a server named `sonar` under Manage Jenkins > System, and the `sonar-scanner` CLI on the agent (pinned). Project settings live in `sonar-project.properties` in the repo.

```groovy
stage('SonarQube Analysis') {
    steps {
        // injects the server url and token configured for 'sonar'
        withSonarQubeEnv('sonar') {
            sh 'sonar-scanner'
        }
    }
}
stage('Quality Gate') {
    steps {
        // the server reports the result through a webhook; the timeout stops a lost webhook hanging the build
        timeout(time: 10, unit: 'MINUTES') {
            waitForQualityGate abortPipeline: true
        }
    }
}
```

`waitForQualityGate` depends on a SonarQube webhook pointing at `https://<jenkins>/sonarqube-webhook/`. Without it, the step waits until the timeout. `abortPipeline: true` fails the build when the gate fails.

For other build tools, run their scanner inside the same `withSonarQubeEnv` block: `mvn sonar:sonar` for Maven, or `dotnet sonarscanner begin`, `dotnet build` and `dotnet sonarscanner end` for .NET. SonarQube's JavaScript analysis reads coverage from lcov, so add the `lcov` reporter to the [Node.js](nodejs.md) coverage run and set `sonar.javascript.lcov.reportPaths=coverage/lcov.info`.

> [!TIP]
> Run the linters in parallel with the tests; see [parallel execution](../fundamentals/parallel-execution.md).

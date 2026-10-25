---
tags: [nodejs, testing]
---

# Node.js Build & Test

Installs dependencies from the lockfile, builds, and runs the test suite. To ship the output to S3 and CloudFront, see the [static frontend pipeline](../pipelines/static-frontend.md).

```groovy
pipeline {
    agent any
    stages {
        stage('Install') {
            steps {
                // ci installs exactly what's in package-lock.json, and fails if it's out of date
                sh 'npm ci'
            }
        }
        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
        stage('Test') {
            steps {
                sh 'npm test'
            }
        }
    }
}
```

To run unit tests, integration tests and lint side by side, see [parallel execution](../fundamentals/parallel-execution.md).

## Dependency cache

`npm ci` deletes `node_modules` and downloads every package again. Wrapping it in `withNodeCache` from the [dependency cache](../library/dependency-cache.md) building block keeps npm's download cache on the agent between builds.

```groovy
stage('Install') {
    steps {
        withNodeCache {
            sh 'npm ci'
        }
    }
}
```

## Audit gate

```groovy
stage('Audit') {
    steps {
        // exits non-zero when any advisory is rated high or critical
        sh 'npm audit --audit-level=high'
    }
}
```

The stage fails the build when a dependency has a known high or critical vulnerability. Advisories are fetched from the registry at build time, so a build can start failing without a code change. Add `--omit=dev` to check only production dependencies.

## Test results

Jest needs the [`jest-junit`](https://www.npmjs.com/package/jest-junit) reporter as a pinned dev dependency (`npm install --save-dev --save-exact jest-junit@16.0.0`). Vitest has a JUnit reporter built in. Both results are published with the `junit` step from the JUnit plugin.

```groovy
stage('Test') {
    environment {
        // jest-junit reads its output location from the environment
        JEST_JUNIT_OUTPUT_DIR = 'reports'
    }
    steps {
        // default keeps the normal console output alongside the junit file
        sh '''
            npx jest \
              --ci \
              --reporters=default \
              --reporters=jest-junit
        '''
    }
    post {
        always {
            junit 'reports/junit.xml'
        }
    }
}
```

With Vitest, the `Test` stage runs this instead and publishes the same file:

```groovy
sh '''
    npx vitest run \
      --reporter=default \
      --reporter=junit \
      --outputFile.junit=reports/junit.xml
'''
```

With `junit` as the only reporter, a plain `--outputFile=reports/junit.xml` is enough; the `.junit` suffix tells Vitest which reporter the file belongs to when there are several.

## Coverage

The Coverage plugin reads Cobertura XML but not lcov, so have the test runner write Cobertura. Jest and Vitest both name the file `coverage/cobertura-coverage.xml`.

```groovy
stage('Test') {
    steps {
        // text prints a summary to the console, cobertura is what jenkins reads
        sh '''
            npx jest \
              --ci \
              --coverage \
              --coverageReporters=text \
              --coverageReporters=cobertura
        '''
    }
    post {
        always {
            // coverage plugin
            recordCoverage(
                tools: [[parser: 'COBERTURA', pattern: 'coverage/cobertura-coverage.xml']]
            )
        }
    }
}
```

For Vitest, install a pinned `@vitest/coverage-v8` matching the Vitest version and run:

```groovy
sh '''
    npx vitest run \
      --coverage.enabled \
      --coverage.reporter=text \
      --coverage.reporter=cobertura
'''
```

To mark the build unstable below a threshold, add a quality gate:

```groovy
recordCoverage(
    tools: [[parser: 'COBERTURA', pattern: 'coverage/cobertura-coverage.xml']],
    qualityGates: [[threshold: 80.0, metric: 'LINE', baseline: 'PROJECT', criticality: 'UNSTABLE']]
)
```

Keep `lcov` in the reporter list as well if SonarQube reads the coverage, since its JavaScript analysis takes lcov. See [lint & static analysis](static-analysis.md).

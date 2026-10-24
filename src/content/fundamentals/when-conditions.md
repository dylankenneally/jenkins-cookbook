# `when` Conditions

The `when {}` directive decides whether a stage runs. A skipped stage shows as skipped in the UI rather than failed, so one `Jenkinsfile` can build every branch and only deploy from some of them.

```groovy
pipeline {
    agent any

    environment {
        DEPLOY_TO = 'staging'
    }

    stages {
        stage('Build') {
            steps {
                sh 'make build'
            }
        }

        stage('Docs') {
            // only rebuild docs when something under docs/ changed
            when {
                changeset 'docs/**'
            }
            steps {
                sh 'make docs'
            }
        }

        stage('Deploy Staging') {
            when {
                allOf {
                    branch 'main'
                    environment name: 'DEPLOY_TO', value: 'staging'
                }
            }
            steps {
                sh 'make deploy-staging'
            }
        }

        stage('Release') {
            when {
                tag pattern: 'v\\d+\\.\\d+\\.\\d+', comparator: 'REGEXP'
            }
            steps {
                sh 'make release'
            }
        }
    }
}
```

## Branches and tags

- `branch 'main'` matches `env.BRANCH_NAME`. Patterns are globs by default, so `branch 'release/*'` matches every release branch. Add `comparator: 'REGEXP'` for a regular expression.
- `buildingTag()` is true for any tag build.
- `tag 'v*'` matches the tag name as a glob. `tag pattern: '...', comparator: 'REGEXP'` does the same with a regular expression.

These only work in multibranch jobs, which set `BRANCH_NAME` and `TAG_NAME`. Tag builds also need tag discovery enabled on the branch source. See [multibranch and pull requests](multibranch-and-pull-requests.md).

## Changesets

`changeset 'src/**'` is true when any file in the build's changelog matches the glob. Useful in a [monorepo](../pipelines/monorepo.md) to skip work for untouched parts.

> [!WARNING]
> The changelog is the set of commits since the previous build of this job. The first build of a new branch has an empty changelog, so a `changeset` stage is skipped there. Don't rely on `changeset` alone to guard something that must run.

## Combining conditions

```groovy
when {
    anyOf {
        branch 'main'
        branch 'release/*'
    }
}
```

```groovy
when {
    not {
        changeRequest()
    }
}
```

- `allOf { }` needs every nested condition to be true.
- `anyOf { }` needs at least one.
- `not { }` takes exactly one condition and inverts it.
- Several conditions directly inside `when` behave like `allOf`.
- `expression { return params.RUN_SLOW_TESTS }` covers anything the built-in conditions don't. Return a real boolean; the string `'false'` counts as true.

## Skipping the agent too

By default `when` is evaluated after the stage's agent has been allocated. With `beforeAgent true` the condition is checked first, so a skipped stage never waits for or ties up an executor.

```groovy
stage('Deploy Production') {
    agent {
        label 'deploy'
    }
    when {
        beforeAgent true
        branch 'main'
    }
    steps {
        sh 'make deploy-production'
    }
}
```

`beforeInput true` and `beforeOptions true` do the same for a stage's `input` and `options`. There is an example in [parameters and approval gates](parameters-and-approval-gates.md). For per-stage agents, see [agents and labels](agents-and-labels.md).

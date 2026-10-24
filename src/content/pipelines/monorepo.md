# Monorepo: Build Only What Changed

One `Jenkinsfile` for a repo with several packages under `packages/`. Each package has its own stage inside `parallel`, and a `changeset` condition skips the packages a push didn't touch. Uses [parallel execution](../fundamentals/parallel-execution.md) and [`when` conditions](../fundamentals/when-conditions.md); the package steps are the [Node.js recipe](../builds/nodejs.md) with npm workspaces.

```groovy
pipeline {
    agent any

    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Packages') {
            parallel {
                stage('API') {
                    when {
                        anyOf {
                            changeset 'packages/api/**'
                            // the api depends on shared, and the lockfile affects everything
                            changeset 'packages/shared/**'
                            changeset 'package-lock.json'
                        }
                    }
                    steps {
                        sh 'npm run build --workspace packages/api'
                        sh 'npm test --workspace packages/api'
                    }
                }

                stage('Web') {
                    when {
                        anyOf {
                            changeset 'packages/web/**'
                            changeset 'packages/shared/**'
                            changeset 'package-lock.json'
                        }
                    }
                    steps {
                        sh 'npm run build --workspace packages/web'
                        sh 'npm test --workspace packages/web'
                    }
                }

                stage('Shared') {
                    when {
                        anyOf {
                            changeset 'packages/shared/**'
                            changeset 'package-lock.json'
                        }
                    }
                    steps {
                        sh 'npm run build --workspace packages/shared'
                        sh 'npm test --workspace packages/shared'
                    }
                }
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

## What `changeset` actually compares

`changeset` matches against the build's changelog: the commits between this build and the previous build of the same job. It is not a diff against `main`. That has a few consequences:

- The first build of a new branch has no previous build, so the changelog is empty and every `changeset` stage is skipped.
- A pull request is its own job (`PR-42`), so the same applies. Its first build has an empty changelog, and later builds only see the commits pushed since the last PR build, not the whole PR.
- If a build fails and the next push touches a different package, the next build's changelog doesn't include the failed build's commits. The package that broke is skipped, and the run can go green without it being rebuilt.
- A manual rebuild with no new commits has an empty changelog.

> [!WARNING]
> Treat `changeset` as an optimisation. Don't use it alone to guard tests or deploys that must run for a change to be safe.

## Fallback: diff against the target branch

To build what differs from the target branch instead, compute it with `git diff --name-only origin/main...HEAD`. The three dots diff from the point where the branch left `main`, so changes that landed on `main` since don't count. Add this stage before `Packages`:

```groovy
stage('Detect Changes') {
    steps {
        script {
            String target = env.CHANGE_TARGET ?: 'main'
            String base = "origin/${target}"
            String fetchTarget = "git fetch --no-tags origin '+refs/heads/${target}:refs/remotes/${base}'"

            // multibranch checkouts often fetch only the branch being built
            withCredentials([gitUsernamePassword(credentialsId: 'git-credentials-id')]) {
                sh fetchTarget
            }

            ['api', 'web', 'shared'].each { String pkg ->
                String check = "git diff --name-only '${base}...HEAD' | grep -q '^packages/${pkg}/'"
                boolean changed = sh(script: check, returnStatus: true) == 0
                // env only holds strings, so 'true' / 'false' for the when conditions below
                env["${pkg.toUpperCase()}_CHANGED"] = changed.toString()
            }
        }
    }
}
```

Then guard each package stage on the result, and build everything on `main` itself, where the diff against `origin/main` is empty:

```groovy
when {
    anyOf {
        branch 'main'
        environment name: 'API_CHANGED', value: 'true'
        environment name: 'SHARED_CHANGED', value: 'true'
    }
}
```

`CHANGE_TARGET` is set on pull request builds to the branch the PR merges into, so PRs into a release branch diff against that branch. The `gitUsernamePassword` binding comes with the Git plugin and gives the fetch the same credentials as the checkout.

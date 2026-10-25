---
tags: [testing, notifications, docker]
---

# Nightly Build & Agent Maintenance

Runs once a night on a cron [trigger](../fundamentals/triggers.md): the full test suite including the slow suites, a dependency update report that doesn't fail the build, and a Docker prune on every Docker agent. The prune is the agent-wide maintenance job that [`dockerCleanup`](../library/docker-cleanup.md) leaves to a separate schedule. Uses the [shared library](../library/setup.md) step [`notifySlack`](../library/notify.md); the build steps are the [Node.js recipe](../builds/nodejs.md).

```groovy
@Library('cookbook@v1.2.0') _

pipeline {
    // per-stage agents, so the maintenance stage can visit each agent without holding one itself
    agent none

    triggers {
        // H picks a fixed minute per job, so nightly jobs don't all start at 02:00
        cron('H 2 * * *')
    }

    options {
        timeout(time: 3, unit: 'HOURS')
    }

    stages {
        stage('Nightly Checks') {
            agent {
                label 'docker'
            }
            stages {
                stage('Install') {
                    steps {
                        sh 'npm ci'
                    }
                }

                stage('Full Test Suite') {
                    steps {
                        sh 'npm test'
                        // too slow for every push, so they run here
                        sh 'npm run test:integration'
                        sh 'npm run test:e2e'
                    }
                }

                stage('Dependency Report') {
                    steps {
                        // npm outdated exits 1 when anything is behind; mark the stage, keep the build green
                        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                            sh 'npm outdated'
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

        stage('Docker Maintenance') {
            // no agent here: the script visits every docker agent in turn
            steps {
                script {
                    Map prunes = [:]

                    // offline agents are left out by default
                    nodesByLabel('docker').each { String agentName ->
                        prunes[agentName] = {
                            node(agentName) {
                                // dangling layers only; tagged images and recent build cache stay
                                sh 'docker image prune -f'
                                sh 'docker builder prune -f --filter until=72h'
                            }
                        }
                    }

                    parallel prunes
                }
            }
        }
    }

    post {
        // nobody is watching at 2am, so say when it breaks
        failure {
            notifySlack(channel: '#builds')
        }
    }
}
```

## Notes

- Jenkins registers the cron trigger when the `Jenkinsfile` runs, so the first nightly run happens after one manual or push-triggered build.
- In a multibranch job, every branch whose `Jenkinsfile` has the trigger gets its own nightly run. Either use a standalone Pipeline job for this, or limit it with `cron(env.BRANCH_NAME == 'main' ? 'H 2 * * *' : '')`.
- `catchError` with `buildResult: 'SUCCESS'` leaves the build result alone and shows the stage as unstable, so outdated packages are visible without paging anyone. The list itself is in the stage log.
- The sequential stages inside `Nightly Checks` share one agent and workspace.

## Pruning every agent

A stage with `agent { label 'docker' }` runs on one matching agent, not all of them, so the prune has to fan out by hand. `nodesByLabel` comes from the [Pipeline Utility Steps](https://plugins.jenkins.io/pipeline-utility-steps/) plugin and returns the names of the online agents with a label. Each `node(agentName)` then waits for a free executor on that agent, which also means the prune never runs in the middle of another build on a single-executor agent.

Without that plugin, a `matrix` with an axis listing the agent names does the same job, at the cost of editing the list when agents change. See [matrix builds](../fundamentals/matrix-builds.md).

- `docker image prune -f` removes dangling images only. Adding `-a` would remove every image not used by a container, including the layer cache other jobs build on.
- `docker builder prune -f --filter until=72h` removes BuildKit cache older than three days and keeps what recent builds use.

> [!WARNING]
> Keep `docker system prune --volumes` out of this job. On a shared agent it removes volumes and networks other jobs still need.

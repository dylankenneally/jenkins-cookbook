---
tags: [declarative, notifications]
---

# Post-Actions & Status Notifications

Handling cleanup tasks, artifacts archiving, and conditional alerts based on whether the pipeline succeeded or failed.

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                echo 'Compiling code...'
                sh 'make build'
            }
        }
    }
    post {
        success {
            echo 'Build succeeded!'
            archiveArtifacts artifacts: 'dist/**', fingerprint: true
            // e.g., slackSend(channel: '#deployments', message: "SUCCESS: Job ${env.JOB_NAME} build #${env.BUILD_NUMBER}")
        }
        failure {
            echo 'Build failed. Triggering alerts...'
        }
        // cleanup runs after every other post condition; in `always` it would wipe the workspace before `success` could archive
        cleanup {
            cleanWs() // Deletes workspace contents to save disk space
        }
    }
}
```

Post conditions run in a fixed order (`always`, …, `failure`, `success`, …, `cleanup`) regardless of how they're written, so anything destructive belongs in `cleanup`. For Docker agents, add [`dockerCleanup()`](../library/docker-cleanup.md) there too.

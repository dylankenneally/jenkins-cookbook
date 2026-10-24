# Parameters & Approval Gates

Build parameters let someone choose options when starting a run, and a stage-level `input` pauses the run until a person approves the next step. Together they give a manual gate in front of production.

```groovy
pipeline {
    // no global agent, so the approval wait below holds no executor
    agent none

    parameters {
        choice(
            name: 'TARGET',
            choices: ['staging', 'production'],
            description: 'Where to deploy'
        )
        booleanParam(
            name: 'RUN_SMOKE_TESTS',
            defaultValue: true,
            description: 'Run smoke tests after deploying'
        )
        string(
            name: 'RELEASE_NOTE',
            defaultValue: '',
            description: 'Short note for the deploy log'
        )
    }

    stages {
        stage('Build') {
            agent any
            steps {
                sh 'make build'
                stash name: 'dist', includes: 'dist/**'
            }
        }

        stage('Approve Production') {
            when {
                // skip the prompt entirely for staging runs
                beforeInput true
                expression { params.TARGET == 'production' }
            }
            options {
                // stage options apply before input, so an ignored prompt aborts after a day
                timeout(time: 1, unit: 'DAYS')
            }
            input {
                message 'Deploy this build to production?'
                ok 'Deploy'
                submitter 'release-managers'
                submitterParameter 'APPROVED_BY'
            }
            steps {
                echo "Approved by ${APPROVED_BY}"
            }
        }

        stage('Deploy') {
            agent any
            steps {
                unstash 'dist'
                // parameters are also env vars; single quotes let the shell expand them safely
                sh 'echo "Release note: $RELEASE_NOTE"'
                sh 'make deploy TARGET="$TARGET"'
            }
        }

        stage('Smoke Tests') {
            agent any
            when {
                beforeAgent true
                expression { params.RUN_SMOKE_TESTS }
            }
            steps {
                sh 'make smoke-test TARGET="$TARGET"'
            }
        }
    }
}
```

## Parameters

- `choice(name:, choices:, description:)` gives a drop-down. The first entry is the default.
- `booleanParam(name:, defaultValue:, description:)` gives a checkbox.
- `string(name:, defaultValue:, description:)` gives a free-text field. Treat its value as untrusted input. Parameters are also exposed as environment variables, so reference them as `"$NAME"` inside a single-quoted `sh` string rather than interpolating them with Groovy.

Read them with `params.NAME`. They are typed, so `params.RUN_SMOKE_TESTS` is a real boolean. Timer, SCM and upstream triggers start runs with the default values.

> [!NOTE]
> Jenkins learns the parameters by running the `Jenkinsfile`. The first run of a new job or branch uses the defaults without asking, and "Build with Parameters" appears afterwards.

## Approval gates

- The stage-level `input` pauses before the stage's agent is allocated. That only saves an executor if nothing above it holds one, which is why the pipeline uses `agent none` and gives each working stage its own agent.
- `submitter` limits who can approve, as a comma-separated list of users or groups. Leave it out and anyone with build permission can click Deploy.
- `submitterParameter` puts the approver's id in an environment variable for the rest of the stage, which is useful for audit logs.
- Clicking Abort, or the timeout expiring, aborts the run.
- `input` can also take a `parameters { }` block if the approver should fill something in.

> [!WARNING]
> With `agent any` at the top, the run sits on an executor for as long as the prompt is open, possibly days. Keep approvals out of any agent block.

Stages on different agents don't share a workspace, so the build output travels via [stash and unstash](stash-and-unstash.md). Per-stage agents are covered in [agents and labels](agents-and-labels.md), and a fuller promotion flow is in [promote across environments](../pipelines/promote-across-environments.md).

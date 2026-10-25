---
tags: [declarative, git]
---

# Triggers

The `triggers {}` directive starts a pipeline without a push: on a schedule, by polling the repo, or when another job finishes. Pushes and pull requests are better handled by webhooks, covered below.

```groovy
pipeline {
    agent any

    triggers {
        // nightly, at a minute in the 02:00 hour that's stable for this job
        cron('H 2 * * *')
        // rebuild after the shared libraries build successfully
        upstream(
            upstreamProjects: 'lib-core/main,lib-ui/main',
            threshold: hudson.model.Result.SUCCESS
        )
    }

    stages {
        stage('Build') {
            steps {
                sh 'make build'
            }
        }
    }
}
```

Jenkins reads `triggers` when the pipeline runs, so a new or changed trigger takes effect after the next run, not on save. Run the job once by hand after adding one.

## `cron` and the `H` symbol

The spec has five fields: minute, hour, day of month, month, day of week. `H` stands for a value hashed from the job name. It's the same every time for one job, but different jobs land on different values, so a hundred jobs scheduled `H 2 * * *` spread across the hour instead of all starting at 02:00.

- `H 2 * * *` runs once a day in the 02:00 hour.
- `H H(0-5) * * 1-5` runs once each weekday, some time before 06:00.
- `H/15 * * * *` runs every 15 minutes, at an offset that's stable per job.
- `0 2 * * *` still works for an exact time, but every job using it starts together.

Times use the controller's time zone. Put `TZ=Europe/London` on its own first line of the spec to use another.

## Only on some branches

In a multibranch job every branch reads the same `Jenkinsfile`, so a plain `cron` schedules every branch and pull request. An empty spec disables the trigger.

```groovy
triggers {
    // only main gets the nightly run
    cron(env.BRANCH_NAME == 'main' ? 'H 2 * * *' : '')
}
```

A full nightly setup is in [nightly pipeline](../pipelines/nightly.md).

## `pollSCM` and why webhooks are better

```groovy
triggers {
    pollSCM('H/5 * * * *')
}
```

`pollSCM` asks the repo for new commits on a schedule and builds if there are any. It works when the Git host can't reach Jenkins, but it adds load on both sides and delays builds by up to the polling interval.

> [!TIP]
> Prefer a webhook from the Git host (GitHub, GitLab, Bitbucket). The host tells Jenkins about a push straight away, nothing polls, and multibranch jobs pick up new branches and pull requests the same way. Keep `pollSCM` for hosts that can't send webhooks.

## `upstream`

- `upstreamProjects` is a comma-separated list of job names. For multibranch jobs, name the branch: `lib-core/main`.
- `threshold` is the worst upstream result that still triggers this job: `hudson.model.Result.SUCCESS`, `UNSTABLE` or `FAILURE`.

To trigger only some stages from a timer, combine a trigger with `when { triggeredBy 'TimerTrigger' }`; see [`when` conditions](when-conditions.md).

---
tags: [performance]
---

# Speed Up a Slow Pipeline

Find where a slow build spends its time, then apply the fixes that pay off most. Most of the fixes are recipes elsewhere in this cookbook, so this guide is mainly a route through them.

## Before you start

- You can open the job in Jenkins and read its build history and console logs.
- You can change the `Jenkinsfile` in your repo and open a pull request.
- Pick two or three recent successful builds of the slow branch as a baseline. Write down their total duration.

## 1. Measure first

Don't guess. A pipeline that feels slow because of tests is often slow because it waited for an agent.

Turn on timestamps so every console line shows when it happened. Add `timestamps()` to the pipeline `options` (it needs the Timestamper plugin, which most installs have):

```groovy
pipeline {
    agent any

    options {
        // a time on every log line shows where the gaps are
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {
        // ...
    }
}
```

Then look at a build in three places:

- **Stage view or graph view** on the job or build page. Each stage shows how long it took. Compare a few builds so one slow outlier doesn't mislead you.
- **Console log.** Search for `Waiting for next available executor`. The time between that line and `Running on` is queue wait, not work. Each stage with its own agent can wait again, so search for every occurrence.
- **Console log, top and bottom.** The gap between `Running on` and the first step of a stage is mostly checkout. The gap after the last stage is `post` work such as archiving and cleanup.

Sort the time into buckets:

| Bucket | Where to see it | Typical fix |
| --- | --- | --- |
| Queue wait | `Waiting for next available executor` in the log | fewer agent hops, cancel superseded builds, ask for more agents |
| Checkout | time between `Running on` and the first step | fewer agent hops, a lighter clone |
| Install | `npm ci`, `dotnet restore`, Gradle downloads | dependency cache |
| Build | compile and image steps | Docker layer cache, build only what changed |
| Tests | test steps | parallel suites, move slow suites to nightly |

Fix the biggest bucket first and measure again after each change.

## 2. Run independent stages in parallel

Lint, unit tests and integration tests usually don't depend on each other. Run them side by side with `parallel`, as shown in [parallel execution](../fundamentals/parallel-execution.md). For the same steps on several platforms or versions, use [matrix builds](../fundamentals/matrix-builds.md).

Parallel branches on the same agent share its CPU, memory and workspace. If the suites already saturate the agent, running them together won't help; give each branch its own agent instead, at the cost of the extra checkout described in step 7.

## 3. Cache dependencies

A clean workspace downloads every package again. Keep the package cache outside the workspace so `cleanWs()` doesn't throw it away:

- npm and NuGet: [`withNodeCache` and `withNuGetCache`](../library/dependency-cache.md)
- Gradle and Android: the Gradle cache section in [Android](../builds/android.md)
- Maven: the shared local repository in [Java](../builds/java.md)

Caches live on the agent. Ephemeral agents start cold every time unless your Jenkins administrator mounts a persistent volume for the cache path.

## 4. Reuse Docker layers

A fresh agent has no image layers, so every `docker build` starts from scratch. Order the Dockerfile so the dependency install comes before the source copy, and keep a registry layer cache so any agent can reuse unchanged layers. Both are in [Docker image builds](../builds/docker.md).

## 5. Only build what changed in a monorepo

If one push to a monorepo builds and tests every package, gate each package's stage on what changed. The [monorepo pipeline](../pipelines/monorepo.md) shows `changeset` conditions and a `git diff` fallback against the target branch.

> [!WARNING]
> `changeset` compares against the previous build of the same job, not against `main`. Treat it as an optimisation, not as the only guard on tests that must run.

## 6. Move slow suites to a nightly build

End-to-end, load and full browser-matrix suites rarely need to run on every push. Keep a fast suite on pull requests and run the slow ones once a night with the [nightly pipeline](../pipelines/nightly.md) and a cron [trigger](../fundamentals/triggers.md).

To keep both in one `Jenkinsfile`, gate the slow stage on the timer:

```groovy
stage('E2E Tests') {
    when {
        // runs on the nightly schedule, or when someone asks for it
        anyOf {
            triggeredBy 'TimerTrigger'
            expression {
                return params.RUN_SLOW_TESTS
            }
        }
    }
    steps {
        sh 'npm run test:e2e'
    }
}
```

`params.RUN_SLOW_TESTS` needs a `booleanParam` in the pipeline's `parameters`; see [parameters and approval gates](../fundamentals/parameters-and-approval-gates.md).

Someone has to read the nightly result. Send it somewhere the team looks, as the nightly pipeline does with a notification.

## 7. Cut agent hops

Each stage with its own `agent` gets a new workspace and checks the repo out again, and may wait in the queue again. Ten stages with ten agents can mean ten checkouts and ten queue waits.

- Use one top-level `agent` when the stages can run on the same machine.
- Where a group of stages needs a particular agent, put the agent on a parent stage and nest the stages inside it, so they share one checkout:

```groovy
stage('Linux') {
    agent {
        label 'linux'
    }
    stages {
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

- Add `beforeAgent true` to `when` conditions so a skipped stage doesn't wait for an agent at all; see [`when` conditions](../fundamentals/when-conditions.md).
- Pass build output with [stash and unstash](../fundamentals/stash-and-unstash.md) only when it is small. Large stashes go through the controller and can cost more time than they save.

More on per-stage agents is in [agents and labels](../fundamentals/agents-and-labels.md).

## 8. Be careful with shallow clones

A shallow clone (depth 1, no tags) makes checkout faster on large repos. It also removes the history and tags that some steps need:

- [`gitVersion`](../library/git-version.md) falls back to a bare short SHA.
- The changelog in the [release pipeline](../pipelines/release.md) can't find the previous tag.
- A `git diff` against the target branch has no merge base.

Only use a shallow clone on jobs that don't version, release or diff. The clone settings live on the multibranch job's branch source (Advanced clone behaviours), so ask whoever configures the job, usually your Jenkins administrator.

## 9. Right-size timeouts and cancel superseded builds

Timeouts don't make a passing build faster, but a hung build that holds an agent for hours makes everyone else's builds wait. Set the pipeline `timeout` to about twice a normal run, and give risky stages their own shorter limit. See [options defaults](../fundamentals/options-defaults.md) and [retries and error handling](../fundamentals/retries-and-error-handling.md).

On pull request jobs, a new push makes the previous build pointless. Abort it so it frees its agent:

```groovy
options {
    // a newer push to the same branch or pr aborts the older running build
    disableConcurrentBuilds(abortPrevious: true)
}
```

## 10. Ask for more or bigger agents

If queue wait is the biggest bucket after the fixes above, or a single stage is limited by CPU or memory, the answer is capacity. That is your Jenkins administrator's call. Bring numbers:

```text
Subject: Agent capacity request for <job name>

Job: <link to the job>
Agent label used: <label, e.g. linux>
Problem: <queue wait | CPU-bound stage | out of memory>
Evidence:
  - typical queue wait: <minutes> (from builds <#n>, <#n>, <#n>)
  - slowest stage: <stage name>, <minutes>, CPU or memory at <value> if known
  - builds per day on this job: <number>
Already tried: <parallel stages, caching, fewer agent hops, ...>
Request: <more executors on <label> | a larger agent type for <stage> | a dedicated label>
```

## Related

- [How Jenkins runs your pipeline](../concepts/how-jenkins-runs-your-pipeline.md)
- [Parallel execution](../fundamentals/parallel-execution.md)
- [Agents and labels](../fundamentals/agents-and-labels.md)
- [Dependency cache](../library/dependency-cache.md)
- [Monorepo pipeline](../pipelines/monorepo.md)
- [Nightly pipeline](../pipelines/nightly.md)
- [Roles and responsibilities](roles-and-responsibilities.md)

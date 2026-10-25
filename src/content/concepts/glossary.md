---
tags: [getting-started]
---

# Glossary

Short definitions of the Jenkins and CI/CD terms used across the cookbook, in alphabetical order. Each links to the page that covers it in most depth.

**Agent**: a machine or container that runs the work of a build, such as checkouts, `sh` commands and tests. Agents connect to the controller and offer one or more executors. See [Agents & Labels](../fundamentals/agents-and-labels.md).

**Approval (input)**: a pause in a run, made with the `input` step, that waits for a person to click proceed or abort. Used as a gate before deploying to staging or production. See [Parameters & Approval Gates](../fundamentals/parameters-and-approval-gates.md).

**Artifact**: a file or image a build produces for deploying or publishing, such as a container image, zip or `.jar`. Also the files kept with a build by `archiveArtifacts`. See [Build Once, Promote Many](build-once-promote-many.md).

**Branch indexing**: the scan a multibranch job does of its repository to find branches, pull requests and tags with a `Jenkinsfile`, and to create or remove their jobs. See [Multibranch & Pull Requests](../fundamentals/multibranch-and-pull-requests.md).

**Build**: one run of a job, with its own number, console log, artifacts and result (success, unstable, failure or aborted). Also called a run. See [How Jenkins Runs Your Pipeline](how-jenkins-runs-your-pipeline.md).

**Build number**: the sequence number of a build within its job, starting at 1. Each branch and pull request in a multibranch job counts separately. Available as `BUILD_NUMBER`. See [How Jenkins Runs Your Pipeline](how-jenkins-runs-your-pipeline.md).

**Changeset**: the commits included in a build since the previous build of the same job, and the files they touched. The `changeset` condition runs a stage only when matching files changed. See [`when` Conditions](../fundamentals/when-conditions.md).

**Controller**: the central Jenkins server. It serves the UI, stores jobs, history and credentials, schedules builds and runs pipeline Groovy. Builds should run on agents, not on the controller. See [How Jenkins Runs Your Pipeline](how-jenkins-runs-your-pipeline.md).

**Credential**: a secret (token, password, key or file) stored encrypted in Jenkins and referred to by ID, so it never appears in the `Jenkinsfile`. See [Secrets in CI](secrets-in-ci.md).

**Declarative pipeline**: the structured `pipeline { … }` syntax used throughout this cookbook, with fixed sections such as `agent`, `stages`, `when` and `post`. Jenkins validates its shape before running it. See [Pipeline Skeleton](../fundamentals/pipeline-skeleton.md).

**Environment (deploy target)**: a running copy of your system, such as dev, staging or prod, that artifacts are deployed to. See [Build Once, Promote Many](build-once-promote-many.md).

**Environment variable**: a named string available to steps and shell commands, such as `BRANCH_NAME` or one set in an `environment` block. Unrelated to deploy environments. See [Environment Variables & Secure Credentials](../fundamentals/environment-variables-and-secure-credentials.md).

**Executor**: a slot on an agent that runs one piece of work at a time. Builds and stages wait in the queue until an executor with the right label is free. See [Agents & Labels](../fundamentals/agents-and-labels.md).

**Fingerprint**: a checksum Jenkins records for an archived file, so it can show which builds produced and used the same file. Turned on with `fingerprint: true` on `archiveArtifacts`. See [Post-Actions & Status Notifications](../fundamentals/post-actions-and-status-notifications.md).

**`Jenkinsfile`**: the file at the root of a repository that defines its pipeline as code, reviewed and versioned like the rest of the repo. See [CI/CD in One Page](ci-cd-basics.md).

**Job**: a configured item in Jenkins that can be built, such as a pipeline or a branch inside a multibranch job. Also called a project or item. See [How Jenkins Runs Your Pipeline](how-jenkins-runs-your-pipeline.md).

**Label**: a tag on an agent, such as `linux`, `docker` or `macos`, that pipelines use to ask for a kind of machine. Expressions like `linux && docker` combine labels. See [Agents & Labels](../fundamentals/agents-and-labels.md).

**Matrix**: a declarative section that runs the same stages for every combination of some axes, such as platform and version. See [Matrix Builds](../fundamentals/matrix-builds.md).

**Multibranch pipeline**: a job that scans a repository and creates a child job for every branch, pull request and tag with a `Jenkinsfile`. See [Multibranch & Pull Requests](../fundamentals/multibranch-and-pull-requests.md).

**Node**: any machine Jenkins can run work on, the controller or an agent. Also the scripted `node { … }` step that allocates an executor and workspace. See [Agents & Labels](../fundamentals/agents-and-labels.md).

**Parameter**: a value someone chooses when starting a build, such as a choice or a boolean, read as `params.NAME`. See [Parameters & Approval Gates](../fundamentals/parameters-and-approval-gates.md).

**Pipeline**: the ordered stages a change goes through from commit to deploy, and the Jenkins job type that runs them from a `Jenkinsfile`. See [CI/CD in One Page](ci-cd-basics.md).

**Post**: a declarative section that runs steps after a stage or the whole pipeline, depending on the result: `always`, `success`, `failure`, `unstable`, `cleanup` and others. See [Post-Actions & Status Notifications](../fundamentals/post-actions-and-status-notifications.md).

**Promotion**: deploying an artifact that already passed one environment to the next one, without rebuilding it. See [Build Once, Promote Many](build-once-promote-many.md).

**Queue**: where builds and stages wait for an executor. A waiting build shows "Waiting for next available executor". See [How Jenkins Runs Your Pipeline](how-jenkins-runs-your-pipeline.md).

**Replay**: a button on a finished pipeline build that reruns it with an edited `Jenkinsfile`, without committing. Useful for debugging; commit the fix afterwards. See [`Jenkinsfile` Tips](../fundamentals/tips.md).

**Sandbox**: the restricted mode pipeline Groovy runs in, which only allows approved methods. Calls outside it fail with `RejectedAccessException`. See [Troubleshooting](../guides/troubleshooting.md).

**Scripted pipeline**: the older, free-form Groovy pipeline syntax built from `node { … }` blocks. More flexible than declarative and easier to get wrong; this cookbook uses declarative, with `script` blocks where Groovy is needed. See [How Jenkins Runs Your Pipeline](how-jenkins-runs-your-pipeline.md).

**Shared library**: a separate Git repository of reusable pipeline steps, loaded with `@Library`, so common work like pushing images is written once. See [Shared Library Setup](../library/setup.md).

**Stage**: a named group of steps in a pipeline, shown as a column in the UI. Stages run in order unless they are in a `parallel` or `matrix` block. See [Pipeline Skeleton](../fundamentals/pipeline-skeleton.md).

**Stash**: a set of files saved during a run with `stash` and restored on another agent with `unstash`. Deleted when the run ends. See [Stash & Unstash](../fundamentals/stash-and-unstash.md).

**Step**: a single action in a pipeline, such as `sh`, `checkout`, `junit` or `archiveArtifacts`. Steps that touch files or run commands run on the agent. See [How Jenkins Runs Your Pipeline](how-jenkins-runs-your-pipeline.md).

**Trigger**: something that starts a build without a person clicking, such as a schedule, SCM polling or another job finishing. See [Triggers](../fundamentals/triggers.md).

**Webhook**: an HTTP call the Git host makes to Jenkins on a push or pull request, so builds start straight away instead of waiting for polling or a scan. See [Triggers](../fundamentals/triggers.md).

**Workspace**: the directory on an agent where a job's files live during a build. One per job per agent, reused between builds on that agent and not shared with other agents. See [How Jenkins Runs Your Pipeline](how-jenkins-runs-your-pipeline.md).

# Your First Pipeline

By the end of this tutorial your repo will have a `Jenkinsfile` that installs dependencies and runs the tests on every push, publishes test results to Jenkins, and goes red when a test fails. It takes about 30 minutes, plus any wait for your Jenkins administrator to create the job.

The examples use a Node.js project with `npm ci` and `npm test`. The steps are the same for any stack; only the commands change.

## Before you start

You need three things:

- a repo on a Git host that Jenkins can reach, such as GitHub, GitLab, Bitbucket or Gitea
- a Jenkins user account that can see and build jobs
- a multibranch job for the repo

A [multibranch job](../concepts/glossary.md) (Multibranch Pipeline) watches a repo and creates a child job for every branch and pull request that contains a `Jenkinsfile`. A `Jenkinsfile` is a text file in the repo that describes the [pipeline](../concepts/glossary.md): the ordered set of [stages](../concepts/glossary.md) Jenkins runs for each commit. See [Multibranch & Pull Requests](../fundamentals/multibranch-and-pull-requests.md) for how branches and PRs behave.

Creating the job usually needs your Jenkins administrator, because it involves job permissions and stored credentials. If you can create jobs yourself, the same settings apply. Ask for these:

- **Branch source.** The Git host type and the repo URL. The branch source is the part of the job that knows how to list branches and pull requests on that host.
- **Credentials for the repo.** Jenkins needs read access to clone the repo and, on most hosts, to report build status back to commits and PRs. Your Jenkins administrator stores this as a [credential](../concepts/glossary.md) (a secret held by Jenkins and referenced by ID). It is usually a token or SSH key for a service account that the repo owner has granted read access.
- **Script path.** `Jenkinsfile`, the default, unless your file lives elsewhere.
- **A webhook.** A webhook is a call from the Git host to Jenkins on every push, so builds start within seconds. Without one, Jenkins only notices changes on its periodic scan. The repo owner adds the webhook on the Git host, using the URL your Jenkins administrator gives them.
- **An agent label.** An [agent](../concepts/glossary.md) is a machine that runs builds, and a [label](../concepts/glossary.md) names a group of agents with the same tools. Ask which label has the tools your build needs, for example Node.js 22.

A request your Jenkins administrator can act on looks like this:

```text
Please create a multibranch pipeline job for our repo.

- Git host and repo URL: https://git.example.com/my-group/my-app
- Branch source: discover branches and pull requests from the origin repo
- Checkout credential: read access to the repo above (the repo owner can grant access to a service account)
- Script path: Jenkinsfile
- Webhook: please send the webhook URL so the repo owner can add it to the repo
- Agent label: which label should we use for Node.js 22 builds?
```

> [!NOTE]
> The job can be created before the repo has a `Jenkinsfile`. It shows no branches until one is pushed.

## 1. Add a Jenkinsfile

Create a file called `Jenkinsfile` at the root of the repo, next to `package.json`:

```groovy
pipeline {
    // run on an agent that has the tools for this build; use the label your jenkins administrator gave you
    agent {
        label 'linux'
    }

    stages {
        // no checkout stage: jenkins checks out the commit before the first stage
        stage('Install') {
            steps {
                // installs exactly what's in package-lock.json
                sh 'npm ci'
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

Each part does one job:

- `pipeline { }` wraps everything. This is a [Declarative Pipeline](../concepts/glossary.md), the structured form Jenkins checks before running.
- `agent` picks where the build runs. Replace `linux` with your label.
- `stages` holds the stages in order. Each `stage` has a name, which appears on the build page, and `steps`, the commands it runs.
- `sh` runs a shell command in the [workspace](../concepts/glossary.md), the directory on the agent where Jenkins checked out your repo.

Swap `npm ci` and `npm test` for your project's own commands. The build recipes have them for [Node.js](../builds/nodejs.md), [.NET](../builds/dotnet.md), [Java](../builds/java.md) and [C++ / CMake](../builds/cpp-cmake.md).

> [!TIP]
> Call the same commands you run on your laptop. When the build fails, you can then reproduce it without Jenkins. See [`Jenkinsfile` Tips](../fundamentals/tips.md).

## 2. Commit, push and watch the build

1. Commit the `Jenkinsfile` on a new branch and push it.
2. Open the multibranch job in Jenkins. A child job for your branch appears within a few seconds if the webhook is set up, or after the next scan if not. To check now, use **Scan Repository Now** on the job, if you have permission.
3. Open the branch job, then the build, which is numbered `#1`.

The build page links to everything about that run. The exact layout depends on your Jenkins version and plugins, in particular whether it uses the classic **Stage View** or the newer **Pipeline Graph View**, but you will find the same things:

- **The stage view or pipeline graph** shows each stage as a box, coloured by result, with its duration. Clicking a stage shows that stage's log.
- **Console Output** is the full log of the build, top to bottom. Each `sh` command is printed with a `+` in front, followed by its output.
- **Changes** lists the commits included since the previous build.
- **Tests**, once you add test reporting in the next step, shows passed and failed tests.

A successful build ends its Console Output with `Finished: SUCCESS`, and every stage is green.

> [!NOTE]
> If the build fails straight away with an error mentioning `WorkflowScript`, the `Jenkinsfile` itself has a syntax error. Check braces and quotes, or validate the file before pushing as described in [`Jenkinsfile` Tips](../fundamentals/tips.md).

## 3. Publish test results

The Console Output shows test output as text. Publishing the results gives Jenkins a structured view: a test count on every build, a list of failures, and a trend across builds. Jenkins reads the [JUnit XML](../concepts/glossary.md) format, which most test runners can write.

1. Add the Jest JUnit reporter as a pinned dev dependency:

   ```bash
   npm install --save-dev --save-exact jest-junit@16.0.0
   ```

2. Replace the `Test` stage with this one:

   ```groovy
   stage('Test') {
       environment {
           // jest-junit reads its output location from the environment
           JEST_JUNIT_OUTPUT_DIR = 'reports'
       }
       steps {
           // the arguments after -- go to jest; default keeps the normal console output
           sh '''
               npm test -- \
                 --ci \
                 --reporters=default \
                 --reporters=jest-junit
           '''
       }
       post {
           // always, so failed tests are still published
           always {
               junit 'reports/junit.xml'
           }
       }
   }
   ```

3. Commit both changes, including the updated `package.json` and `package-lock.json`, and push.
4. When the build finishes, open its **Tests** link (labelled **Test Result** in some versions). The branch job page also gains a test result trend chart after a couple of builds.

This assumes your `test` script runs Jest. For Vitest, other runners and other stacks, see the test results section of each build recipe, for example [Node.js](../builds/nodejs.md).

`post` runs after the stage's steps, and `always` means it runs whatever the result. Without it, a failing test would stop the stage before `junit` ran, and you would lose the report for exactly the build you need it for. The `junit` step comes from the JUnit plugin, which most Jenkins installs include.

> [!NOTE]
> If the build shows `No test report files were found`, the path in `junit` doesn't match where the runner wrote the file. Look in the Console Output for where the file went, and fix one or the other.

## 4. Break it on purpose

Seeing a failure once, on purpose, makes the real ones less confusing.

1. On your branch, change an assertion so a test fails, for example expect `2 + 2` to be `5`.
2. Commit and push.
3. Open the new build. The `Test` stage is red, and the build result is `FAILURE`.
4. Click the `Test` stage to read its log. The test runner's output names the failing test, and the last lines show `script returned exit code 1`. That line means the command failed, and Jenkins stopped the stage because of it.
5. Open **Tests**. The failing test is listed with its error message and stack trace.
6. Revert the change, commit and push. The next build is green again.

Jenkins uses three main results:

- **Success** (green or blue): every step passed.
- **Unstable** (yellow): the steps passed, but a step such as `junit` recorded test failures. You see this when the test command exits with 0 even though tests failed.
- **Failure** (red): a step failed, for example a command exited with a non-zero code.

For a fuller walkthrough of investigating a red build, see [Reading a Failed Build](reading-a-failed-build.md).

## Next steps

- [From Build to Deploy](build-to-deploy.md) grows this pipeline into one that deploys a static site to AWS from `main`.
- [Options Defaults](../fundamentals/options-defaults.md) adds a timeout, timestamps and build retention to every pipeline.
- [Agents & Labels](../fundamentals/agents-and-labels.md) explains labels and how to run the build in a pinned Docker image.

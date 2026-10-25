---
tags: [getting-started, troubleshooting]
---

# Reading a Failed Build

This tutorial is a routine for working out why a build went red: find the failing stage, read its log from the first error, decide whether your change caused it, and fix it or hand it to the right person with what they need. Working through it on a real failure takes about 15 minutes.

## Before you start

You need:

- a failed build to look at, or the deliberate failure from [Your First Pipeline](first-pipeline.md)
- a local checkout of the repo, so you can run the same commands

The exact layout of the build pages depends on your Jenkins version and plugins, in particular whether it uses the classic **Stage View** or the newer **Pipeline Graph View**. The page and link names below are the same in both.

## 1. Find the failing stage

Open the failed build. The stage view or pipeline graph shows each [stage](../concepts/glossary.md) as a box coloured by result. Look for the first red one.

- Stages after it are usually grey or marked skipped. They didn't run, so they aren't the problem.
- A yellow stage is **unstable**, not failed: its commands passed but a step such as `junit` recorded test failures. Open **Tests** for those.
- If no stage is red but the build is, the failure happened outside the stages, for example in the [`Jenkinsfile`](../concepts/glossary.md) syntax, the [agent](../concepts/glossary.md) allocation or the pipeline-level `post` block. Go straight to Console Output for this one.

## 2. Open that stage's log

Click the red stage to open its log. In the classic Stage View, hover over the stage's cell and choose **Logs**. In Pipeline Graph View, selecting the stage shows its steps and their output. The build's **Pipeline Steps** page (named **Pipeline Overview** or similar in some versions) lists every step in order with a log link for each.

Prefer the stage log to the full **Console Output**. Console Output interleaves every stage, including parallel ones, and can run to thousands of lines. The stage log holds only the part that failed.

> [!TIP]
> Console Output has a **View as plain text** or **Full log** link when a long log is truncated. Use your browser's find on that page to search for `ERROR` or `exit code`.

## 3. Read from the first error

The last line of a failed log is almost always a summary, such as `script returned exit code 1` or `Finished: FAILURE`. It tells you that something failed, not what. Scroll up to the first error and start there. Later errors are often knock-on effects of the first one.

Each `sh` command is printed with a `+` in front, so you can see which command was running when the output went wrong:

```text
+ npm ci
added 812 packages in 21s
+ npm test -- --ci
FAIL src/cart.test.js
  ● cart › applies the discount
    Expected: 90
    Received: 100
Tests: 1 failed, 41 passed, 42 total
script returned exit code 1
```

Next, decide whose error it is. That tells you where to look for the fix.

Errors from your own tools are output from the command after the `+` line: a compiler error, a failed test, an npm or Maven message. The command ran, and it failed for the same reasons it would on your laptop.

Errors from Jenkins or Groovy come from the pipeline itself. They usually mention Java or Groovy class names, or `WorkflowScript`, which is Jenkins's name for your `Jenkinsfile`:

```text
org.codehaus.groovy.control.MultipleCompilationErrorsException: startup failed:
WorkflowScript: 14: Expected a stage @ line 14, column 9.
```

```text
java.lang.NoSuchMethodError: No such DSL method 'withAws' found among steps
```

```text
groovy.lang.MissingPropertyException: No such property: DEPLOY_ENV for class: groovy.lang.Binding
```

The first is a syntax error in the `Jenkinsfile`, with the line number. The second means a step name is misspelled, or the [shared library](../concepts/glossary.md) or plugin that provides it isn't loaded. The third is a variable name Groovy couldn't resolve. [Troubleshooting](../guides/troubleshooting.md) lists the common ones with causes and fixes, and [How Jenkins Runs Your Pipeline](../concepts/how-jenkins-runs-your-pipeline.md) explains where the controller ends and your commands begin.

## 4. Check whether it's your change

A red build after your push isn't always caused by your push. Check before you start changing code.

1. **Compare with the last green build.** On the branch job page, open the last successful build (the **Last successful build** link, or the most recent green entry in the build history). Did the same stage pass there? Open both stage logs and compare them around the first error.
2. **Look at the Changes page.** The failed build's **Changes** link lists the commits since the previous build. If none of them touch the area that failed, the cause may be outside the repo: a new version of a dependency, an expired token, an unavailable service or a problem on the agent.
3. **Re-run it.** Use **Build Now** on the branch job, or **Restart from Stage** on the failed build to rerun from the failing stage with the same commit. If the rerun passes with no change, the failure was intermittent, such as a flaky test or a network timeout. Note it and fix the flakiness, rather than re-running until it goes green.

Look at which agent ran the build, too. Console Output prints `Running on <agent name>` near the top. If builds fail on one agent and pass on others, it's likely an agent problem for your Jenkins administrator.

## 5. Reproduce it locally

If the failing stage runs your project's own commands, run the same ones in a clean checkout of the same commit:

1. Check out the commit from the build. Its hash is on the build page and near the top of Console Output (`Checking out Revision ...`).
2. Start from a clean state, as Jenkins does. For Node.js, `npm ci` deletes `node_modules` before installing.
3. Run the exact command from the `+` line in the log, for example `npm test -- --ci`.

If it passes locally but fails in Jenkins, look for differences in the environment: tool versions (compare `node --version` locally with the version in the log), environment variables such as `CI=true`, the time zone, or files that exist on your machine but aren't committed. Running the build in the same container image as the agent removes most of these:

```bash
# the same node image the agent uses, with the repo mounted as the working directory
docker run \
  --rm \
  --volume "$PWD":/app \
  --workdir /app \
  node:22.11.0 \
  npm ci
```

This works only when the pipeline's commands are ones you can run outside Jenkins, which is a good reason to keep build logic in `make` targets or npm scripts. See [`Jenkinsfile` Tips](../fundamentals/tips.md).

## 6. Try a Jenkinsfile fix with Replay

When the problem is in the `Jenkinsfile` rather than your code, **Replay** saves a commit per attempt.

1. Open the failed build and choose **Replay**.
2. Jenkins shows the build's `Jenkinsfile` in an editor. Change it.
3. Run it. Jenkins starts a new build of the same commit with your edited `Jenkinsfile`.
4. Repeat until it works, then copy the working version into the repo and commit it.

Replayed edits aren't saved anywhere except that build, so step 4 matters. Replay changes only the pipeline script; to change application code, commit as normal. It needs the **Run / Replay** permission, which ordinary users usually have on their own jobs; if the link is missing, ask your Jenkins administrator.

## 7. Know when to ask your Jenkins administrator

Some failures can't be fixed from a `Jenkinsfile`. These are the common ones, with the symptom that identifies each:

| Problem | What you see |
| --- | --- |
| Agent offline or busy | The build sits in the queue with `Waiting for next available executor` or `There are no nodes with the label 'linux'`, or the log stops at `<agent> is offline` |
| Missing plugin | `No such DSL method 'cleanWs' found among steps` for a step the cookbook documents, or `Invalid agent type "docker" specified` |
| Missing tool on the agent | `npm: command not found`, `aws: not found`, or `Tool type "nodejs" does not have an install of "node-22" configured` |
| Credential not found | `Could not find credentials entry with ID 'aws-credentials-id'` |
| Script approval | `RejectedAccessException: Scripts not permitted to use ...` |
| Disk full | `No space left on device`, or the agent marked offline with a low disk space message |

For a credential, first check the ID in your `Jenkinsfile` for typos; the ID must match exactly. For script approval, the better fix is usually to move the code into the shared library rather than have the method approved; see [Troubleshooting](../guides/troubleshooting.md).

## 8. Ask for help with the right details

Whether you're asking your Jenkins administrator, the repo owner or a colleague, include enough that they can start without asking you questions:

- the build URL
- the failing stage
- the first error line, copied as text rather than a screenshot
- what changed: your commit, a dependency update, or nothing that you know of
- what you've tried: a re-run, a local run, a Replay

```text
Build: https://jenkins.example.com/job/my-app/job/main/57/
Failing stage: Deploy
First error: ERROR: Could not find credentials entry with ID 'aws-credentials-id'
What changed: first build after adding the Deploy stage; the last green build (#56) had no Deploy stage
Tried: re-ran it, same error; the ID matches the one in our credential request
```

> [!WARNING]
> Check what you paste. Jenkins masks credential values as `****` in the console log, but it can't mask a secret that a tool printed in a changed form, or one in an archived file.

## Next steps

- [Troubleshooting](../guides/troubleshooting.md) lists common pipeline errors with their causes and fixes.
- [How Jenkins Runs Your Pipeline](../concepts/how-jenkins-runs-your-pipeline.md) explains the controller, agents and workspace, which helps when deciding whose error it is.
- [`Jenkinsfile` Tips](../fundamentals/tips.md) covers validating a `Jenkinsfile` before you push, so syntax errors never reach a build.

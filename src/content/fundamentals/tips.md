---
tags: [declarative, troubleshooting]
---

# `Jenkinsfile` Tips

Short habits that make pipelines easier to write, review and debug. Each one links to the recipe that covers it in more depth.

## Validate before you push

The Declarative linter checks a `Jenkinsfile` against the controller's installed plugins without running a build, so a syntax error costs seconds rather than a commit and a queued job.

With the [Jenkins CLI](https://www.jenkins.io/doc/book/managing/cli/), download `jenkins-cli.jar` from `$JENKINS_URL/jnlpJars/jenkins-cli.jar` and pipe the file in. Authenticate with `-auth user:api-token`, or set `JENKINS_USER_ID` and `JENKINS_API_TOKEN` in the environment and leave the flag off.

```bash
# credentials come from JENKINS_USER_ID / JENKINS_API_TOKEN
java -jar jenkins-cli.jar \
  -s "$JENKINS_URL" \
  declarative-linter < Jenkinsfile
```

Without the CLI, post the file to the HTTP endpoint. Requests authenticated with an API token are exempt from CSRF protection, so no crumb is needed. With a password or session instead, fetch a crumb from `$JENKINS_URL/crumbIssuer/api/json` first and send it as a header.

```bash
curl \
  --request POST \
  --user "$JENKINS_USER_ID:$JENKINS_API_TOKEN" \
  --form "jenkinsfile=<Jenkinsfile" \
  "$JENKINS_URL/pipeline-model-converter/validate"
```

In VS Code, the **Jenkins Pipeline Linter Connector** extension sends the open file to the same endpoint. [Pipeline Development Tools](https://www.jenkins.io/doc/book/pipeline/development/) lists editor plugins and pre-commit hooks for other setups.

> [!NOTE]
> The linter only checks Declarative structure. It won't catch a typo in a shell command, a missing credential, or Groovy that fails at runtime inside `script {}`.

## Keep logic out of the `Jenkinsfile`

Call build targets rather than spelling out the build in `sh` steps. The same `make test` or `npm run test` then runs on a laptop and on an agent, and a failing build can be reproduced without Jenkins.

```groovy
stage('Test') {
    steps {
        // the target owns the flags, so local and CI runs match
        sh 'make test'
    }
}
```

The `Jenkinsfile` should decide where and when things run; the project's own scripts decide how.

## Single quotes for secrets in `sh`

In a double-quoted Groovy string, `${TOKEN}` is replaced by Groovy before the shell sees the command. The secret then sits in the command string, where it can show up in the process list on the agent and in the recorded step arguments. Jenkins flags this in the console log:

```text
Warning: A secret was passed to "sh" using Groovy String interpolation, which is insecure.
```

Use single quotes so the shell expands the variable from its environment.

```groovy
withCredentials([string(credentialsId: 'deploy-token', variable: 'DEPLOY_TOKEN')]) {
    // the shell reads $DEPLOY_TOKEN, so the secret never appears in the command text
    sh '''
        curl \
          --fail \
          --header "Authorization: Bearer $DEPLOY_TOKEN" \
          https://api.example.com/deploy
    '''
}
```

Never `echo` a secret, even to check it's set. Masking only matches the exact value, so any transformed copy (base64, URL-encoded, split across lines) prints in clear text. See [Environment Variables & Secure Credentials](environment-variables-and-secure-credentials.md).

## Pin versions

A pipeline that pulls "latest" of anything can break without a single change to the repo. Pin tool installations, Docker agent images and the shared library.

```groovy
@Library('cookbook@v1.2.0') _

pipeline {
    agent {
        docker {
            // a specific tag, not 'node' or 'node:latest'
            image 'node:20.11-bookworm'
            label 'docker'
        }
    }
    stages {
        stage('Build') {
            steps {
                sh 'npm ci'
                sh 'npm run build'
            }
        }
    }
}
```

For `tools {}`, name an installation that is itself pinned in **Manage Jenkins → Tools** (for example `nodejs 'node-20.11'`) rather than one called `latest`. See [Shared Library Setup](../library/setup.md) and [Agents & Labels](agents-and-labels.md).

## Avoid `agent any`

`agent any` runs on whichever executor is free, including agents that lack the right toolchain or the built-in node. The cookbook's short examples use it for brevity; real pipelines should ask for a label.

```groovy
pipeline {
    // only agents labelled for this toolchain pick the build up
    agent {
        label 'linux && docker'
    }
    // ...
}
```

See [Agents & Labels](agents-and-labels.md).

## Avoid `script {}` sprawl

A `script {}` block is an escape hatch into Scripted Pipeline. Past a few lines it hides logic the linter can't check and that every repo ends up copying. Move it into a shared library step with a name, arguments and a single place to fix it.

```groovy
stage('Deploy') {
    steps {
        // was 40 lines of script {}; now one tested step
        codeDeploy(
            application: 'my-app',
            deploymentGroup: 'production',
            bucket: 'my-codedeploy-artifacts-bucket',
            source: 'deploy'
        )
    }
}
```

See [Shared Library Setup](../library/setup.md) and [Shared Library Testing](../library/testing.md).

## CPS gotchas

Pipeline code is [CPS-transformed](https://www.jenkins.io/doc/book/pipeline/cps-method-mismatches/) so a build can pause and survive a controller restart. At each step, the running program's state, including local variables, is serialized to disk. A few rules follow from that:

- Don't hold a non-serializable object, such as a `java.util.regex.Matcher` or the `LazyMap` returned by `groovy.json.JsonSlurper`, in a variable while a step runs. It fails with `java.io.NotSerializableException`.
- A method marked `@NonCPS` runs as plain Groovy. It can't call steps (`sh`, `echo`, `node` and so on), but it can safely use non-serializable objects, as long as it returns something serializable.
- Closures with `.each` and `.collect` used to fail under CPS. That was fixed long ago ([JENKINS-26481](https://issues.jenkins.io/browse/JENKINS-26481)), but a few methods that take a closure, such as `toSorted` with a comparator, still return wrong results. Wrap those in a `@NonCPS` method.

```groovy
// plain groovy: the Matcher never outlives this method
@NonCPS
String majorVersion(String version) {
    def matcher = version =~ /^(\d+)\./
    if (matcher.find()) {
        return matcher.group(1)
    }
    return null
}
```

For JSON, prefer `readJSON` from the [Pipeline Utility Steps](https://plugins.jenkins.io/pipeline-utility-steps/) plugin, which returns serializable objects. See [Troubleshooting](../guides/troubleshooting.md) for the error texts.

## Replay

**Replay** on a finished (or running) build opens its `Jenkinsfile`, and the sources of any shared libraries it loaded, in an editor. Change them and run, without a commit. It's the quickest way to iterate on a failing stage. Copy the working version back into the repo afterwards, since replayed edits are not saved anywhere else.

Replay needs the **Run / Replay** permission. Editing the sources of a trusted global library in Replay also needs **Overall / Run Scripts** (administrators, by default), because that code runs outside the sandbox.

## Restart from a stage

For Declarative pipelines, **Restart from Stage** on a completed build reruns from a chosen top-level stage, reusing the same commit and parameters. Stashes are discarded at the end of a build by default, so a restarted `Deploy` stage would have nothing to `unstash`. Keep them for recent builds:

```groovy
options {
    // keep stashes from the last 5 builds so a restarted stage can unstash them
    preserveStashes(buildCount: 5)
}
```

See [Stash & Unstash](stash-and-unstash.md) and [Options Defaults](options-defaults.md).

## Consistent credential IDs

Pick credential IDs once and use them everywhere, for example `aws-credentials-id` as the [`withAws`](../library/with-aws.md) default. Pipelines and library steps can then rely on the ID instead of taking it as a parameter.

With the [Folders](https://plugins.jenkins.io/cloudbees-folder/) plugin, credentials can be scoped to a folder, and a job looks in its own folder before the global store. Give each team a folder with its own `aws-credentials-id` pointing at that team's AWS account. The same `Jenkinsfile` and library steps then deploy to the right account without any per-team changes, and one team's jobs can't see another's credentials.

## Use the built-in docs first

Every controller documents its own installed plugins at `$JENKINS_URL/pipeline-syntax`:

- the **Snippet Generator** builds a step call from a form, including the `withCredentials` binding syntax that is easy to get wrong
- the **Declarative Directive Generator**, linked from the same page, does the same for `agent`, `options`, `when`, `post` and other directives
- the **Global Variables Reference** lists what `env`, `params` and `currentBuild` expose

These match the plugin versions you actually run, which the web docs can't. For everything else, the [Pipeline Steps Reference](https://www.jenkins.io/doc/pipeline/steps/) covers every step from every published plugin.

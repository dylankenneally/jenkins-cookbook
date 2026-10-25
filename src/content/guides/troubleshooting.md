---
tags: [troubleshooting]
---

# Troubleshooting

Common pipeline errors, what causes them and how to fix them. The exact text varies a little between Jenkins versions, so search the console log for the first line shown.

## `MissingPropertyException: No such property`

```text
groovy.lang.MissingPropertyException: No such property: DEPLOY_ENV for class: groovy.lang.Binding
```

**Cause.** Groovy found a bare name it couldn't resolve. Usually one of:

- a typo in an environment variable or parameter name
- reading an unset variable as `DEPLOY_ENV` rather than `env.DEPLOY_ENV`; the bare name throws, while `env.DEPLOY_ENV` returns `null`
- a variable declared with `def` inside one `script {}` block and read in another stage; `def` makes it local to that block

**Fix.** Check the spelling against the `environment` block or `parameters`. Read optional values through `env.` or `params.` and handle `null`. To pass a value between stages, assign it to `env`:

```groovy
stage('Version') {
    steps {
        script {
            // env values outlive the block and are visible to later stages and to sh
            env.APP_VERSION = sh(script: 'git describe --tags', returnStdout: true).trim()
        }
    }
}
stage('Package') {
    steps {
        sh 'make package VERSION="$APP_VERSION"'
    }
}
```

`env` only holds strings. For anything else, declare the variable above the `pipeline` block.

## `RejectedAccessException: Scripts not permitted to use`

```text
org.jenkinsci.plugins.scriptsecurity.sandbox.RejectedAccessException: Scripts not permitted to use staticMethod jenkins.model.Jenkins getInstance
```

**Cause.** `Jenkinsfile`s and untrusted libraries run in the Groovy sandbox, which only allows an approved list of methods. The call named in the message isn't on it.

**Fix.** Two options:

- move the code into a trusted global library (**Manage Jenkins → System → Global Trusted Pipeline Libraries**), which runs outside the sandbox and is reviewed like any other code; see [Shared Library Setup](../library/setup.md)
- have an administrator approve the signature in **Manage Jenkins → In-process Script Approval**

Prefer the library. An approval applies to every pipeline on the controller, not just yours.

> [!WARNING]
> Don't blanket-approve signatures to make an error go away. Methods such as `Jenkins.getInstance`, `File` access or `String.execute` give a `Jenkinsfile` author control of the controller. Script Approval marks many of these as dangerous; treat that as a stop sign.

Libraries configured at folder level are untrusted and still sandboxed, so moving code there doesn't help.

## `NotSerializableException`

```text
java.io.NotSerializableException: java.util.regex.Matcher
```

```text
java.io.NotSerializableException: groovy.json.internal.LazyMap
```

**Cause.** Pipeline state is serialized at every step so the build can resume after a restart. A non-serializable object was still held in a variable when a step ran. The usual suspects are a regex `Matcher` from `=~` and the `LazyMap` returned by `groovy.json.JsonSlurper`.

**Fix.** Do the work in a `@NonCPS` method that returns only plain values, so the object never exists across a step:

```groovy
// plain groovy: the Matcher is gone before any step runs
@NonCPS
String majorVersion(String version) {
    def matcher = version =~ /^(\d+)\./
    if (matcher.find()) {
        return matcher.group(1)
    }
    return null
}
```

For JSON, use `readJSON` from the [Pipeline Utility Steps](https://plugins.jenkins.io/pipeline-utility-steps/) plugin instead of `JsonSlurper`; it returns serializable objects. If the object must live in pipeline code, set the variable to `null` before the next step. A `@NonCPS` method can't call steps itself; see the CPS notes in [Tips](../fundamentals/tips.md).

## `Required context class hudson.FilePath is missing`

```text
org.jenkinsci.plugins.workflow.steps.MissingContextVariableException: Required context class hudson.FilePath is missing
Perhaps you forgot to surround the code with a step that provides this, such as: node
```

**Cause.** A step that needs a workspace (`sh`, `checkout`, `readFile`, `junit`, `archiveArtifacts`, `cleanWs` and so on) ran with no agent allocated. Typical places:

- a stage with no `agent` under a top-level `agent none`
- a pipeline-level `post` block under `agent none`, which has no workspace of its own
- a helper called from outside any stage, such as in a `parameters` default or at the top of the `Jenkinsfile`

**Fix.** Give the stage an agent, and put workspace-dependent `post` steps on the stage that produced the files:

```groovy
pipeline {
    agent none
    stages {
        stage('Test') {
            agent {
                label 'linux'
            }
            steps {
                sh 'make test'
            }
            // stage-level post runs on this stage's agent and workspace
            post {
                always {
                    junit 'reports/**/*.xml'
                }
            }
        }
    }
}
```

Wrapping the step in `node('linux') { … }` also clears the error, but it allocates a fresh workspace without the stage's files. See [Agents & Labels](../fundamentals/agents-and-labels.md) and [Post-Actions & Status Notifications](../fundamentals/post-actions-and-status-notifications.md).

## `withCredentials` masking surprises

```text
+ ./deploy.sh --env ****
Deploying ****-service to ****
```

**Symptom.** Either `****` appears where no secret was printed, or a secret appears in clear text despite `withCredentials`.

**Cause.** Masking replaces every exact occurrence of the secret's value in the console log while the block is running. That has a few consequences:

- a short or common value (`admin`, `true`, a project name) is masked wherever it appears, including in unrelated output
- a transformed copy (base64, URL-encoded, reversed, split across lines) doesn't match and is printed as is
- a copy kept after the block, for example in `env`, is no longer masked
- only the console log is masked; files you write and archive, test reports and artifacts are not
- Groovy interpolation into `sh` puts the secret in the command itself, and Jenkins warns:

```text
Warning: A secret was passed to "sh" using Groovy String interpolation, which is insecure.
```

**Fix.** Use long, random secrets so masking only hits the secret. Never `echo` a secret or a value derived from it, and pass it to tools via the environment in a single-quoted `sh`. Keep secrets inside the `withCredentials` block and out of files that get archived. If a secret has already reached a log or artifact, rotate it; deleting the build doesn't remove copies. See [Environment Variables & Secure Credentials](../fundamentals/environment-variables-and-secure-credentials.md) and [Tips](../fundamentals/tips.md).

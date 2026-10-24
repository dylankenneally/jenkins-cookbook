# Agents & Labels

The `agent` directive says where a pipeline or stage runs. Labels pick a class of machine (macOS, Docker-capable, deploy box), and a Docker agent pins the exact toolchain image.

> [!WARNING]
> The other pages use `agent any` to keep examples short. In a real pipeline, `any` means "whichever executor is free", which may lack the tools you need, or be the controller if it has executors. Give every agent a label.

## A labelled agent

```groovy
pipeline {
    agent {
        label 'macos'
    }

    stages {
        stage('Build') {
            steps {
                sh 'xcodebuild -version'
                sh 'make build'
            }
        }
    }
}
```

Labels are set on each node under Manage Jenkins > Nodes. A label expression can combine them, for example `label 'linux && docker'` or `label 'macos || linux'`.

## `agent none` with per-stage agents

```groovy
pipeline {
    // no global agent: each stage asks for what it needs, and gaps between stages hold nothing
    agent none

    stages {
        stage('Build macOS') {
            agent {
                label 'macos'
            }
            steps {
                sh 'make build'
            }
        }

        stage('Build Linux') {
            agent {
                label 'linux'
            }
            steps {
                sh 'make build'
            }
        }
    }
}
```

Each stage gets its own workspace on its own agent, and the repo is checked out again in each one. Pass build output between them with [stash and unstash](stash-and-unstash.md). With `agent none` at the top, a `post` block that runs steps needing a workspace (like `cleanWs()`) must sit inside a stage that has an agent.

## Docker agent with a pinned image

```groovy
pipeline {
    agent {
        docker {
            // an exact tag gives every build the same toolchain; 'node:latest' or 'node:22' drift
            image 'node:22.11.0'
            label 'linux && docker'
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

- Needs the Docker Pipeline plugin and a Docker daemon on the agent. The `label` picks an agent that has one.
- The workspace is mounted into the container, so files written by the build stay on the agent after the container exits.
- `args '--memory 4g'` passes extra `docker run` flags. Jenkins runs the container as the agent's user, not root, so the image's tools must work for a non-root user.
- For a stage-level Docker agent that should share the pipeline's workspace and node, add `reuseNode true`.
- Pin to a digest (`node:22.11.0@sha256:...`) if you need protection against a tag being re-pushed.

> [!NOTE]
> Docker agents run Linux containers. On macOS agents Docker runs inside a VM and is slower; for native macOS builds use a labelled macOS agent instead.

For running the same stages across several labels, see [matrix builds](matrix-builds.md). For skipping a stage before its agent is allocated, see [`when` conditions](when-conditions.md).

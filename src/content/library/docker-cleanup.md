---
tags: [shared-library, docker]
---

# `dockerCleanup`

Removes the images this build created from the agent, to save disk space. It only touches images labelled by [`dockerPushToEcr`](docker-push-to-ecr.md), so on a shared agent other jobs keep their images and layer cache.

## `vars/dockerCleanup.groovy`

```groovy
/**
 * removes every image labelled with this build's BUILD_TAG
 */
def call() {
    // other jobs' images, stopped containers and volumes are deliberately left alone
    sh """
        ids=\$(docker image ls -q --filter 'label=jenkins.build=${env.BUILD_TAG}' | sort -u)

        if [ -n "\$ids" ]; then
            docker image rm -f \$ids
        fi
    """
}
```

## Usage

```groovy
post {
    cleanup {
        dockerCleanup()
        cleanWs()
    }
}
```

> [!WARNING]
> Avoid `docker system prune` on shared agents, and especially `docker system prune --volumes`. It removes every stopped container, unused network and dangling image on the machine, plus the build cache, which other jobs are about to use. `--volumes` adds unused volumes (only anonymous ones from Docker 23.0, all of them before that), and `-a` adds every image that no container is using.

To reclaim space agent-wide (dangling layers, old build cache), schedule a separate maintenance job that runs `docker image prune -f` and `docker builder prune -f` on each agent.

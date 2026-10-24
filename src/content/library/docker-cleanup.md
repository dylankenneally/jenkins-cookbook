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
> Avoid `docker system prune --volumes` on shared agents. It deletes every unused image, network and volume on the machine, including ones other jobs are about to use.

To reclaim space agent-wide (dangling layers, old build cache), schedule a separate maintenance job that runs `docker image prune -f` and `docker builder prune -f` on each agent.

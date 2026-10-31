---
tags: [shared-library, docker, aws]
---

# `dockerPushToEcr`

Builds a container image and pushes it to an Amazon Elastic Container Registry (ECR). Run it inside [`withAws`](with-aws.md), in the same region as the registry.

## `vars/dockerPushToEcr.groovy`

```groovy
/**
 * builds an image, pushes it to ecr and returns the pushed uri (registry/image:tag)
 *  - registry: e.g. 123456789012.dkr.ecr.us-east-1.amazonaws.com
 *  - image: repository name in ecr
 *  - tag: the primary tag, usually the build number or commit sha
 *  - extraTags: further tags to push, e.g. ['latest'] (opt-in, none by default)
 *  - context: Docker build context, defaults to '.'
 */
String call(Map args) {
    ['registry', 'image', 'tag'].each {
        if (!args[it]) {
            error("dockerPushToEcr: '${it}' is required")
        }
    }

    String context = args.context ?: '.'
    String local = "${args.image}:${args.tag}"
    String remote = "${args.registry}/${args.image}"
    List<String> tags = [args.tag.toString()] + (args.extraTags ?: [])

    // the label is what dockerCleanup uses to find this build's images
    sh """
        docker build \
          --label 'jenkins.build=${env.BUILD_TAG}' \
          -t '${local}' \
          '${context}'
    """

    // a private Docker config per build, so concurrent builds on a shared agent never share, or log out of, one login
    withEnv(["DOCKER_CONFIG=${pwd(tmp: true)}/docker-config"]) {
        sh """
            aws ecr get-login-password | \
              docker login --username AWS --password-stdin '${args.registry}'
        """

        try {
            tags.each { tag ->
                sh "docker tag '${local}' '${remote}:${tag}'"
                sh "docker push '${remote}:${tag}'"
            }
        } finally {
            // removing the directory removes the registry token with it
            sh 'rm -rf "$DOCKER_CONFIG"'
        }
    }

    return "${remote}:${args.tag}"
}
```

## Usage

```groovy
stage('Build & Push Image') {
    steps {
        withAws {
            script {
                env.IMAGE_URI = dockerPushToEcr(
                    registry: env.ECR_REGISTRY,
                    image: 'my-backend-service',
                    tag: env.BUILD_NUMBER
                )
            }
        }
    }
}
```

The `script` block is only there to capture the returned URI; call it directly in `steps` if you don't need it. Moving tags like `latest` are opt-in through `extraTags`, because a deploy that pulls `latest` can't say which build it's running.

The registry login lives in a Docker config directory under the workspace's temporary directory, and the step deletes that directory when the push finishes, whether or not it succeeded. Using `docker logout` instead would edit the agent's shared `~/.docker/config.json`, and could log out a build that is still pushing to the same registry on that agent.

Pair it with [`dockerCleanup`](docker-cleanup.md) in `post { cleanup { … } }`.

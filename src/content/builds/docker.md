# Docker Image Builds

Builds container images with BuildKit: a multi-stage Dockerfile, a layer cache kept in ECR so agents don't rebuild unchanged layers, and multi-architecture images for `amd64` and `arm64`. For a plain single-architecture image, the [`dockerPushToEcr`](../library/docker-push-to-ecr.md) building block is enough; this page covers what it doesn't. The ECR steps run inside [`withAws`](../library/with-aws.md).

## Multi-stage Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

# build stage: dev dependencies and build tools stay here
FROM node:22.12.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# runtime stage: production dependencies and the built output only
FROM node:22.12.0-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
```

Copying the lockfile before the source means the `npm ci` layer is reused until the dependencies change. Add a `.dockerignore` with `node_modules` and `.git` so they don't go into the build context.

## Layer cache from ECR

A fresh agent has no local layers, so every build starts from scratch. A registry cache stores the layers in ECR under a separate tag, and the next build on any agent pulls what it can reuse. It needs a buildx builder using the `docker-container` driver, because the default `docker` driver can't export cache to a registry.

```groovy
pipeline {
    agent any
    environment {
        AWS_REGION = 'us-east-1'
        ECR_REGISTRY = '123456789012.dkr.ecr.us-east-1.amazonaws.com'
        IMAGE_REPO = "${ECR_REGISTRY}/my-backend-service"
    }
    stages {
        stage('Builder') {
            steps {
                // created once per agent, then reused
                sh '''
                    docker buildx inspect jenkins > /dev/null 2>&1 || \
                      docker buildx create \
                        --name jenkins \
                        --driver docker-container \
                        --bootstrap
                '''
            }
        }
        stage('Build & Push Image') {
            steps {
                withAws {
                    sh '''
                        aws ecr get-login-password | \
                          docker login --username AWS --password-stdin "$ECR_REGISTRY"
                    '''
                    // mode=max caches the build stage too; ecr needs the oci image-manifest form
                    sh '''
                        docker buildx build \
                          --builder jenkins \
                          --cache-from "type=registry,ref=$IMAGE_REPO:buildcache" \
                          --cache-to "type=registry,ref=$IMAGE_REPO:buildcache,mode=max,image-manifest=true,oci-mediatypes=true" \
                          --tag "$IMAGE_REPO:$BUILD_NUMBER" \
                          --push \
                          .
                    '''
                }
            }
            post {
                always {
                    // don't leave a registry token in the agent's docker config
                    sh 'docker logout "$ECR_REGISTRY"'
                }
            }
        }
    }
}
```

The first build logs that the cache ref doesn't exist yet and carries on. The `buildcache` tag is overwritten on every build, so the repository can't use immutable tags; keep the cache in a separate repository if it does.

The older inline cache writes cache metadata into the image itself and works with plain `docker build`, using the previous image as the source:

```groovy
sh '''
    docker build \
      --cache-from "$IMAGE_REPO:main" \
      --build-arg BUILDKIT_INLINE_CACHE=1 \
      --tag "$IMAGE_REPO:$BUILD_NUMBER" \
      --tag "$IMAGE_REPO:main" \
      .
'''
```

Inline cache only covers the layers of the final stage, so the build stage of a multi-stage Dockerfile is rebuilt every time. Prefer the registry cache for multi-stage builds.

## Multi-arch images

`--platform` builds one image per architecture and pushes them under a single tag, as a manifest list. Hosts pull the variant that matches their CPU.

```groovy
stage('Build & Push Image') {
    steps {
        withAws {
            sh '''
                aws ecr get-login-password | \
                  docker login --username AWS --password-stdin "$ECR_REGISTRY"
            '''
            sh '''
                docker buildx build \
                  --builder jenkins \
                  --platform linux/amd64,linux/arm64 \
                  --cache-from "type=registry,ref=$IMAGE_REPO:buildcache" \
                  --cache-to "type=registry,ref=$IMAGE_REPO:buildcache,mode=max,image-manifest=true,oci-mediatypes=true" \
                  --tag "$IMAGE_REPO:$BUILD_NUMBER" \
                  --push \
                  .
            '''
        }
    }
    post {
        always {
            sh 'docker logout "$ECR_REGISTRY"'
        }
    }
}
```

A multi-platform result can't be loaded into the local image store, so `--push` is required. The architecture that doesn't match the agent is built under QEMU emulation. Docker Desktop on macOS includes it; Linux agents need the binfmt handlers installed once, for example with the `tonistiigi/binfmt` image. Emulated builds are much slower, so for compiled code consider cross-compiling in a build stage that uses `FROM --platform=$BUILDPLATFORM`.

## Notes

- `dockerPushToEcr` builds with plain `docker build` and loads the image locally, which is why it pairs with [`dockerCleanup`](../library/docker-cleanup.md). `buildx --push` leaves no local image, but the `jenkins` builder keeps its own cache; prune it periodically with `docker buildx prune --builder jenkins`.
- To hand the image to a later stage, set `env.IMAGE_URI = "${env.IMAGE_REPO}:${env.BUILD_NUMBER}"` in a `script` block, as the [container service pipeline](../pipelines/container-service.md) does with the building block's return value.
- Scan the pushed image before deploying it; see [ECR image scanning](../library/ecr-scan.md).

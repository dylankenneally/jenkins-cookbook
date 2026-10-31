---
tags: [shared-library, docker, aws, security]
---

# `ecrScan`

Waits for Amazon ECR's image scan to finish, then fails the build if the image has findings at or above a severity threshold. Run it inside [`withAws`](with-aws.md), after [`dockerPushToEcr`](docker-push-to-ecr.md).

## `vars/ecrScan.groovy`

```groovy
import groovy.transform.Field

// most to least severe, as ecr reports them
@Field final List<String> SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL', 'UNDEFINED']

/**
 * fails the build if an ecr scan has findings at or above failOn
 *  - repository: repository name in ecr
 *  - tag: the image tag to check
 *  - failOn: lowest severity that fails the build, defaults to 'CRITICAL'
 */
def call(Map args) {
    ['repository', 'tag'].each {
        if (!args[it]) {
            error("ecrScan: '${it}' is required")
        }
    }

    String failOn = (args.failOn ?: 'CRITICAL').toUpperCase()
    int threshold = SEVERITIES.indexOf(failOn)
    if (threshold < 0) {
        error("ecrScan: unknown failOn '${failOn}', expected one of ${SEVERITIES.join(', ')}")
    }

    // polls every 5s for up to 5 minutes, and exits non-zero if the scan fails
    sh """
        aws ecr wait image-scan-complete \
          --repository-name '${args.repository}' \
          --image-id 'imageTag=${args.tag}'
    """

    // a clean image has no severity counts at all, so default to an empty object
    String describe = """
        aws ecr describe-image-scan-findings \
          --repository-name '${args.repository}' \
          --image-id 'imageTag=${args.tag}' \
          --no-paginate \
          --query 'imageScanFindings.findingSeverityCounts || `{}`' \
          --output json
    """
    String findings = sh(script: describe, returnStdout: true).trim()
    // plain maps rather than json-lib objects, so they serialise cleanly between steps
    Map counts = readJSON(text: findings, returnPojo: true)
    echo "ECR scan findings for ${args.repository}:${args.tag}: ${counts}"

    List<String> blocking = SEVERITIES.take(threshold + 1).findAll { (counts[it] ?: 0) > 0 }
    if (blocking) {
        String summary = blocking.collect { "${counts[it]} ${it}" }.join(', ')
        error("ecrScan: ${args.repository}:${args.tag} has ${summary} findings (failOn: ${failOn})")
    }
}
```

## Usage

```groovy
stage('Build & Push Image') {
    steps {
        withAws {
            dockerPushToEcr(
                registry: env.ECR_REGISTRY,
                image: 'my-backend-service',
                tag: env.BUILD_NUMBER
            )
            ecrScan(
                repository: 'my-backend-service',
                tag: env.BUILD_NUMBER,
                failOn: 'HIGH'
            )
        }
    }
}
```

The scan has to be started for the waiter to finish: turn on **scan on push** for the repository, or run `aws ecr start-image-scan` first. `readJSON` comes from the [Pipeline Utility Steps](https://plugins.jenkins.io/pipeline-utility-steps/) plugin.

The image is already in the registry when the scan fails, so the failure stops the deploy, not the push. Keep deploy stages after the scan, and consider a lifecycle policy or a separate "promoted" tag so a failed image is never picked up by mistake.

> [!NOTE]
> This is written for ECR basic scanning. With enhanced scanning (Amazon Inspector) images are rescanned continuously and the findings shape differs, so check the waiter and query against your registry's setting before relying on it.

## Alternative: Trivy

[Trivy](https://trivy.dev/) scans an image on the agent, so it can stop a failing image before it reaches the registry. `dockerPushToEcr` builds and pushes in one call, so there is no point between the two to scan. To scan first, build the image yourself, scan it, then tag and push it with the same `docker` commands that `dockerPushToEcr` runs:

```groovy
stage('Build & Scan') {
    steps {
        sh '''
            docker build -t my-backend-service:"$BUILD_NUMBER" .
            docker run --rm \
              -v /var/run/docker.sock:/var/run/docker.sock \
              aquasec/trivy:0.76.1 \
              image \
              --exit-code 1 \
              --severity CRITICAL,HIGH \
              my-backend-service:"$BUILD_NUMBER"
        '''
    }
}
```

If you use `dockerPushToEcr` and scan afterwards, the image is already in the registry when the scan fails, as it is with `ecrScan`.

> [!WARNING]
> Pin an exact Trivy version (ideally by image digest), never `latest`. In March 2026 attackers published malicious Trivy releases and Docker Hub images that stole CI credentials ([advisory](https://github.com/advisories/ghsa-69fq-xp46-6x23)). A scanner runs with access to the Docker socket and the build's secrets, so upgrade it deliberately. Mounting `/var/run/docker.sock` gives the container full control of the agent's Docker daemon, which is equivalent to root on the agent.

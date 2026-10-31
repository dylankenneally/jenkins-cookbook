---
title: "sbom: Generate a CycloneDX SBOM in Jenkins with Syft"
tags: [shared-library, security, release]
---

# `sbom`

Generates a CycloneDX software bill of materials with [Syft](https://github.com/anchore/syft) and archives it with the build. The target can be the workspace (a directory) or an image the build has just created.

## `vars/sbom.groovy`

```groovy
/**
 * generates an sbom with syft, archives it with a fingerprint and returns its path
 *  - target: what to scan, e.g. 'dir:.' or 'docker:my-backend-service:42'
 *  - format: any syft output format, defaults to 'cyclonedx-json'
 *  - output: file to write, defaults to a name that matches the format, e.g. 'sbom.cdx.json'
 */
String call(Map args) {
    if (!args.target) {
        error("sbom: 'target' is required")
    }

    String format = args.format ?: 'cyclonedx-json'
    // the default file name follows the format, so an SPDX file is never named .cdx.json
    Map extensions = ['cyclonedx-json': 'cdx.json', 'cyclonedx-xml': 'cdx.xml', 'spdx-json': 'spdx.json', 'spdx-tag-value': 'spdx', 'syft-json': 'syft.json']
    String output = args.output ?: "sbom.${extensions[format] ?: format}"

    // pinned so the sbom content only changes when the generator is upgraded on purpose
    // the socket lets syft read local images; stdout is redirected so the file is owned by the agent user
    sh """
        docker run --rm \
          -v /var/run/docker.sock:/var/run/docker.sock \
          -v "\$PWD:/src:ro" \
          -w /src \
          anchore/syft:v1.55.0 \
          '${args.target}' \
          -o '${format}' \
          > '${output}'
    """

    archiveArtifacts(artifacts: output, fingerprint: true)
    return output
}
```

## Usage

```groovy
stage('SBOM') {
    steps {
        sbom(target: "docker:my-backend-service:${env.VERSION}")
        sbom(target: 'dir:.', output: 'sbom-source.cdx.json')
    }
}
```

Fingerprinting records the file's checksum, so Jenkins can show which builds produced (and later used) the same SBOM. Archive one per image you ship; a `docker:` target sees what's actually installed in the image, including OS packages, where `dir:.` reads the lock files in the workspace.

If the repo also commits a baseline SBOM that is reviewed in pull requests, this step complements it: the baseline shows what the code declares, and the per-build artifact records what was actually built. Keep both in CycloneDX JSON so they can be fed to the same tooling, for example for audit evidence.

> [!NOTE]
> Bump the pinned Syft version deliberately and check the release notes. Generator upgrades change SBOM content (new detectors, schema versions) even when the dependencies haven't changed.

> [!WARNING]
> Syft runs with `/var/run/docker.sock` mounted, which gives the container full control of the agent's Docker daemon, equivalent to root on the agent. Pin an exact Syft version, ideally by image digest, and never use `latest`. The same applies to the Trivy example on the [`ecrScan`](ecr-scan.md) page.

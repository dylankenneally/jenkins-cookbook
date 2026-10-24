# Stash & Unstash

Stages on different agents each get their own workspace, so files built in one stage aren't there in the next. `stash` saves a set of files on the controller and `unstash` restores them on whichever agent runs a later stage.

```groovy
pipeline {
    agent none

    stages {
        stage('Build') {
            agent {
                label 'linux'
            }
            steps {
                sh 'npm ci'
                sh 'npm run build'
                stash name: 'dist', includes: 'dist/**'
            }
        }

        stage('Test on macOS') {
            agent {
                label 'macos'
            }
            steps {
                // the checkout is fresh here, so pull in the built output
                unstash 'dist'
                sh 'npm ci'
                sh 'npm run test:dist'
            }
        }

        stage('Package') {
            agent {
                label 'linux'
            }
            steps {
                unstash 'dist'
                sh 'tar -czf dist.tar.gz dist'
                archiveArtifacts artifacts: 'dist.tar.gz', fingerprint: true
            }
        }
    }
}
```

## Narrowing a stash

`includes` and `excludes` take Ant-style globs, comma-separated. Stash only what the next stage needs.

```groovy
stash(
    name: 'reports',
    includes: 'build/**/*.xml',
    excludes: 'build/tmp/**'
)
```

## Notes

- `unstash` restores files at the same relative paths, overwriting any that already exist.
- Stashes belong to one run and are deleted when it finishes. Add `preserveStashes(buildCount: 5)` to the pipeline `options` if you use "Restart from Stage" on recent runs.
- Stashing the same name twice replaces the first stash.

> [!WARNING]
> Stashes are copied through the controller and suit small to medium files: build output, test reports, a few MB of binaries. For large artifacts (hundreds of MB, container layers, full SDKs) use `archiveArtifacts`, ideally backed by an artifact-manager plugin, or upload to S3 with [`s3Sync`](../library/s3-cloudfront.md) and download it where needed.

`stash` is not a substitute for `archiveArtifacts`: stashes vanish with the run, archived artifacts are kept with the build record (subject to the [build discarder](options-defaults.md)). Per-stage agents are covered in [agents and labels](agents-and-labels.md).

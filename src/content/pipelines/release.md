---
tags: [release, git]
---

# Tag-Triggered Release

Pushing a tag such as `v1.4.0` builds the release artifacts, generates an SBOM and a changelog, and publishes a GitHub release with the files attached. Ordinary branch builds run the build and tests only. The build stages are the [Node.js recipe](../builds/nodejs.md); the release uses the [shared library](../library/setup.md) steps [`gitVersion`](../library/git-version.md) and [`sbom`](../library/sbom.md).

```groovy
@Library('cookbook@v1.2.0') _

pipeline {
    agent any

    stages {
        stage('Build & Test') {
            steps {
                sh 'npm ci'
                sh 'npm test'
                sh 'npm run build'
            }
        }

        stage('Package') {
            when {
                buildingTag()
            }
            steps {
                script {
                    // TAG_NAME names the release; gitVersion() gives the version for file names
                    env.VERSION = gitVersion()
                }
                sh '''
                    mkdir -p release
                    tar -czf "release/my-tool-$VERSION.tar.gz" -C dist .
                '''
                sbom(target: 'dir:dist', output: "release/my-tool-${env.VERSION}.sbom.cdx.json")
                archiveArtifacts artifacts: 'release/*', fingerprint: true
            }
        }

        stage('Changelog') {
            when {
                buildingTag()
            }
            steps {
                // commits since the previous tag; the whole history on the first release
                sh '''
                    previous=$(git describe --tags --abbrev=0 "$TAG_NAME^" 2>/dev/null || true)

                    if [ -n "$previous" ]; then
                        range="$previous..$TAG_NAME"
                    else
                        range="$TAG_NAME"
                    fi

                    git log --no-merges --pretty='format:- %s (%h)' "$range" > release-notes.md
                '''
            }
        }

        stage('Publish Release') {
            when {
                buildingTag()
            }
            steps {
                withCredentials([string(credentialsId: 'github-release-token', variable: 'GH_TOKEN')]) {
                    // single quotes: the shell expands the token, groovy never sees it
                    sh '''
                        gh release create "$TAG_NAME" \
                          --verify-tag \
                          --title "$TAG_NAME" \
                          --notes-file release-notes.md \
                          release/*
                    '''
                }
            }
        }
    }

    post {
        cleanup {
            cleanWs()
        }
    }
}
```

## Notes

- `buildingTag()` is true for any tag build. Use `tag 'v*'` instead to release only from version tags; see [`when` conditions](../fundamentals/when-conditions.md).
- `gh` reads `GH_TOKEN` from the environment and finds the repo from the checkout's `origin` remote. `--verify-tag` stops it from creating a new tag if the one being built isn't on the remote. Every file after the flags is uploaded as a release asset.
- The changelog needs the earlier tags in the workspace. Don't use a shallow clone, and make sure the checkout fetches tags (Advanced clone behaviours in the branch source). `gitVersion()` needs them too.
- The token needs permission to create releases on the repository and nothing more.

> [!NOTE]
> Multibranch jobs don't build tags out of the box. Add the "Discover tags" behaviour to the branch source, and the [Basic Branch Build Strategies](https://plugins.jenkins.io/basic-branch-build-strategies/) plugin's tag strategy if pushing a tag should start a build. Without the strategy, tag jobs appear but have to be started by hand. See [multibranch and pull requests](../fundamentals/multibranch-and-pull-requests.md).

## Gitea

The same flow works on Gitea. With the [`tea`](https://gitea.com/gitea/tea) CLI, after a `tea login add` with a token, the publish step becomes:

```bash
tea releases create \
  --tag "$TAG_NAME" \
  --title "$TAG_NAME" \
  --note-file release-notes.md \
  --asset "release/my-tool-$VERSION.tar.gz" \
  --asset "release/my-tool-$VERSION.sbom.cdx.json"
```

Without `tea`, call the API directly with `curl` and an `Authorization: token ...` header. `POST /api/v1/repos/{owner}/{repo}/releases` with `tag_name`, `name` and `body` creates the release and returns its `id`, then `POST /api/v1/repos/{owner}/{repo}/releases/{id}/assets` uploads each file as the multipart field `attachment`.

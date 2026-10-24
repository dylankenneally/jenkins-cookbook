# `gitVersion`

Returns a version string for the checked-out commit, based on `git describe`. A tagged commit gives the tag (`v1.4.0`), a later commit gives the tag plus distance and short SHA (`v1.4.0-3-g1a2b3c4`), and a repo with no tags gives the short SHA alone.

## `vars/gitVersion.groovy`

```groovy
/**
 * returns a version string for HEAD from git describe, safe to use as a docker tag
 *  - withSha: always include the commit count and short sha, even on a tagged commit, defaults to false
 */
String call(Map args = [:]) {
    String longFlag = args.withSha ? '--long' : ''

    // --always falls back to the short sha when no tag is reachable
    String describe = """
        git describe \
          --tags \
          --always \
          --dirty \
          ${longFlag}
    """
    String version = sh(script: describe, returnStdout: true).trim()

    // docker tags allow [A-Za-z0-9_.-] only, so a tag like 'release/1.4' needs flattening
    return version.replaceAll(/[^\w.-]/, '-')
}
```

## Usage

```groovy
stage('Version') {
    steps {
        script {
            env.VERSION = gitVersion()
        }
    }
}

stage('Build & Push Image') {
    steps {
        withAws {
            dockerPushToEcr(
                registry: env.ECR_REGISTRY,
                image: 'my-backend-service',
                tag: env.VERSION
            )
        }
    }
}
```

Use the same value as the image tag, the package version (`npm version`, `dotnet pack -p:Version=…`) and the deploy label, so a running service, its artifact and its commit can all be matched up. `dotnet` and npm expect SemVer, so strip a leading `v` before passing it to them.

`--dirty` adds `-dirty` when tracked files have changed since checkout. In CI that usually means a build step is rewriting a committed file, which is worth fixing rather than shipping.

> [!WARNING]
> `git describe` needs the tags and the history between them in the workspace. Multibranch branch sources don't fetch tags by default: add the **Advanced clone behaviours** behaviour, tick **Fetch tags**, and leave **Shallow clone** off. Without them the step still works but quietly falls back to a bare short SHA.

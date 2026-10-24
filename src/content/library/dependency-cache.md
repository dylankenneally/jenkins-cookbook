# `withNodeCache` & `withNuGetCache`

Runs a block with npm's or NuGet's package cache pointed at a persistent directory on the agent, outside the workspace. `cleanWs()` and fresh checkouts then don't throw away downloaded packages between builds.

## `vars/withNodeCache.groovy`

```groovy
/**
 * runs body with npm's cache in a per-agent directory outside the workspace
 *  - path: defaults to '<HOME>/.cache/jenkins/npm'
 */
def call(Map args = [:], Closure body) {
    if (!args.path && !env.HOME) {
        error('withNodeCache: no path given and HOME is not set on this agent')
    }

    String path = args.path ?: "${env.HOME}/.cache/jenkins/npm"

    // npm reads any npm_config_* variable as config, so this is the same as --cache
    withEnv(["npm_config_cache=${path}"]) {
        body()
    }
}
```

## `vars/withNuGetCache.groovy`

```groovy
/**
 * runs body with nuget's global packages folder in a per-agent directory outside the workspace
 *  - path: defaults to '<HOME>/.cache/jenkins/nuget'
 */
def call(Map args = [:], Closure body) {
    if (!args.path && !env.HOME) {
        error('withNuGetCache: no path given and HOME is not set on this agent')
    }

    String path = args.path ?: "${env.HOME}/.cache/jenkins/nuget"

    withEnv(["NUGET_PACKAGES=${path}"]) {
        body()
    }
}
```

## Usage

```groovy
stage('Build') {
    steps {
        withNodeCache {
            sh 'npm ci --prefer-offline'
            sh 'npm run build'
        }
        withNuGetCache {
            sh 'dotnet restore'
            sh 'dotnet build --no-restore -c Release'
        }
    }
}
```

`npm ci` still deletes `node_modules` and reinstalls from the lock file every time; the cache only saves the downloads. `--prefer-offline` skips the registry check for packages already in the cache. Both caches are safe to share between concurrent builds on the same agent.

On a plain agent npm and NuGet already cache under the user's home (`~/.npm`, `~/.nuget/packages`). These steps matter where that isn't true, such as container agents whose home directory is throwaway or unwritable, and they make the location explicit so it can be mounted, sized and pruned.

> [!NOTE]
> The cache lives on the agent, so it doesn't survive ephemeral agents (cloud or Kubernetes agents created per build). There, point `path` at a mounted volume, or accept a cold cache on each build.

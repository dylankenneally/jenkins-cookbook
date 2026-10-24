# Change the Shared Library Safely

Every pipeline that loads the [shared library](../library/setup.md) runs its steps, so one bad change can break many builds at once. This guide takes a change from a branch to a tagged version that consuming repos opt into.

## Before you start

- You have write access to the shared library repo, or can open pull requests against it. The repo owner controls who can merge.
- You can run the library's tests locally: a JDK 21 and the committed Gradle wrapper. See [testing the shared library](../library/testing.md).
- You have a repo, or a scratch branch of one, where you can run a pipeline that loads the library.

## Who can change it, and why it is reviewed

The library is registered by your Jenkins administrator as a global trusted library. Trusted library code runs outside the Groovy sandbox, with the same access to Jenkins as an administrator's script. A step can read any credential the controller holds or change Jenkins configuration.

That is why:

- merges to the library repo go through a pull request with at least one reviewer who knows the library
- branch protection on the default branch, and tag protection on version tags, are worth asking the repo owner for
- a change that touches credentials, `withCredentials` or anything under `Jenkins.instance` gets extra scrutiny

> [!WARNING]
> Pushing a branch is enough to run its code on the controller as soon as a pipeline loads it with `@Library('cookbook@your-branch')`. Treat write access to the library repo like admin access to Jenkins.

## 1. Branch and write a test

```bash
git switch main
git pull --ff-only
git switch -c my-branch
```

Make the change under `vars/`, then add or update the step's test under `test/`. Cover the new behaviour and the argument checks, and keep a test for the old behaviour if callers rely on it. Run the suite:

```bash
./gradlew test --no-daemon
```

Push the branch. The library's own `Jenkinsfile` runs the same tests in Jenkins.

Keep changes backwards compatible where you can: add new arguments as optional with a default, and keep old argument names working. That turns a would-be breaking change into a minor one.

## 2. Try it from a test pipeline

Unit tests mock `sh` and other steps, so they won't catch a wrong CLI flag or a missing plugin. Run the branch for real from a pipeline that uses the step:

```groovy
// temporary: loads the library from a branch; don't merge this line
@Library('cookbook@my-branch') _

pipeline {
    agent any

    stages {
        stage('Try gitVersion') {
            steps {
                script {
                    // read-only: prints the version without building or deploying anything
                    echo gitVersion(withSha: true)
                }
            }
        }
    }
}
```

Use a scratch branch of a consuming repo, or **Replay** on an existing build and edit the `@Library` line there, so nothing reaches `main`. Use a step that doesn't deploy or change shared resources.

If Jenkins reports that the version can't be overridden, the library is configured to only allow its default version. Ask your Jenkins administrator to enable **Allow default version to be overridden** on the library.

## 3. Review and merge

Open a pull request against the library repo. In the description:

- what changed and why
- whether it is a patch, minor or major change (see below)
- the build link from step 2 showing it working

Merge once it is approved and the library's own build is green.

## 4. Tag a version

Versions follow [Semantic Versioning](https://semver.org/):

| Change | Bump | Example |
| --- | --- | --- |
| Removes or renames a step or argument, changes a default, or changes what a step returns | major | `v1.6.0` to `v2.0.0` |
| Adds a step, or an optional argument with a default | minor | `v1.6.0` to `v1.7.0` |
| Fixes a bug without changing the interface | patch | `v1.6.0` to `v1.6.1` |

Tag the merge commit on `main` with an annotated tag and push it by name:

```bash
git switch main
git pull --ff-only
git tag -a v1.7.0 -m "gitVersion: optional prefix argument"
git push origin v1.7.0
```

## 5. Announce it

Write release notes for the tag on the git host: what changed, which steps are affected, and for a major version the exact changes callers need to make. Post a link where the people who maintain pipelines will see it.

## 6. Bump the pin in consuming repos

Each consuming repo pins a version at the top of its `Jenkinsfile`:

```groovy
@Library('cookbook@v1.7.0') _
```

Bump it in a pull request per repo, so the change runs that repo's normal build before it merges. For a major version, include the caller changes in the same pull request. Repos that don't need the new version can stay on the old pin.

## Never retag

Once `v1.7.0` is pushed, it means that commit forever. If the release has a bug, fix it and tag `v1.7.1`.

Moving a tag changes the code that every pinned pipeline loads, with no change in any `Jenkinsfile`. Builds stop being reproducible, Replay of an old build runs different code, and Jenkins may keep serving a cached copy of the old commit on some jobs and not others.

## The default version, and why pinning matters

Your Jenkins administrator sets a default version when registering the library. `@Library('cookbook') _` with no version loads that default.

- If the default is a branch such as `main`, every merge to the library reaches every unpinned pipeline on its next build. A bad merge breaks them all at once.
- If the default is a tag, it only moves when the administrator changes it, but that change still lands everywhere at once.

A pinned version means a library change reaches your pipeline only when you bump the pin and your build passes. Pin in every `Jenkinsfile` that matters.

To ask for the default to move, for example after a new major version has been adopted:

```text
Subject: Update the default version of the "cookbook" shared library

Library: cookbook (Global Trusted Pipeline Libraries)
Current default: <current version>
Requested default: <new tag, e.g. v2.0.0>
Release notes: <link>
Why: <reason, e.g. most repos are already pinned to v2>
Unpinned pipelines affected: <list, or "unknown">
Timing: <when, and who to contact if builds break>
```

## Related

- [Shared library setup](../library/setup.md)
- [Testing the shared library](../library/testing.md)
- [Release a new version](release-a-version.md)
- [Secrets in CI](../concepts/secrets-in-ci.md)
- [Roles and responsibilities](roles-and-responsibilities.md)
- [Pipeline review checklist](pipeline-review-checklist.md)

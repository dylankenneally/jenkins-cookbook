# Release a New Version

Cut a release by pushing a version tag. The tag starts the [tag-triggered release pipeline](../pipelines/release.md), which builds the artifacts and publishes the release. This guide covers choosing the version, tagging, checking the result and shipping a hotfix.

## Before you start

- Your repo's `Jenkinsfile` has release stages gated on tag builds, like the [release pipeline](../pipelines/release.md).
- The multibranch job discovers tags and builds them when they are pushed. If you are not sure, see "What to ask the Jenkins administrator" below.
- You have permission to push tags to the repo. Some repos restrict this to release owners with tag protection rules; ask the repo owner if a push is rejected.
- The latest build of the branch you are releasing from is green.

## Versioning scheme

Use [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`, with a `v` prefix on the tag.

| Change since the last release | Bump | Example |
| --- | --- | --- |
| Breaking change to a public API, file format or behaviour others rely on | major | `v1.4.2` to `v2.0.0` |
| New feature, backwards compatible | minor | `v1.4.2` to `v1.5.0` |
| Bug fix only | patch | `v1.4.2` to `v1.4.3` |
| Release candidate for testing | pre-release | `v1.5.0-rc.1` |

The git tag is the source of truth for the version. [`gitVersion`](../library/git-version.md) reads it with `git describe`, and the image tag, package version and release name all come from it. Don't keep a second copy of the version in a file that someone has to remember to edit.

## 1. Pick the commit

Release from the tip of `main` unless you are shipping a hotfix (see below).

```bash
git switch main
git pull --ff-only
git log --oneline -5
```

Check that the commit you are about to tag is the one whose build is green in Jenkins. Find the last tag to see what's changed:

```bash
last=$(git describe --tags --abbrev=0)
echo "$last"
git log --oneline "$last..HEAD"
```

Use the log to choose the bump from the table above.

## 2. Create and push an annotated tag

Annotated tags record who tagged, when, and a message. Lightweight tags don't, and Jenkins can treat them as older than they are when deciding whether to build them.

```bash
git tag -a v1.4.0 -m "Release v1.4.0"
git push origin v1.4.0
```

Push the tag by name. `git push --tags` pushes every local tag, including stray ones you didn't mean to publish.

## 3. What the release pipeline does

Pushing the tag creates a new entry under the multibranch job's **Tags** tab, and the build starts. For the [release pipeline](../pipelines/release.md) that means:

1. Build and test the tagged commit.
2. Package the artifacts with the version in the file names, and generate an SBOM.
3. Write a changelog from the commits since the previous tag.
4. Publish a release on the git host with the changelog as notes and the artifacts attached.

Your repo's pipeline may also push an image or deploy. Read its `Jenkinsfile` stages with `buildingTag()` or `tag` conditions to see exactly what runs.

## 4. Check the release

- In Jenkins, open the job's **Tags** tab, then the build for your tag. All stages should be green and the release stages should not show as skipped.
- On the git host, open the release page for the tag, or run `gh release view v1.4.0`. Check that the artifacts are attached and the notes list the expected changes.
- Download one artifact and check the version in its name or metadata.

If the tag appears under **Tags** but no build ran, the tag build strategy is missing. You can start it with **Build Now** on the tag, and ask your Jenkins administrator to add the strategy.

If the build failed, fix the cause on `main` and release the next patch version. Don't delete and re-push the tag.

## 5. Write or edit the release notes

The generated changelog is a list of commit subjects. It is a starting point, not finished notes. Edit the release on the git host to add a short summary, call out breaking changes and upgrade steps, and remove noise.

```bash
gh release edit v1.4.0 \
  --notes-file release-notes.md
```

Editing the notes is always safe. It doesn't touch the tag or the artifacts.

## Hotfix from a release branch

When `main` has moved on with changes you don't want to ship yet, fix the released version on a release branch:

1. Create the branch from the released tag, if it doesn't exist already:

   ```bash
   git switch -c release/1.4 v1.4.0
   git push -u origin release/1.4
   ```

2. Land the fix on `main` first through a normal pull request, so it isn't lost in the next release.
3. Cherry-pick it onto the release branch. `-x` records the original commit in the message.

   ```bash
   git switch release/1.4
   git cherry-pick -x <commit-sha>
   ```

4. Push the change through a pull request into `release/1.4` and wait for the branch build to go green.
5. Tag the patch version on the release branch and push it:

   ```bash
   git switch release/1.4
   git pull --ff-only
   git tag -a v1.4.1 -m "Release v1.4.1"
   git push origin v1.4.1
   ```

## Never move or reuse a tag

Once a tag is pushed, treat it as permanent, even if the release was bad.

- Anyone who already fetched the tag keeps the old commit. Moving it means two people see different code under one version.
- Artifacts, images and caches built from the first tag keep that version, so you can no longer tell which build is which.
- Jenkins has already built the tag. A re-pushed tag with the same name may not build again, or may build over the earlier record.

If a release is wrong, release the next patch version with the fix. If a release must not be used, mark it as such in the release notes and tell its consumers.

## What to ask the Jenkins administrator

Multibranch jobs don't build tags out of the box. Two settings on the job's branch source are needed, and the checkout must include tags and full history for the version and changelog to be right:

```text
Subject: Enable tag builds for <job name>

Job: <link to the multibranch job>
Repo: <repo URL>
Why: we release by pushing tags like v1.4.0, and the Jenkinsfile has release stages gated on tag builds.

Please:
  1. Add the "Discover tags" behaviour to the branch source.
  2. Add a build strategy for tags (Basic Branch Build Strategies plugin) so pushing a tag starts a build.
     If you also want branches and pull requests to keep building automatically, keep or add strategies for those too.
  3. Make sure the checkout fetches tags (Advanced clone behaviours > Fetch tags) and is not a shallow clone.
  4. Confirm the credential the release stage uses (<credential ID>) is available to this job.
```

> [!NOTE]
> Adding any build strategy replaces the default "build everything" behaviour, so a tag-only strategy stops branch and pull request builds. Ask for all the strategies you need in one go.

## Related

- [Tag-triggered release pipeline](../pipelines/release.md)
- [`gitVersion`](../library/git-version.md)
- [`when` conditions](../fundamentals/when-conditions.md)
- [Multibranch and pull requests](../fundamentals/multibranch-and-pull-requests.md)
- [Build once, promote many](../concepts/build-once-promote-many.md)
- [Promotions](promotions.md)
- [Roles and responsibilities](roles-and-responsibilities.md)

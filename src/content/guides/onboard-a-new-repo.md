# Onboard a New Repo

A checklist for getting a repository built by Jenkins: a `Jenkinsfile` in the repo, a multibranch job that finds it, a webhook so builds start on push, and branch protection so nothing merges to `main` without a green build. You write the `Jenkinsfile` and open the requests; the Jenkins administrator creates the job, and the repo owner (or you, if you have admin rights on the repo) sets up the Git host side.

## Before you start

- You can push branches and open pull requests on the repo.
- You know who the repo owner and the Jenkins administrator are. See [roles and responsibilities](roles-and-responsibilities.md).
- If Jenkins is new to you, work through [your first pipeline](../tutorials/first-pipeline.md) first. [How Jenkins runs your pipeline](../concepts/how-jenkins-runs-your-pipeline.md) explains jobs, agents and executors.

## 1. Pick the build recipe

Find your project type, then use the build page for the stages and the pipeline page for the deploy, if it has one.

| Project type | Build recipe | Composed pipeline |
| --- | --- | --- |
| Node.js frontend served as static files | [Node.js](../builds/nodejs.md) | [Static Frontend](../pipelines/static-frontend.md), plus [Pull Request Previews](../pipelines/pr-preview.md) |
| Containerised service, one environment | [Docker Image Builds](../builds/docker.md) | [Container Service](../pipelines/container-service.md) |
| Containerised service, dev, staging and prod | [Docker Image Builds](../builds/docker.md) | [Promote, Don't Rebuild](../pipelines/promote-across-environments.md) |
| .NET service or library | [.NET](../builds/dotnet.md) | [Container Service](../pipelines/container-service.md) for services, [Tag-Triggered Release](../pipelines/release.md) for packages |
| Java service or library | [Java](../builds/java.md) | [Container Service](../pipelines/container-service.md) for services, [Tag-Triggered Release](../pipelines/release.md) for libraries |
| C++ with CMake | [C++ / CMake](../builds/cpp-cmake.md) | [Tag-Triggered Release](../pipelines/release.md) |
| Android app | [Android](../builds/android.md) | none; publishing is on the build page |
| React Native app | [React Native](../builds/react-native.md) | none; signing and store builds are on the build page |
| Several packages in one repo | the recipe for each package | [Monorepo](../pipelines/monorepo.md) |
| AWS Lambda function | the recipe for its language | none; see [`lambdaDeploy`](../library/lambda-deploy.md) |

Add [Lint & Static Analysis](../builds/static-analysis.md) to any of them.

## 2. Add the `Jenkinsfile`

1. Create a branch, for example `ci/add-jenkinsfile`.
2. Add a file named `Jenkinsfile` at the repo root, starting from the recipe you picked. Use a different path only if you have a reason; the administrator then needs to know it.
3. If it uses shared library steps, keep `@Library('cookbook') _` at the top. Pin the library version (`@Library('cookbook@v1.2.0') _`) if your team does that; see [conventions](conventions.md).
4. Replace the example names (`my-backend-service`, buckets, registry, account IDs) with your own. Anything you don't know yet, such as a deploy role ARN, is a request for the cloud administrator; leave the deploy stage out for now rather than guessing.
5. Check it against the [pipeline review checklist](pipeline-review-checklist.md), then push the branch. It won't build yet; there is no job.

Deploy stages should be guarded with `when { branch 'main' }` so pull requests never deploy. See [Multibranch & Pull Requests](../fundamentals/multibranch-and-pull-requests.md).

## 3. Request the multibranch job

A multibranch job scans the repo and creates a child job for each branch, pull request and tag that has a `Jenkinsfile`. Ask the Jenkins administrator for one, with these details:

```text
Subject: New multibranch pipeline job for my-backend-service

Repository URL: https://git.example.com/my-org/my-backend-service.git
Git host: GitHub / GitLab / Bitbucket / Gitea (pick one)
Folder in Jenkins: my-backend-service (or the existing folder for the team)
Script path: Jenkinsfile

Branch source credentials:
  Read access to the repo, and permission to report commit statuses.
  Please use the existing credential for this Git host if there is one
  (for GitHub, a GitHub App is preferred over a personal token).

Discover:
  - Branches: all branches, excluding branches that are also filed as PRs
  - Pull requests from this repo: build the merge with the target branch
  - Pull requests from forks: only from users with write access (or none)
  - Tags: yes, built automatically only for tags matching v*
    (needed for the release pipeline; otherwise no)

Clone behaviour: fetch tags, no shallow clone (the pipeline uses git describe)

Removed branches: discard their jobs after 7 days
Periodic scan: once a day, as a fallback for missed webhooks

Webhook: please send the payload URL and secret to use on the Git host
(the repo owner will add it).

Credentials or agents the pipeline needs: (list them, or "none yet")
Owner: (your name or role, for questions about this job)
```

The administrator may change some of these choices to match how your Jenkins is set up. If the pipeline needs credentials, request them separately with [Add a Secret or Credential](add-a-credential.md).

## 4. Add the webhook on the Git host

Without a webhook, Jenkins only notices new commits at its periodic scan, which can be hours away. With one, a push or a new pull request starts a build within seconds.

If you don't have admin rights on the repo, send the repo owner the details the Jenkins administrator gave you:

```text
Subject: Webhook for Jenkins on my-backend-service

Please add a webhook to https://git.example.com/my-org/my-backend-service

Payload URL: (from the Jenkins administrator)
Content type: application/json
Secret: (shared through the password manager, not in this message)
Events: pushes, pull requests (and tag pushes, if tags are built)
SSL verification: on
```

The payload URL depends on the plugin behind the branch source. For the GitHub plugin it is usually `https://jenkins.example.com/github-webhook/`; other hosts use other paths, which is why it's worth getting from the administrator. If the job uses a GitHub App, the app may manage the webhook itself and this step isn't needed.

After adding it, the Git host's webhook page shows recent deliveries. A green tick or a `200` response means Jenkins accepted it.

## 5. Run the first build

1. Once the job exists, open it. The first scan creates a child job for each branch with a `Jenkinsfile`, including yours.
2. If your branch isn't listed, click **Scan Multibranch Pipeline Now** and check **Scan Multibranch Pipeline Log** for the reason (often a missing credential or the wrong script path).
3. Open your branch's job and watch the first build. Parameters and triggers declared in the `Jenkinsfile` only take effect after this first run.
4. If it fails, [reading a failed build](../tutorials/reading-a-failed-build.md) and [Troubleshooting](troubleshooting.md) cover the common causes.
5. Open a pull request from the branch. Within a minute or so the PR should show a Jenkins status check. Merge it once the build is green.

## 6. Protect `main` with a required status check

A status check only stops a merge if the Git host requires it. Ask the repo owner to turn this on once the check has reported at least once, because most hosts only list checks they have already seen.

```text
Subject: Branch protection for main on my-backend-service

Please protect the main branch:
- require a pull request before merging
- require the Jenkins status check to pass: continuous-integration/jenkins/pr-merge
- require branches to be up to date before merging (optional)
- block force pushes and deletion of main
```

On GitHub the check names from the branch source are `continuous-integration/jenkins/pr-merge` for PR builds and `continuous-integration/jenkins/branch` for branch builds. Other hosts have an equivalent setting, such as GitLab's "Pipelines must succeed". Use the name your host shows on the pull request.

## 7. Add timeouts and options defaults

Add the [options defaults](../fundamentals/options-defaults.md) so a stuck build can't hold an executor forever and old builds don't fill the controller's disk:

```groovy
options {
    // a hung build gets aborted instead of holding an executor forever
    timeout(time: 30, unit: 'MINUTES')
    timestamps()
    // a newer push to the same branch aborts the build it replaces
    disableConcurrentBuilds(abortPrevious: true)
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5'))
}
```

Set the timeout a little above your slowest normal build. For a pipeline with approval gates, leave `disableConcurrentBuilds(abortPrevious: true)` out unless you want each new push to abort the run waiting for approval, and rely on the `milestone` step instead; see [How to Work with Promotions](promotions.md).

## 8. Add notifications

Tell people when a build on `main` fails, rather than relying on someone checking Jenkins:

```groovy
post {
    failure {
        notifySlack(channel: '#my-backend-service-builds')
    }
    fixed {
        notifySlack(channel: '#my-backend-service-builds')
    }
}
```

`fixed` fires on the first green build after a failure, so the channel hears when it's resolved. [`notifySlack` & `notifyTeams`](../library/notify.md) has both steps. The Slack step uses the workspace the Jenkins administrator configured; ask them to invite the bot to your channel. For Teams, the webhook URL is a secret, so request it as a credential. More patterns are in [Post-Actions & Status Notifications](../fundamentals/post-actions-and-status-notifications.md).

## Related

- [Multibranch & Pull Requests](../fundamentals/multibranch-and-pull-requests.md)
- [Triggers](../fundamentals/triggers.md)
- [Branches and pull requests](../concepts/branches-and-pull-requests.md)
- [Add a Secret or Credential](add-a-credential.md)
- [Pipeline review checklist](pipeline-review-checklist.md)
- [From build to deploy](../tutorials/build-to-deploy.md)

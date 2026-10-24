# Roles and Responsibilities

Who owns which part of the CI/CD setup, and who to ask when something needs changing. One person can hold several roles; on a small team the repo owner and release approver are often the same developer.

| Role | Owns | Ask them for |
| --- | --- | --- |
| Developer | the code and `Jenkinsfile` changes in their pull requests, and fixing builds they broke | a review of your pipeline change, help reading a failure in code they wrote |
| Repo owner | the repo's `Jenkinsfile`, branch protection, required checks and who can merge | merging pipeline changes, adding a required check, changing branch rules |
| Jenkins administrator | the controller, agents and labels, plugins, credentials, folders and permissions, and the shared library registration | a new credential, a new agent label or tool, a plugin, folder access, script approvals, a library version as the default |
| Cloud administrator | cloud accounts, IAM roles and policies, and the resources pipelines deploy to | a deploy role, a permission a step is missing, a new bucket, registry or environment |
| Release approver | the decision to promote a build to staging or production | approving a waiting `input` stage, agreeing a release window |

You don't need administrator rights to write or fix a pipeline. Anything in the repo is yours to change through a pull request. Anything on the controller or in a cloud account goes through the role that owns it.

> [!TIP]
> Check the console log before asking. Many failures are in the repo, not the platform. See [Reading a Failed Build](../tutorials/reading-a-failed-build.md) and [Troubleshooting](troubleshooting.md).

## How to request a change

Send the request through whatever channel the owning role uses, such as a ticket queue. Include:

- **Where**: the Jenkins job and the repo, with the branch if it matters.
- **What and why**: the change you need and the problem it solves, for example "a `slack-webhook` credential in our folder, so `notifySlack` can post build results".
- **Urgency**: whether it blocks a release, blocks a team, or can wait.
- **Evidence**: a link to the failing build and the first error line from its console log.
- **Scope**: who else is affected, such as other jobs that use the same credential, label or library step.

Never paste a secret's value into a request. Say which system it is for and let the Jenkins administrator collect it in a secure way. See [Add a Credential](add-a-credential.md).

For changes that come up often, see [Onboard a New Repo](onboard-a-new-repo.md), [Change the Shared Library](change-the-shared-library.md) and [Promotions](promotions.md).

---
tags: [code-quality, conventions]
---

# Pipeline Review Checklist

For reviewing a pull request that changes a `Jenkinsfile` or a shared library step. Copy the list into the review, tick what holds, and comment on what doesn't. Each item links to the page that explains it.

## Safety

- [ ] Secrets reach `sh` in single quotes, so the shell expands them, not Groovy. [Tips](../fundamentals/tips.md)
- [ ] No secret, or anything derived from one, is printed with `echo` or written to an archived file. [Secrets in CI](../concepts/secrets-in-ci.md)
- [ ] `withCredentials` and `withAws` wrap only the steps that need them. [Environment Variables & Secure Credentials](../fundamentals/environment-variables-and-secure-credentials.md)
- [ ] Credentials are referenced by ID from the agreed naming scheme, never inline values. [Conventions](conventions.md)
- [ ] Every deploy stage is guarded by a `branch` or `tag` condition. [`when` Conditions](../fundamentals/when-conditions.md)
- [ ] No stage that runs on a pull request from a fork has credentials in scope. [Multibranch & Pull Requests](../fundamentals/multibranch-and-pull-requests.md)
- [ ] Production deploys wait on an approval with a `submitter`. [Parameters & Approval Gates](../fundamentals/parameters-and-approval-gates.md)
- [ ] No new script approvals or sandbox workarounds are needed. [Troubleshooting](troubleshooting.md)

## Reliability

- [ ] The pipeline sets a `timeout` in `options`, and each `input` stage sets its own. [Options Defaults](../fundamentals/options-defaults.md)
- [ ] No `agent any`; every agent asks for a label. [Agents & Labels](../fundamentals/agents-and-labels.md)
- [ ] Docker agent images are pinned to an exact tag. [Agents & Labels](../fundamentals/agents-and-labels.md)
- [ ] `tools {}` names pinned installations, not `latest`. [Tips](../fundamentals/tips.md)
- [ ] The shared library is pinned, as `@Library('cookbook@vX.Y.Z') _`. [Shared Library Setup](../library/setup.md)
- [ ] Deploys use a version or build-number tag, never `latest`. [Build Once, Promote Many](../concepts/build-once-promote-many.md)
- [ ] `retry` wraps only calls to external systems, not builds or tests. [Retries & Error Handling](../fundamentals/retries-and-error-handling.md)
- [ ] `catchError` and `warnError` don't hide a real failure. [Retries & Error Handling](../fundamentals/retries-and-error-handling.md)
- [ ] Workspace and Docker cleanup sit in `post { cleanup }`, on a stage with an agent. [Post-Actions & Status Notifications](../fundamentals/post-actions-and-status-notifications.md)
- [ ] A changed library step has tests and a new version tag. [Testing the Shared Library](../library/testing.md)

## Readability

- [ ] Stages have short verb-phrase names that match other repos. [Conventions](conventions.md)
- [ ] Build logic lives in the repo's scripts or build targets, not in `sh` steps. [Tips](../fundamentals/tips.md)
- [ ] `script {}` blocks are a few lines; anything longer is a library step. [Tips](../fundamentals/tips.md)
- [ ] Long commands and step calls are split across lines, not crammed into one. [Tips](../fundamentals/tips.md)
- [ ] The `Jenkinsfile` passes the Declarative linter. [Tips](../fundamentals/tips.md)

## Cost

- [ ] Independent stages run in `parallel`. [Parallel Execution](../fundamentals/parallel-execution.md)
- [ ] Dependency downloads are cached outside the workspace. [Dependency Caches](../library/dependency-cache.md)
- [ ] Approval stages run with no agent, so a wait holds no executor. [Parameters & Approval Gates](../fundamentals/parameters-and-approval-gates.md)
- [ ] Skipped stages use `beforeAgent true` so they don't allocate an agent. [`when` Conditions](../fundamentals/when-conditions.md)
- [ ] `buildDiscarder` limits how many builds and artifacts are kept. [Options Defaults](../fundamentals/options-defaults.md)

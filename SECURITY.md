# Security Policy

This repository is a static documentation site. It has no server, accounts or user data, so the realistic security concerns are:

- **Content that teaches something unsafe.** A recipe that leaks a secret, grants more access than it needs, or recommends an insecure default.
- **Secrets or internal details committed by mistake.** Real credentials, tokens, hostnames or account IDs in a recipe or example.
- **The build and deploy chain.** Dependencies, GitHub Actions workflows and the deploy to GitHub Pages.

Problems with Jenkins itself or its plugins belong with the [Jenkins project](https://www.jenkins.io/security/), not here.

## Reporting a vulnerability

Please report privately rather than opening a public issue. Use [GitHub's private vulnerability reporting](https://github.com/dylankenneally/jenkins-cookbook/security/advisories/new): open the **Security** tab and choose **Report a vulnerability**.

Include the page or file affected, what the risk is, and a suggested fix if you have one. I'll acknowledge the report as soon as I can and credit you in the fix if you'd like.

## Supported versions

Only the current content on the default branch, as published to GitHub Pages, is maintained. Fixes land there.

## If you find a leaked secret

If a real credential has been committed, treat it as compromised and revoke or rotate it first. Rewriting git history does not help once a repository has been cloned or forked. Then report it using the steps above.

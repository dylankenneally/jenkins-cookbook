# Secrets in CI

A CI system needs secrets to do anything useful: tokens to push images, keys to deploy, passwords for test databases. It also runs code from every branch, often written by many people. This page explains where secrets live in Jenkins, how a pipeline gets at them, and the ways they leak. For syntax, see [Environment Variables & Secure Credentials](../fundamentals/environment-variables-and-secure-credentials.md).

## Where secrets live

Secrets are stored as **credentials** in Jenkins, encrypted on the controller. Each has an **ID** (such as `npm-publish-token`) that pipelines refer to. A `Jenkinsfile` contains only the ID, never the value, so the repo stays free of secrets.

Credentials can be stored at different levels:

- **Global store**: on the controller, usable by any job (with the **Global** scope). **System** scope credentials are only for Jenkins itself, such as connecting to agents, and pipelines can't use them.
- **Folder store**: attached to a folder, usable only by jobs inside it. A production deploy key stored on the folder that holds your service's jobs can't be used by unrelated jobs elsewhere.

Prefer the narrowest store that works. Your Jenkins administrator usually manages credentials; with folder permissions you may be able to add your own. See [Add a Credential](../guides/add-a-credential.md).

## Credential types

| Type | Holds | Typical use |
| --- | --- | --- |
| Secret text | one string | API token, webhook URL |
| Username with password | a pair | registry login, basic auth |
| Secret file | a whole file | `kubeconfig`, service account JSON, signing keystore |
| SSH username with private key | a key and user | Git over SSH, deploying to a host |
| AWS credentials | access key ID and secret key, optionally a role | AWS CLI calls (AWS Credentials plugin) |

Pick the type that matches the shape of the secret. A username and password stored as one secret text string can't be bound to separate variables or masked separately.

## Binding with `withCredentials`

A pipeline uses a credential by **binding** it: `withCredentials` looks up the ID, puts the value into environment variables (or a temporary file, for secret files) for the steps inside its block, masks the value in the console log, and removes it when the block ends.

```groovy
stage('Publish') {
    steps {
        withCredentials([
            usernamePassword(
                credentialsId: 'registry-login',
                usernameVariable: 'REG_USER',
                passwordVariable: 'REG_PASS'
            )
        ]) {
            // single quotes: the shell expands the variables, groovy never sees the values
            sh 'echo "$REG_PASS" | docker login --username "$REG_USER" --password-stdin registry.example.com'
        }
    }
}
```

Keep the block as small as possible, around the steps that need the secret. The `credentials()` helper in an `environment` block does the same for a whole stage or pipeline, which is convenient but puts the secret in scope for every step there. For AWS, use [`withAws`](../library/with-aws.md).

## Masking is not protection

Jenkins replaces the exact value of a bound secret with `****` in the console log. That stops accidents, such as a tool printing its config. It does not stop anything deliberate, and it misses a lot by accident too:

- a transformed value (base64, URL-encoded, split across lines) is printed as is
- files written in the workspace, archived artifacts and test reports are not masked
- a secret copied into `env` or another variable outlives the block and is no longer masked
- a step can send the value anywhere on the network

The real protection is control over **who can run code with the secret in scope**. Anyone who can push a `Jenkinsfile`, a `Makefile` or an `npm` script to a branch that Jenkins builds with a credential can read that credential. Store sensitive credentials where only the right jobs can use them, and bind them only in stages that run on trusted branches.

## Never interpolate secrets in Groovy

In Groovy, a double-quoted string expands `${…}` before the step runs. With a secret, that puts the value into the command text itself, which Jenkins records and may show in process listings on the agent:

```groovy
withCredentials([string(credentialsId: 'api-token', variable: 'API_TOKEN')]) {
    // wrong: groovy pastes the token into the command before sh runs
    sh "curl -H 'Authorization: Bearer ${API_TOKEN}' https://api.example.com/deploy"

    // right: single quotes, so the shell reads the token from its environment
    sh 'curl -H "Authorization: Bearer $API_TOKEN" https://api.example.com/deploy'
}
```

Jenkins prints `A secret was passed to "sh" using Groovy String interpolation, which is insecure` when it spots the first form. Treat that warning as a bug.

## Never echo a secret

Don't print a secret, part of one, its length or anything derived from it, even "just to check it's set". If you need to check, test for it in the shell without printing (`test -n "$API_TOKEN"`). Watch for tools that echo their own arguments, and for `set -x` in shell scripts, which prints every expanded command.

## Long-lived keys versus short-lived credentials

A static access key or token is valid until someone rotates it. If it leaks, it works for whoever has it, from anywhere, for months.

Short-lived credentials limit that. Jenkins holds one credential whose only permission is to request temporary credentials, such as assuming a deploy role in a cloud account. The temporary credentials expire after an hour or less and only exist inside the block that uses them. Each target account controls its own role, so your cloud administrator can grant and revoke production access without touching Jenkins. See [`assumeRole`](../library/assume-role.md).

Where your cloud provider supports it, prefer this over storing deploy keys per environment.

## Pull request builds from forks

A PR build runs the PR's code. For a PR from a fork, that is code from someone outside your organisation, and it runs on your agents.

- The branch source's trust setting decides which PRs are built and whose `Jenkinsfile` is used. For untrusted PRs, Jenkins uses the `Jenkinsfile` from the target branch, but the PR's build scripts, tests and dependencies still run.
- Never bind deploy or publishing credentials in stages that run on PRs. Guard them with `when { branch 'main' }` or similar; see [`when` Conditions](../fundamentals/when-conditions.md).
- For public repositories, consider not building fork PRs at all, or building them on isolated agents with no credentials.

See [Multibranch & Pull Requests](../fundamentals/multibranch-and-pull-requests.md) and [Branches, Pull Requests and What Runs Where](branches-and-pull-requests.md).

## When a secret leaks

If a secret appears in a console log, an artifact, a commit or a chat message, assume it is compromised.

1. **Rotate it** at the source: revoke the old token or key and issue a new one. This is the only step that actually fixes the leak.
2. **Update the credential** in Jenkins with the new value. Pipelines refer to the ID, so nothing else changes.
3. **Check for use**: look at the provider's access logs for the old secret while it was exposed.
4. **Clean up** the log, build or commit. Deleting a build doesn't remove copies people have already seen or downloaded, so this comes after rotation, not instead of it.

Tell your Jenkins administrator and the owner of the system the secret belongs to. If the leak came from a masking gap, the symptoms are covered in [Troubleshooting](../guides/troubleshooting.md).

## Related pages

- [Environment Variables & Secure Credentials](../fundamentals/environment-variables-and-secure-credentials.md)
- [Add a Credential](../guides/add-a-credential.md)
- [`withAws`](../library/with-aws.md) and [`assumeRole`](../library/assume-role.md)
- [`Jenkinsfile` Tips](../fundamentals/tips.md) for quoting secrets in `sh`

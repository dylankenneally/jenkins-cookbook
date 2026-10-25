---
tags: [security]
---

# Add a Secret or Credential

How to get a secret (an API token, a password, a signing key, AWS access) into Jenkins and use it in a pipeline without it ending up in the repo, the console log or a chat history. The Jenkins administrator creates the credential; you decide what kind it is, request it, and reference it by ID. For the background, see [secrets in CI](../concepts/secrets-in-ci.md).

## Before you start

- You know which system issues the secret (a package registry, a SaaS API, a signing service) and who owns the account it belongs to.
- Ideally the secret belongs to a service account or bot, not a person, so it keeps working when people change roles.
- You know your Jenkins folder. Ask the Jenkins administrator if you're not sure.
- Check the [conventions](conventions.md) page for your credential ID naming convention.

## 1. Decide the credential type

Jenkins stores credentials as typed objects, and the type decides how a pipeline gets at the value.

| What you have | Credential type | Binding in `withCredentials` |
| --- | --- | --- |
| API token, webhook URL, single secret string | Secret text | `string(credentialsId: …, variable: …)` |
| Username and password, or username and token | Username with password | `usernamePassword(...)` with `usernameVariable` and `passwordVariable` |
| A file: keystore, kube config, service account JSON, `.npmrc` | Secret file | `file(credentialsId: …, variable: …)`; the variable holds a temporary file path |
| SSH private key for Git or a server | SSH Username with private key | `sshUserPrivateKey(...)` with `keyFileVariable` |
| Certificate with private key (PKCS#12) | Certificate | `certificate(...)` with `keystoreVariable` and `passwordVariable` |
| AWS access | AWS Credentials, or better, a role (see below) | [`withAws`](../library/with-aws.md) rather than a raw binding |

For AWS, you usually don't need a new credential at all. Jenkins normally has one base AWS credential, and each target account has a deploy role that trusts it. Ask the cloud administrator for a role and use [`assumeRole`](../library/assume-role.md); see [Add an Environment or AWS Account](add-an-environment.md). Only ask for a separate AWS credential if the base one genuinely can't be used, and then ask for it with **IAM Role To Use** set so it hands out short-lived keys.

## 2. Choose a scope

Where the credential is stored decides which jobs can use it:

- **Folder** credentials are only visible to jobs inside that folder. Use this by default. A token for your service's package registry has no reason to be readable by every other team's pipeline.
- **Global** (root) credentials are visible to every job on the controller. Only use this for something genuinely shared, such as the base AWS credential or the Git host credential, and expect the administrator to push back.

Jenkins also has a field called Scope with the values Global and System. System credentials can't be used by pipelines at all, so for anything a `Jenkinsfile` needs the answer is Global, in the folder's store.

## 3. Request the credential

Send the Jenkins administrator a request with everything except the secret itself:

```text
Subject: New Jenkins credential for my-backend-service

Credential ID: my-backend-service-npm-publish-token
Type: Secret text
Store: folder my-backend-service
Description: npm publish token for registry.example.com, used by the release stage
Used by: Jenkinsfile in https://git.example.com/my-org/my-backend-service, stage "Publish"
Issued by: registry.example.com, service account ci-my-backend-service
Owner: (role or person who can issue a new one)
Rotation: every 90 days, or when the owner changes; expires (date, if it has one)

Secret handover: (how the value will reach you, see below)
```

> [!WARNING]
> Never paste the secret into the request, a ticket, chat, email or a commit. Those are searchable, copied into backups and readable by far more people than the credential will be. Treat any secret that has been through one of them as leaked.

Agree a secure handover with the administrator instead. Common options, in order of preference:

1. The administrator generates the secret themselves in the issuing system, using the service account, so it never passes through you.
2. You share it through your organisation's password manager, to the administrator only, and remove the share once it's in Jenkins.
3. A one-time, expiring secret link from a tool your organisation has approved.

## 4. Reference it in the `Jenkinsfile`

Bind the credential with `withCredentials` around the steps that need it, and use it from a single-quoted `sh` string so the shell expands it rather than Groovy:

```groovy
stage('Publish') {
    when {
        beforeAgent true
        branch 'main'
    }
    steps {
        withCredentials([string(credentialsId: 'my-backend-service-npm-publish-token', variable: 'NPM_TOKEN')]) {
            // the repo's .npmrc reads the token from the environment, so it's never written to disk:
            //   //registry.example.com/:_authToken=${NPM_TOKEN}
            sh 'npm publish --registry https://registry.example.com/'
        }
    }
}
```

A username and password, piped on standard input so it doesn't appear in the process list:

```groovy
withCredentials([
    usernamePassword(
        credentialsId: 'my-backend-service-registry-login',
        usernameVariable: 'REGISTRY_USER',
        passwordVariable: 'REGISTRY_PASSWORD'
    )
]) {
    sh '''
        printf '%s' "$REGISTRY_PASSWORD" | docker login \
          --username "$REGISTRY_USER" \
          --password-stdin \
          registry.example.com
    '''
}
```

A secret file, where the variable holds the path to a temporary copy that is deleted when the block ends:

```groovy
withCredentials([file(credentialsId: 'my-backend-service-kubeconfig-dev', variable: 'KUBECONFIG')]) {
    sh 'kubectl get pods --namespace my-backend-service'
}
```

Why the quoting matters: in `sh "curl -H 'Authorization: Bearer ${API_TOKEN}' …"` Groovy substitutes the value into the command string before it runs, and Jenkins warns that the secret was interpolated. With single quotes the command string contains only `$API_TOKEN`, and the shell fills it in.

Keep the binding as narrow as possible: one stage, the steps that need it, and never a stage that runs on pull requests from forks.

## 5. Test it safely

Jenkins masks the exact value of a bound secret in the console log, but only the exact value. A secret that is base64-encoded, split, URL-encoded or printed one character at a time comes through in the clear. So:

- don't `echo`, `printenv`, `env` or `set -x` inside the block to "check it's there"
- don't write the secret to a file in the workspace, which may be archived
- prove it works by using it, with output that doesn't include it

```groovy
withCredentials([string(credentialsId: 'my-backend-service-api-token', variable: 'API_TOKEN')]) {
    // checks the token is set and accepted, printing only the http status
    sh '''
        test -n "$API_TOKEN"
        curl --fail --silent --show-error \
          --output /dev/null \
          --write-out '%{http_code}\n' \
          -H "Authorization: Bearer $API_TOKEN" \
          https://api.example.com/v1/whoami
    '''
}
```

Run it on a branch first. If the build says the credential can't be found, check the ID for typos and that the job is inside the folder the credential was stored in.

## 6. Rotate it

Rotate on the schedule in your request, when someone who had access leaves, and whenever you're unsure whether it leaked.

1. Issue a new value in the issuing system. Keep the old one valid for now if the system allows two at once.
2. Ask the Jenkins administrator to update the existing credential in place, keeping the same ID. No `Jenkinsfile` change is needed.
3. Run a build that uses it and check it succeeds.
4. Revoke the old value in the issuing system.
5. Record the rotation date, so the next one is due on time.

## 7. If a secret leaked

Rotate first, investigate second. A leaked secret stays usable until it's revoked, whatever else you clean up.

1. Revoke or rotate it in the issuing system straight away, as in the previous section. If you can't, ask the owner to.
2. Ask the Jenkins administrator to update the credential with the new value.
3. Find where it leaked and clean up: ask the administrator to delete affected build logs, remove it from chat or tickets where possible. A secret pushed to Git is compromised even if you rewrite history, because clones and forks keep it; removing it from history is tidy-up, not a fix.
4. Check the issuing system's audit log for use you don't recognise between the leak and the rotation.
5. Tell your security contact, following your organisation's incident process.
6. Fix the cause, such as a Groovy-interpolated string or an `echo` left in for debugging.

## Related

- [Environment Variables & Secure Credentials](../fundamentals/environment-variables-and-secure-credentials.md)
- [Secrets in CI](../concepts/secrets-in-ci.md)
- [Conventions](conventions.md)
- [`withAws`](../library/with-aws.md) and [`assumeRole`](../library/assume-role.md)
- [Add an Environment or AWS Account](add-an-environment.md)
- [Roles and responsibilities](roles-and-responsibilities.md)

# `notifySlack` & `notifyTeams`

Posts the build result to a Slack channel or a Microsoft Teams channel. Both pick a status from `currentBuild.currentResult`, so they're meant for `post { always { … } }`.

## `vars/notifySlack.groovy`

```groovy
import groovy.transform.Field

// slack attachment colours; anything else (ABORTED, NOT_BUILT) falls back to grey
@Field final Map<String, String> COLOURS = [SUCCESS: 'good', UNSTABLE: 'warning', FAILURE: 'danger']

/**
 * posts the build result to a slack channel
 *  - channel: e.g. '#deployments'
 *  - message: defaults to '<result>: <job> #<build>' with a link to the build
 */
def call(Map args) {
    if (!args.channel) {
        error("notifySlack: 'channel' is required")
    }

    String result = currentBuild.currentResult
    String colour = COLOURS[result] ?: '#808080'
    String message = args.message ?: "${result}: ${env.JOB_NAME} #${env.BUILD_NUMBER} (<${env.BUILD_URL}|open>)"

    slackSend(
        channel: args.channel,
        color: colour,
        message: message
    )
}
```

## `vars/notifyTeams.groovy`

```groovy
import groovy.json.JsonOutput

/**
 * posts the build result to a teams channel through an incoming webhook
 *  - webhookCredentialsId: secret text credential holding the webhook url
 *  - message: defaults to '<result>: <job> #<build> <url>'
 */
def call(Map args) {
    if (!args.webhookCredentialsId) {
        error("notifyTeams: 'webhookCredentialsId' is required")
    }

    String result = currentBuild.currentResult
    String text = args.message ?: "${result}: ${env.JOB_NAME} #${env.BUILD_NUMBER} ${env.BUILD_URL}"

    // the adaptive card envelope that teams workflows webhooks expect
    Map card = [
        type: 'AdaptiveCard',
        version: '1.4',
        body: [[type: 'TextBlock', text: text, wrap: true]]
    ]
    Map payload = [
        type: 'message',
        attachments: [[contentType: 'application/vnd.microsoft.card.adaptive', content: card]]
    ]
    // a file keeps the message text out of shell quoting entirely
    writeFile(file: 'payload.json', text: JsonOutput.toJson(payload))

    withCredentials([string(credentialsId: args.webhookCredentialsId, variable: 'TEAMS_WEBHOOK_URL')]) {
        // single quotes: the shell expands the url, so the secret is never interpolated by groovy
        sh '''
            curl --fail --silent --show-error \
              -H 'Content-Type: application/json' \
              --data @payload.json \
              "$TEAMS_WEBHOOK_URL"
        '''
    }
}
```

## Usage

```groovy
post {
    always {
        notifySlack(channel: '#deployments')
        notifyTeams(webhookCredentialsId: 'teams-deployments-webhook')
    }
}
```

`notifySlack` needs the [Slack Notification](https://plugins.jenkins.io/slack/) plugin, configured with a workspace and bot token under **Manage Jenkins → System**. `notifyTeams` only needs `curl` on the agent and the webhook URL stored as a secret text credential; anyone holding the URL can post to the channel, so treat it as a secret.

The link in the default message uses `BUILD_URL`, which is only set when the Jenkins URL is configured under **Manage Jenkins → System**.

> [!NOTE]
> Microsoft is retiring Office 365 connectors in Teams in favour of webhooks created with the Workflows app. Create the webhook from the channel's **Workflows** menu ("Send webhook alerts to a channel"). The `curl` call is generic, so only the payload shape needs to change if the webhook does.

With `--fail`, a webhook that rejects the post fails the step. In `post { always { … } }` that turns a green build red, which is deliberate: a notification that silently stops working is easy to miss.

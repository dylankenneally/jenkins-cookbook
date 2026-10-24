# Environment Variables & Secure Credentials

How to inject environment variables and securely pull secrets (like API keys or tokens) from the Jenkins credentials store without leaking them in logs.

```groovy
pipeline {
    agent any
    environment {
        APP_ENV = 'production'
        // Pulls a secret text or credential ID stored securely in Jenkins
        API_KEY = credentials('my-production-api-key')
    }
    stages {
        stage('Deploy') {
            steps {
                sh 'echo Deploying to target environment: ${APP_ENV}'
                // Jenkins automatically masks ${API_KEY} as **** in console outputs
                // single quotes matter: the shell expands the secret, so Groovy never interpolates it into the command
                sh 'curl -X POST -H "Authorization: Bearer ${API_KEY}" https://api.example.com/deploy'
            }
        }
    }
}
```

For AWS credentials, use the [`withAws`](../library/with-aws.md) shared-library step rather than binding the keys by hand.

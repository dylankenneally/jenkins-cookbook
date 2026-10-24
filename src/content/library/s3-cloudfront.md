# `s3Sync` & `cloudFrontInvalidate`

Syncs a directory of static assets to an S3 bucket, then invalidates the CloudFront cache in front of it. Run both inside [`withAws`](with-aws.md).

## `vars/s3Sync.groovy`

```groovy
/**
 * mirrors a local directory to an s3 bucket
 *  - source: local directory, e.g. 'dist'
 *  - bucket: bucket name, optionally with a prefix ('my-bucket/site')
 *  - delete: remove bucket objects missing locally, defaults to true
 */
def call(Map args) {
    ['source', 'bucket'].each {
        if (!args[it]) {
            error("s3Sync: '${it}' is required")
        }
    }

    String delete = args.delete == false ? '' : '--delete'
    sh "aws s3 sync '${args.source}' 's3://${args.bucket}' ${delete}"
}
```

## `vars/cloudFrontInvalidate.groovy`

```groovy
/**
 * invalidates paths on a cloudfront distribution and, by default, waits for it to finish
 *  - distributionId: e.g. 'EXXXXXXXXXXXXX'
 *  - paths: defaults to ['/*']
 *  - wait: block until the invalidation completes, defaults to true
 */
def call(Map args) {
    if (!args.distributionId) {
        error("cloudFrontInvalidate: 'distributionId' is required")
    }

    List<String> paths = args.paths ?: ['/*']
    String quotedPaths = paths.collect { "'${it}'" }.join(' ')

    String createInvalidation = """
        aws cloudfront create-invalidation \
          --distribution-id '${args.distributionId}' \
          --paths ${quotedPaths} \
          --query 'Invalidation.Id' \
          --output text
    """
    String id = sh(script: createInvalidation, returnStdout: true).trim()
    echo "CloudFront invalidation started: ${id}"

    if (args.wait == false) {
        return
    }

    sh """
        aws cloudfront wait invalidation-completed \
          --distribution-id '${args.distributionId}' \
          --id '${id}'
    """
}
```

## Usage

```groovy
stage('Deploy') {
    steps {
        withAws {
            s3Sync(source: 'dist', bucket: 'my-frontend-app-bucket')
            cloudFrontInvalidate(distributionId: 'EXXXXXXXXXXXXX')
        }
    }
}
```

Waiting on the invalidation means a green build is one where users are actually getting the new assets. Pass `wait: false` if the job shouldn't block on it.

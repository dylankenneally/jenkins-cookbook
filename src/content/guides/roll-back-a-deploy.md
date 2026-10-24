# Roll Back a Bad Deploy

How to put the previous good version back after a deploy goes wrong, for each deploy target in this cookbook: ECS, CodeDeploy, Lambda, and static sites on S3 and CloudFront. It also covers the case a rollback can't fix, database migrations, and what to write down afterwards.

## Before you start

- Know what is running now and what was running before. The build history, and the build descriptions if your pipeline records deploys, tell you which versions went where; see [How to Work with Promotions](promotions.md).
- Know who can act. Most rollbacks either rerun a pipeline (anyone with build permission on the job, plus an approver) or call AWS directly in the target account (usually only the cloud administrator or an on-call engineer).
- Tell the people affected, in your team's deployment or incident channel, that you're rolling back and why.

| Rollback route | Who can do it | Access needed |
| --- | --- | --- |
| Rerun the pipeline with an older image or build | developers on the team | build permission on the job; the approver for each gated stage |
| AWS CLI or console in the target account | cloud administrator or on-call engineer | a role in that account allowing the deploy actions |
| Automatic rollback (circuit breaker, CodeDeploy alarms) | nobody; it happens on failure | configured in advance by the cloud administrator |

If you don't have direct AWS access, use the pipeline route or ask whoever holds it. Don't ask for production keys in the middle of an incident.

## 1. Decide: roll back or fix forward

Roll back when the previous version is known to be good and putting it back is quick and safe. That's most bad deploys: a crash on start, a broken page, a bad config value baked into the release.

Fix forward (merge a fix and deploy it through the normal pipeline) when:

- the release ran a database migration the old version can't work with
- the old version has a problem of its own, such as a security fix the new one contains
- the fix is small, understood, and the pipeline is fast enough that it beats the rollback

When unsure during an outage, roll back first and fix forward afterwards, unless a migration rules it out.

## 2. Amazon ECS

Check first whether ECS already rolled back. With the deployment circuit breaker on, a deploy that fails its health checks is rolled back to the last good task definition automatically, and [`ecsDeploy`](../library/ecs-deploy.md) reports the build as failed. If the service events say it rolled back, there is nothing more to do.

If the new version is running but behaving badly, there are two routes.

Rerun the pipeline for the older image. If your pipeline has the `IMAGE_TAG` parameter from [How to Work with Promotions](promotions.md), open the `main` job, click **Build with Parameters** and enter the last good tag. It redeploys through each environment with the usual approvals, so everything stays recorded in Jenkins and nobody needs direct AWS access. It is slower, because it goes through dev and staging first.

Point the service at the previous task definition revision. Every `ecsDeploy` registers a new revision, so the last good one is still there. Someone with access to the account runs:

```sh
# the newest revisions first; the family is usually the service name
aws ecs list-task-definitions \
  --family-prefix my-backend-service \
  --sort DESC \
  --max-items 5

# check which image a revision runs before using it
aws ecs describe-task-definition \
  --task-definition my-backend-service:41 \
  --query 'taskDefinition.containerDefinitions[].image' \
  --output text

aws ecs update-service \
  --cluster production \
  --service my-backend-service \
  --task-definition my-backend-service:41

aws ecs wait services-stable \
  --cluster production \
  --services my-backend-service
```

This is the fastest route. It also reverts any task definition changes made since that revision, such as new environment variables, which is usually what you want. The next pipeline deploy copies whichever revision is current, so it builds on the rolled-back one.

## 3. AWS CodeDeploy

CodeDeploy can roll back on its own. Ask the cloud administrator to turn on automatic rollback for the deployment group, triggered by a failed deployment and, if the service has CloudWatch alarms, by an alarm:

```sh
aws deploy update-deployment-group \
  --application-name my-backend-service \
  --current-deployment-group-name production \
  --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM
```

A rollback in CodeDeploy is a new deployment of the last revision that succeeded, so it appears in the deployment history like any other.

To roll back a deployment that succeeded but is behaving badly, redeploy the previous revision. [`codeDeploy`](../library/codedeploy.md) uploads each build's bundle to S3, and in the [Container Service](../pipelines/container-service.md) pipeline the bundle names the image it runs, so redeploying an old bundle redeploys the old image too:

```sh
# recent revisions, newest first
aws deploy list-application-revisions \
  --application-name my-backend-service \
  --sort-by registerTime \
  --sort-order descending \
  --max-items 5

aws deploy create-deployment \
  --application-name my-backend-service \
  --deployment-group-name production \
  --s3-location bucket=my-deployment-bundles-bucket,key=my-backend-service/jenkins-my-backend-service-main-41.zip,bundleType=zip
```

The CodeDeploy console does the same from the deployment group's history. A deployment still in progress can be stopped with `aws deploy stop-deployment --deployment-id <id> --auto-rollback-enabled`.

> [!NOTE]
> This only works while the old bundles exist. If the bucket has a lifecycle rule that expires bundles, ask the cloud administrator to keep enough of them to cover your rollback window.

## 4. AWS Lambda

[`lambdaDeploy`](../library/lambda-deploy.md) publishes an immutable version for each release and moves an alias, such as `live`, onto it. Callers use the alias, so a rollback is moving the alias back to the previous version. It takes effect straight away and changes no code.

```sh
# what the alias points at now
aws lambda get-alias \
  --function-name my-function \
  --name live

# published versions, with when each was created
aws lambda list-versions-by-function \
  --function-name my-function \
  --query 'Versions[].[Version, LastModified, Description]' \
  --output table

aws lambda update-alias \
  --function-name my-function \
  --name live \
  --function-version 17
```

A published version includes the configuration it was published with, such as environment variables and memory, so moving the alias brings those back too. Without an alias, callers use `$LATEST` and there is nothing to move back to; that's a reason to add one.

## 5. Static sites on S3 and CloudFront

[`s3Sync`](../library/s3-cloudfront.md) mirrors the build output into the bucket and deletes files that aren't in it, so the bucket holds only the latest build. To roll back you need an earlier build's output from somewhere.

Redeploy an earlier build's artifact. This works if the pipeline keeps each build's output, for example with `archiveArtifacts artifacts: 'dist/**'` in the build stage, or by also syncing it to a versioned prefix such as `s3://my-frontend-releases/<version>/`. Sync that copy back into the live bucket and invalidate the cache:

```sh
aws s3 sync \
  s3://my-frontend-releases/v2.3.1/ \
  s3://my-frontend-app-bucket/ \
  --delete

aws cloudfront create-invalidation \
  --distribution-id EXXXXXXXXXXXXX \
  --paths '/*'
```

If the pipeline doesn't keep its output, the fallbacks are weaker:

- S3 versioning, if the cloud administrator turned it on for the bucket, keeps every overwritten and deleted object. Restoring a whole site to a point in time means restoring each object's earlier version and removing delete markers, so ask the cloud administrator to do it with a script rather than by hand.
- Rebuild the last good commit, by reverting the bad change on `main` and letting the pipeline deploy. That is a new build, not the old one, which is why keeping build output is worth setting up before you need it.

Either way, invalidate CloudFront afterwards, or users keep getting the cached bad version until it expires.

## 6. Database migrations

A rollback puts old code back. It doesn't put the old schema back. If the bad release dropped or renamed a column, the old version may fail against the new schema, and running a down migration in production can lose data written since.

The way to keep rollbacks possible is to make schema changes in expand and contract steps, each in its own release:

1. Expand: add the new column or table, alongside the old one. Both old and new code work against it.
2. Migrate: release code that writes to both and reads from the new one, and backfill old rows.
3. Contract: once nothing uses the old column and you no longer need to roll back past this point, drop it in a later release.

If a release with a destructive migration has gone out, fix forward rather than rolling back, and involve whoever owns the database before running anything against it.

## 7. Record what happened

Once the service is healthy, write it down while it's fresh, in your team's incident log or the deployment channel:

```text
Rollback: my-backend-service, production
When: (start and end time, with time zone)
Bad version: v1.4.0-3-g1a2b3c4 (Jenkins build #42)
Restored version: v1.3.2 (task definition my-backend-service:41)
How: (pipeline rerun with IMAGE_TAG / update-service / alias moved / ...)
Done by: (role or person), approved by: (role or person)
Symptom: (what users saw, how it was noticed)
Cause: (if known) / follow-up to find it
Follow-ups: (fix, test that would have caught it, alarm to add)
```

Also add a note to the bad build's description in Jenkins, or ask someone with permission to, so anyone reading the deploy history later sees that it was rolled back. Then make sure the next normal deploy doesn't simply reship the bad change: revert or fix it on `main` first.

## Related

- [How to Work with Promotions](promotions.md)
- [Promote, Don't Rebuild](../pipelines/promote-across-environments.md)
- [`ecsDeploy`](../library/ecs-deploy.md), [`codeDeploy`](../library/codedeploy.md), [`lambdaDeploy`](../library/lambda-deploy.md), [`s3Sync` & `cloudFrontInvalidate`](../library/s3-cloudfront.md)
- [Build once, promote many](../concepts/build-once-promote-many.md)
- [Roles and responsibilities](roles-and-responsibilities.md)
- [Troubleshooting](troubleshooting.md)

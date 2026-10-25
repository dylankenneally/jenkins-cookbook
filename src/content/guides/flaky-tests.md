---
tags: [testing]
---

# Deal with a Flaky Test

A flaky test passes and fails on the same code. This guide covers how to confirm a test is flaky, get it out of the way of everyone else's builds without hiding it, and fix it.

## Before you start

- You can read the job's builds and test results in Jenkins.
- You can change the tests and the `Jenkinsfile` in your repo and open a pull request.
- Your team has an issue tracker where the quarantine ticket can live.
- The pipeline publishes test results with the `junit` step, so Jenkins keeps a per-test history. The [Node.js](../builds/nodejs.md), [Java](../builds/java.md) and [.NET](../builds/dotnet.md) recipes all do.

## 1. Confirm it is flaky

A test is flaky, rather than broken, when it fails without a related code change. Signs:

- **It passes on a rerun of the same commit.** Use **Replay** without changing anything, or **Build Now** if no new commits have landed on the branch. If the result changes, the code didn't cause it.
- **The test history is mixed.** Open the build's **Tests** tab (or **Test Result** page), click the failing test, then **History**. A flaky test shows passes and failures scattered across builds of unchanged code. A broken test fails every time from one build onwards.
- **The Age column is 1 again and again.** Age counts how many builds in a row a test has failed. A real regression climbs; a flaky test keeps resetting.
- **It fails on other people's unrelated pull requests.**

Note the builds where it failed and the error message each time. Different messages for the same test often point at timing or shared state.

## 2. Don't treat retry as the fix

Wrapping the test run in `retry`, or turning on a test runner's retry option, makes the build green. It doesn't make the test reliable:

- A test that fails one run in ten may be catching a real race condition that users will also hit.
- Every retry makes the build slower, and the cost grows as more flaky tests are retried.
- Nobody looks at a green build, so the flakiness spreads unnoticed.

[Retries and error handling](../fundamentals/retries-and-error-handling.md) covers where retry does belong: network steps like `npm ci` and uploads, not builds or tests.

## 3. Quarantine the test

Quarantine moves the test out of the blocking run while keeping it running and visible. Do it in one pull request:

1. **Open a ticket.** Include the test name, the builds where it failed, the error messages and an owner who will fix it. The owner is a role or the code's maintainers, not "the team".
2. **Tag the test** so the main run skips it, with the ticket next to the tag.
3. **Run quarantined tests in their own stage** that can't fail the build.

### Tag the test

With JUnit 5 and Gradle:

```java
// quarantined: flaky on slow agents, see TICKET-123, owner: order service maintainers
@Tag("quarantine")
@Test
void retriesTheOrderWhenThePaymentTimesOut() {
    // ...
}
```

```groovy
// build.gradle
test {
    useJUnitPlatform {
        // the blocking run skips quarantined tests
        excludeTags 'quarantine'
    }
}

tasks.register('quarantineTest', Test) {
    testClassesDirs = sourceSets.test.output.classesDirs
    classpath = sourceSets.test.runtimeClasspath
    useJUnitPlatform {
        includeTags 'quarantine'
    }
}
```

Other runners have the same idea: pytest markers with `-m "not quarantine"`, or for Jest, a `quarantine/` folder that the main config lists in `testPathIgnorePatterns` and a second config runs on its own. Skipping a test outright (`@Disabled`, `it.skip`) also works, but then it stops running and nobody sees whether it would pass.

### Run the quarantine stage

```groovy
stage('Quarantined Tests') {
    steps {
        // failures show on this stage only; the build result is left alone
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
            sh './gradlew --no-daemon quarantineTest'
        }
    }
    post {
        always {
            // keep the history, but don't let these failures mark the build unstable
            junit(
                testResults: 'build/test-results/quarantineTest/*.xml',
                allowEmptyResults: true,
                skipMarkingBuildUnstable: true
            )
        }
    }
}
```

The stage shows yellow when a quarantined test fails, and the per-test history keeps building up so you can see when the fix works. If you'd rather the whole build shows unstable, set `buildResult: 'UNSTABLE'` and drop `skipMarkingBuildUnstable`. Pull requests stay mergeable either way, provided your branch protection only blocks on failed builds.

> [!NOTE]
> Quarantined results are added to the same build test report as the main run, so the total failed count includes them. The test names and the stage colour make it clear which ones they are.

## 4. Fix the cause

Most flaky tests come from a short list of causes:

| Cause | Typical sign | Fix |
| --- | --- | --- |
| Time and dates | fails around midnight, month end or in another timezone | inject a clock or freeze time; set the timezone explicitly in the test |
| Ordering | passes alone, fails in the full suite, or the reverse | remove dependence on run order; run the suite in random order locally to reproduce |
| Shared state | fails when run in parallel; leftover rows, files or globals | give each test its own data, temp directory and port; reset globals in setup |
| Network | timeouts or connection errors to a real service | replace the call with a stub or a local container; never call a shared environment from unit tests |
| Fixed sleeps and short timeouts | fails on busy agents, passes on a laptop | wait for the condition (polling with a deadline) instead of sleeping; raise test timeouts to match CI agents |
| Unordered collections | asserts on the order of a set, map or query without `ORDER BY` | sort before comparing, or assert on contents only |
| Randomness | different data each run | seed the generator and print the seed on failure |

CI agents are usually slower and busier than a laptop, and run tests in parallel. To reproduce locally, run the test many times in a loop, run it with the rest of its suite, and run it while the machine is under load.

When it is fixed, remove the tag in the same pull request as the fix and close the ticket. Watch the test history for a week or so to confirm.

## 5. Keep failures visible

Quarantine only works if it stays small and temporary.

- Review the quarantine list regularly, for example at each sprint planning. Every entry should have a ticket and an owner.
- Set an expiry. If a quarantined test isn't fixed by then, either fix it, rewrite it, or delete it on purpose with a note in the ticket.
- Don't quarantine a test that covers critical behaviour without replacing that coverage. Raise it with the repo owner instead.
- Never quarantine a failure you haven't confirmed is flaky. A real regression in quarantine is a bug shipped.

## Related

- [Retries and error handling](../fundamentals/retries-and-error-handling.md)
- [Reading a failed build](../tutorials/reading-a-failed-build.md)
- [Post-actions and status notifications](../fundamentals/post-actions-and-status-notifications.md)
- [Nightly pipeline](../pipelines/nightly.md)
- [Pipeline review checklist](pipeline-review-checklist.md)
- [Troubleshooting](troubleshooting.md)

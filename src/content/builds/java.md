# Java Build & Test

Builds and tests a Maven project through the Maven Wrapper in a single lifecycle, and publishes the test results. The wrapper pins the Maven version in `.mvn/wrapper/maven-wrapper.properties`, so every agent builds with the same Maven.

```groovy
pipeline {
    agent any
    stages {
        stage('Build & Test') {
            steps {
                // -B is batch mode, -ntp drops the per-artifact download lines from the log
                sh './mvnw -B -ntp verify'
            }
            post {
                always {
                    // junit plugin; always, so failed tests are published too
                    junit 'target/surefire-reports/*.xml'
                }
            }
        }
    }
}
```

`verify` runs every phase up to and including it: compile, test, package, then the integration test phases. `-ntp` is the short form of `--no-transfer-progress`; without it, a cold build logs a line for every artifact it downloads. In a multi-module project, use `**/target/surefire-reports/*.xml`.

Splitting this into `./mvnw package -DskipTests` and then `./mvnw test` does the work twice. Each Maven invocation starts the lifecycle from the beginning, so `test` goes back through resources, compile and test-compile before it runs the tests. The compiler's staleness check saves some time, but the plugins still run, and the jar from the first command was built without the tests ever gating it. One `verify` builds, tests and packages in one pass.

## Gradle

The Gradle Wrapper pins the Gradle version in `gradle/wrapper/gradle-wrapper.properties`. `build` compiles, runs the tests and assembles the outputs.

```groovy
stage('Build & Test') {
    steps {
        sh './gradlew build --no-daemon'
    }
    post {
        always {
            junit 'build/test-results/test/*.xml'
        }
    }
}
```

The Gradle daemon is a background JVM that stays alive after the build to speed up the next one. On a CI agent it rarely gets reused, because Jenkins kills the processes a build started when the build ends. A daemon that does survive holds memory on the agent between jobs. `--no-daemon` runs the build in a single JVM that exits with it. In a multi-project build, use `**/build/test-results/test/*.xml`.

## JDK version

The `tools` directive puts a JDK installation on `PATH` and sets `JAVA_HOME` for the whole pipeline. The name refers to a JDK installation configured under Manage Jenkins → Tools.

```groovy
pipeline {
    agent any
    tools {
        // must match the installation name under manage jenkins → tools exactly
        jdk 'temurin-21'
    }
    stages {
        stage('Build & Test') {
            steps {
                sh './mvnw -B -ntp verify'
            }
        }
    }
}
```

The installation decides the exact JDK release, so configure it with a specific version: either a fixed path on the agents, or the Eclipse Temurin installer plugin set to one release. Then upgrading the JDK is a change to the installation, not to every `Jenkinsfile`.

The alternative is a Docker agent pinned to an exact image tag, which needs the Docker Pipeline plugin and Docker on the agent:

```groovy
pipeline {
    agent {
        docker {
            // exact release tag; plain 21-jdk moves with every patch release
            image 'eclipse-temurin:21.0.5_11-jdk'
        }
    }
    stages {
        stage('Build & Test') {
            steps {
                sh './mvnw -B -ntp verify'
            }
        }
    }
}
```

Gradle can pick the JDK itself with a toolchain. The build compiles and runs the tests with the toolchain JDK, whichever JDK runs Gradle. In `build.gradle`:

```groovy
java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}
```

Gradle looks for a matching JDK on the agent first. To let it download one when none is found, apply the Foojay resolver in `settings.gradle`:

```groovy
plugins {
    id 'org.gradle.toolchains.foojay-resolver-convention' version '1.0.0'
}
```

Gradle itself still needs a JDK to run on, so combine the toolchain with `tools` or a Docker agent. Version 1.0.0 of the resolver needs Gradle to run on Java 17 or later. Downloaded JDKs are kept under `GRADLE_USER_HOME`, so the dependency cache below also keeps them between builds.

## Integration tests

The Failsafe plugin runs integration tests (classes named `*IT` by default) in the `integration-test` phase and checks their results in the `verify` phase. The split means a failing test still lets `post-integration-test` tear down whatever the tests started before the build fails. Failsafe only runs when its `integration-test` and `verify` goals are bound in the pom; pin the plugin version there too.

Because the main pipeline already runs `verify`, the integration tests run in the same command. Publish their results next to the unit tests:

```groovy
stage('Build & Test') {
    steps {
        sh './mvnw -B -ntp verify'
    }
    post {
        always {
            junit 'target/surefire-reports/*.xml'
            junit 'target/failsafe-reports/*.xml'
        }
    }
}
```

`-DskipITs` skips only the integration tests, which suits a quick feedback stage. `-DskipTests` skips both Surefire and Failsafe.

## Coverage

JaCoCo's Maven plugin attaches its agent to the test JVM with the `prepare-agent` goal, and writes the report with the `report` goal, which runs in the `verify` phase. Both goals are bound in the pom, with the plugin version pinned. The XML report lands in `target/site/jacoco/jacoco.xml`.

```groovy
stage('Build & Test') {
    steps {
        sh './mvnw -B -ntp verify'
    }
    post {
        always {
            junit 'target/surefire-reports/*.xml'
            // coverage plugin; the glob picks up every module's report
            recordCoverage(
                tools: [[parser: 'JACOCO', pattern: '**/target/site/jacoco/jacoco.xml']]
            )
        }
    }
}
```

For Gradle, apply the `jacoco` plugin, turn on the XML report in `jacocoTestReport` (`reports { xml.required = true }`), and run `./gradlew build jacocoTestReport --no-daemon`. The report is written to `build/reports/jacoco/test/jacocoTestReport.xml`.

Quality gates work the same way as on the [Node.js](nodejs.md) page:

```groovy
recordCoverage(
    tools: [[parser: 'JACOCO', pattern: '**/target/site/jacoco/jacoco.xml']],
    qualityGates: [[threshold: 80.0, metric: 'LINE', baseline: 'PROJECT', criticality: 'UNSTABLE']]
)
```

## Dependency cache

Maven keeps downloaded artifacts in its local repository, `~/.m2/repository`, and Gradle keeps its caches under `GRADLE_USER_HOME` (default `~/.gradle`). On a plain agent both are already outside the workspace. Setting them explicitly matters on container agents, where the home directory is throwaway or unwritable, and it makes the location something that can be mounted, sized and pruned. This follows the same reasoning as the [dependency cache](../library/dependency-cache.md) building block.

```groovy
environment {
    // outside the workspace, so cleanWs() and fresh checkouts keep downloaded artifacts
    MAVEN_REPO = "${env.HOME}/.cache/jenkins/m2"
    GRADLE_USER_HOME = "${env.HOME}/.cache/jenkins/gradle"
}
```

```groovy
stage('Build & Test') {
    steps {
        // file-lock lets concurrent builds share the local repository safely on maven 3.9
        sh '''
            ./mvnw -B -ntp verify \
              -Dmaven.repo.local="$MAVEN_REPO" \
              -Daether.syncContext.named.factory=file-lock \
              -Daether.syncContext.named.nameMapper=file-gav
        '''
    }
}
```

The same `-D` options can go in `MAVEN_OPTS` instead, which keeps the `sh` commands short. Gradle reads `GRADLE_USER_HOME` from the environment with no extra flags. Moving it also moves where Gradle looks for a user-level `gradle.properties` and init scripts.

> [!WARNING]
> Two concurrent builds sharing one local Maven repository is a known race. Maven 3.9's default locking only coordinates threads inside one JVM, so two builds on the same agent can read a half-written artifact or corrupt the repository's metadata. The resolver's file locking (`-Daether.syncContext.named.factory=file-lock`, which needs the `file-gav` name mapper on Maven 3.9) coordinates separate processes on one machine. Maven 4 ships Resolver 2, which uses file locking by default. File locks are unreliable on NFS, so don't share one repository between agents. Gradle locks its own caches, so a shared `GRADLE_USER_HOME` is safe on one agent.

> [!NOTE]
> The cache lives on the agent, so it doesn't survive ephemeral agents. There, point the paths at a mounted volume, or accept a cold cache on each build.

## Publishing

`./mvnw deploy` runs the full lifecycle and then uploads the artifacts to the repository in the pom's `distributionManagement`. Maven reads repository credentials from a `settings.xml` `<server>` entry whose `id` matches that repository, so the credentials go into a settings file, not onto the command line. The Config File Provider plugin stores the file in Jenkins and writes it to a temporary path for the duration of the block.

```groovy
stage('Deploy') {
    when {
        branch 'main'
    }
    steps {
        // config file provider plugin; the file is removed when the block ends
        configFileProvider([configFile(fileId: 'maven-settings', variable: 'MAVEN_SETTINGS')]) {
            // single quotes: the shell expands the path, groovy never sees it
            sh '''
                ./mvnw -B -ntp deploy \
                  -s "$MAVEN_SETTINGS" \
                  -DskipTests
            '''
        }
    }
}
```

Create `maven-settings` as a Maven settings.xml config file, and use its Server Credentials section to map each server `id` to a Jenkins username and password credential. The plugin fills the credentials in when it writes the file, so the stored file has no passwords in it. The credentials themselves come from the Credentials plugin, which Config File Provider depends on.

The `Deploy` stage starts the lifecycle again. `-DskipTests` stops it from running the tests a second time, since the `Build & Test` stage already ran them on the same commit. To build only once on `main`, run `deploy` in place of `verify` there. A repository that rejects redeploying a release version fails a re-run of the same build; snapshot versions can be deployed any number of times.

## Notes

- Warnings Next Generation reads `javac` warnings from the console log with `java()`, and Maven's own warnings with `mavenConsole()`. It also has parsers for SpotBugs (`spotBugs()`), Checkstyle (`checkStyle()`) and PMD (`pmdParser()`) reports. `mvn sonar:sonar` runs the SonarQube analysis inside `withSonarQubeEnv`. Quality gates and the SonarQube setup are in [lint & static analysis](static-analysis.md).
- To build and test against several JDK versions, put the JDK on a matrix axis; see [matrix builds](../fundamentals/matrix-builds.md).
- To ship the build as a container image, use Jib (which builds the image from Maven or Gradle without a Dockerfile) or a Dockerfile, then follow the [container service pipeline](../pipelines/container-service.md).

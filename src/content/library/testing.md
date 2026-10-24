# Testing the Shared Library

Every pipeline that loads the library runs its steps, so a broken step breaks every build at once. [JenkinsPipelineUnit](https://github.com/jenkinsci/JenkinsPipelineUnit) loads a `vars/` script outside Jenkins, with pipeline steps like `sh` and `error` replaced by mocks, so each step's logic can be unit tested in the library's own repo.

## Repository layout

```text
jenkins-shared-library/
├── vars/
│   ├── dockerPushToEcr.groovy
│   └── ...
├── test/
│   └── DockerPushToEcrTest.groovy  # one test class per step
├── build.gradle
├── settings.gradle
├── gradlew                         # gradle wrapper, committed
├── gradle/wrapper/
└── Jenkinsfile                     # runs the tests for the library itself
```

Tests live in a top-level `test/` rather than `src/test/groovy`, because Jenkins puts the library's `src/` on every pipeline's classpath.

## `build.gradle`

```groovy
plugins {
    id 'groovy'
}

repositories {
    mavenCentral()
    // JenkinsPipelineUnit releases from 1.2 on are only published here
    maven { url 'https://repo.jenkins-ci.org/releases/' }
}

java {
    // JenkinsPipelineUnit needs java 21
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

dependencies {
    // groovy 3, as JenkinsPipelineUnit doesn't support groovy 4
    testImplementation 'org.codehaus.groovy:groovy:3.0.25'
    testImplementation 'com.lesfurets:jenkins-pipeline-unit:1.31'
    testImplementation platform('org.junit:junit-bom:5.11.4')
    testImplementation 'org.junit.jupiter:junit-jupiter'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}

sourceSets {
    test {
        groovy {
            srcDirs = ['test']
        }
    }
}

test {
    useJUnitPlatform()
}
```

`settings.gradle` only needs `rootProject.name = 'jenkins-shared-library'`. Generate the wrapper once with `gradle wrapper` and commit it, so agents don't need Gradle installed.

## `test/DockerPushToEcrTest.groovy`

```groovy
import com.lesfurets.jenkins.unit.BasePipelineTest
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

import static org.junit.jupiter.api.Assertions.assertEquals
import static org.junit.jupiter.api.Assertions.assertThrows
import static org.junit.jupiter.api.Assertions.assertTrue

class DockerPushToEcrTest extends BasePipelineTest {

    static final String REGISTRY = '123456789012.dkr.ecr.us-east-1.amazonaws.com'

    Script step

    @Override
    @BeforeEach
    void setUp() {
        super.setUp()

        // record shell commands instead of running them
        helper.registerAllowedMethod('sh', [String]) { cmd ->
            return null
        }
        // the default error mock only marks the build failed, so throw to stop the step as jenkins does
        helper.registerAllowedMethod('error', [String]) { message ->
            throw new IllegalArgumentException(message)
        }

        addEnvVar('BUILD_TAG', 'jenkins-my-app-42')
        step = loadScript('vars/dockerPushToEcr.groovy')
    }

    @Test
    void pushesEveryTagAndReturnsThePrimaryUri() {
        String uri = step.call(
            registry: REGISTRY,
            image: 'my-app',
            tag: '42',
            extraTags: ['latest']
        )

        assertEquals("${REGISTRY}/my-app:42".toString(), uri)
        List<String> commands = shellCommands()
        assertTrue(commands.any { it.contains("docker push '${REGISTRY}/my-app:42'") })
        assertTrue(commands.any { it.contains("docker push '${REGISTRY}/my-app:latest'") })
        assertTrue(commands.last().contains("docker logout '${REGISTRY}'"))
    }

    @Test
    void logsOutEvenWhenAPushFails() {
        helper.registerAllowedMethod('sh', [String]) { cmd ->
            if (cmd.toString().startsWith('docker push')) {
                throw new RuntimeException('push failed')
            }
            return null
        }

        assertThrows(RuntimeException) {
            step.call(registry: REGISTRY, image: 'my-app', tag: '42')
        }
        assertTrue(shellCommands().last().contains("docker logout '${REGISTRY}'"))
    }

    @Test
    void failsWhenARequiredArgIsMissing() {
        Exception e = assertThrows(IllegalArgumentException) {
            step.call(registry: REGISTRY, image: 'my-app')
        }

        assertEquals("dockerPushToEcr: 'tag' is required", e.message)
        // it stopped before building anything
        assertTrue(shellCommands().isEmpty())
    }

    // the sh commands the step ran, in order
    private List<String> shellCommands() {
        return helper.callStack
            .findAll { it.methodName == 'sh' }
            .collect { it.args[0].toString() }
    }
}
```

`helper.registerAllowedMethod` replaces a step's mock for the given argument types, and `helper.callStack` records every intercepted call with its `methodName` and `args`. Register only the steps a test cares about. `BasePipelineTest` already mocks the common ones (`echo`, `dir`, `withEnv`, `withCredentials` and more), and any step that isn't mocked fails the test.

## `Jenkinsfile`

The library repo gets its own pipeline, so a change is tested before any pipeline can load it. It doesn't load the library with `@Library`; it only tests it.

```groovy
pipeline {
    agent any
    options {
        timeout(time: 15, unit: 'MINUTES')
    }
    stages {
        stage('Test') {
            steps {
                sh './gradlew test --no-daemon'
            }
        }
    }
    post {
        always {
            // results are missing if compilation failed, and the failed sh already reports that
            junit(testResults: 'build/test-results/test/*.xml', allowEmptyResults: true)
        }
        cleanup {
            cleanWs()
        }
    }
}
```

The agent needs JDK 21, or Gradle's toolchain support configured to download one. Publishing results needs the [JUnit](https://plugins.jenkins.io/junit/) plugin.

> [!NOTE]
> These tests check a step's own logic: argument checks, the commands it builds and the order it runs them in. They don't run the commands, so they won't catch a wrong AWS CLI flag. Try a changed step from a branch first with `@Library('cookbook@my-branch') _` in a test pipeline.

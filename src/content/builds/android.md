---
tags: [mobile, testing, code-quality]
---

# Android Build & Test

Runs Android Lint and the JVM unit tests with the Gradle wrapper, then assembles the release build. Needs the JUnit and Warnings Next Generation plugins, plus Credentials Binding for signing.

```groovy
pipeline {
    // the agent needs the android sdk and a jdk; see agent and sdk below
    agent {
        label 'android'
    }
    stages {
        stage('Lint') {
            steps {
                sh './gradlew --no-daemon lintDebug'
            }
            post {
                always {
                    // warnings next generation plugin; lint errors fail the stage, so publish on failure too
                    recordIssues(
                        enabledForFailure: true,
                        tools: [androidLintParser(pattern: '**/build/reports/lint-results-*.xml')]
                    )
                }
            }
        }
        stage('Unit Tests') {
            steps {
                sh './gradlew --no-daemon testDebugUnitTest'
            }
            post {
                always {
                    junit '**/build/test-results/**/*.xml'
                }
            }
        }
        stage('Assemble') {
            steps {
                sh './gradlew --no-daemon assembleRelease'
            }
        }
    }
}
```

`--no-daemon` stops a Gradle daemon outliving the build on a shared agent. Separate stages give separate results in the stage view, but each one pays Gradle's configuration time again. `./gradlew --no-daemon lintDebug testDebugUnitTest assembleRelease` in one stage is faster; add `--continue` so the tests still run when lint fails. Quality gates on the lint issues work as described in [lint & static analysis](static-analysis.md).

The wrapper pins the Gradle version. Add `distributionSha256Sum` to `gradle/wrapper/gradle-wrapper.properties` so the agent also checks the download.

## Agent and SDK

The Android Gradle plugin (AGP) needs JDK 17 to run, from AGP 8.0 up to the current 9.x releases. Either set `JAVA_HOME` on the agent or pick a JDK configured under Manage Jenkins > Tools:

```groovy
tools {
    // the name given to the jdk under manage jenkins > tools
    jdk 'temurin-17'
}
```

The safer default is a labelled agent with the SDK installed once, `ANDROID_HOME` set in the node's environment, and the licences accepted. Install the command-line tools, then pin each package:

```bash
# linux shown; macos agents use the mac_arm64 or mac_x86_64 zip of the same build
export ANDROID_HOME="$HOME/android-sdk"
mkdir -p "$ANDROID_HOME/cmdline-tools"
curl -fsSLo /tmp/cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip
unzip -q /tmp/cmdline-tools.zip -d "$ANDROID_HOME/cmdline-tools"
# sdkmanager expects to live under cmdline-tools/latest
mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"

"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --install \
  "platform-tools" \
  "platforms;android-35" \
  "build-tools;35.0.0"
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses
```

Match the packages to the project. `platforms;android-N` follows `compileSdk`, and `build-tools` follows the AGP version: AGP 8.13 uses 35.0.0, and AGP 9.4 needs at least 36.0.0. If a required package is missing, AGP tries to download it during the build, which only works where the licences are accepted and fails on a read-only SDK.

A pinned Docker image is the other option:

```groovy
agent {
    docker {
        // not an official google image: circleci maintains it, so pin the exact tag
        image 'cimg/android:2026.10.1'
        label 'linux && docker'
    }
}
```

Check which JDK and SDK packages a tag ships before pinning it. Jenkins runs the container as the agent's user, so `GRADLE_USER_HOME` must point at a path that user can write; see the Gradle cache section below. Docker agents need the Docker Pipeline plugin, covered in [agents and labels](../fundamentals/agents-and-labels.md).

## Signing a release

The upload keystore is stored as a Jenkins Secret file credential, and the store and key passwords as Secret text. The key alias isn't secret, so it is a plain environment variable. Gradle reads the values from the environment in a `signingConfigs` block, so nothing secret reaches the command line.

```kotlin
// app/build.gradle.kts
// ci sets these inside withCredentials; local builds without them stay unsigned
val keystoreFile = providers.environmentVariable("KEYSTORE_FILE").orNull

android {
    signingConfigs {
        if (keystoreFile != null) {
            create("release") {
                storeFile = file(keystoreFile)
                // get() fails the build if ci forgot to bind a password
                storePassword = providers.environmentVariable("KEYSTORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("KEY_ALIAS").get()
                keyPassword = providers.environmentVariable("KEY_PASSWORD").get()
            }
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.findByName("release")
        }
    }
}
```

```groovy
stage('Bundle') {
    when {
        branch 'main'
    }
    environment {
        KEY_ALIAS = 'upload'
    }
    steps {
        withCredentials([
            file(credentialsId: 'android-upload-keystore', variable: 'KEYSTORE_FILE'),
            string(credentialsId: 'android-keystore-password', variable: 'KEYSTORE_PASSWORD'),
            string(credentialsId: 'android-key-password', variable: 'KEY_PASSWORD')
        ]) {
            // gradle reads the bound env vars itself; groovy never sees the secrets
            sh './gradlew --no-daemon bundleRelease'
        }
    }
    post {
        success {
            // mapping.txt deobfuscates crash stack traces for this exact build
            archiveArtifacts(
                artifacts: '**/build/outputs/bundle/release/*.aab, **/build/outputs/mapping/release/mapping.txt',
                fingerprint: true
            )
        }
    }
}
```

`mapping.txt` only exists when R8 is on (`isMinifyEnabled = true`). Upload it to Play Console with the bundle, or keep the archived copy, since crash reports can't be read without it.

Without changing `build.gradle.kts`, Gradle also accepts the signing properties Android Studio injects, inside the same `withCredentials` block:

```groovy
// single quotes: the shell expands the secrets, groovy never interpolates them
sh '''
    ./gradlew --no-daemon bundleRelease \
      -Pandroid.injected.signing.store.file="$KEYSTORE_FILE" \
      -Pandroid.injected.signing.store.password="$KEYSTORE_PASSWORD" \
      -Pandroid.injected.signing.key.alias="$KEY_ALIAS" \
      -Pandroid.injected.signing.key.password="$KEY_PASSWORD"
'''
```

These properties are meant for the IDE and aren't a documented public API. They also put the passwords in the Gradle process's arguments, where other processes on the agent can read them; Jenkins only masks them in the log. Prefer the `signingConfigs` block.

> [!NOTE]
> With Play App Signing, this keystore holds the upload key, not the key users' devices see. Google re-signs the bundle, so a lost upload key can be reset through Play Console.

## Instrumented tests

Emulators on CI are slow and flaky. Run `connectedDebugAndroidTest` on an agent with hardware acceleration (KVM on Linux, the Hypervisor framework on macOS), with the emulator, a system image and an AVD installed alongside the SDK. Jenkins kills background processes when an `sh` step ends, so the emulator is started, awaited and used in a single step.

```groovy
stage('Instrumented Tests') {
    agent {
        label 'android && kvm'
    }
    options {
        // a stuck boot loop ends here instead of holding the agent
        timeout(time: 30, unit: 'MINUTES')
    }
    steps {
        sh '''
            "$ANDROID_HOME/emulator/emulator" \
              -avd ci-api-35 \
              -no-window \
              -no-audio \
              -no-snapshot \
              > emulator.log 2>&1 &
            trap '"$ANDROID_HOME/platform-tools/adb" emu kill' EXIT

            "$ANDROID_HOME/platform-tools/adb" wait-for-device
            # the device appears long before android finishes booting
            until [ "$("$ANDROID_HOME/platform-tools/adb" shell getprop sys.boot_completed | tr -d '\\r')" = "1" ]; do
                sleep 5
            done

            ./gradlew --no-daemon connectedDebugAndroidTest
        '''
    }
    post {
        always {
            junit '**/build/outputs/androidTest-results/connected/**/*.xml'
            archiveArtifacts artifacts: 'emulator.log', allowEmptyArchive: true
        }
    }
}
```

The AVD is created once on the agent, for example with `sdkmanager --install "emulator" "system-images;android-35;google_apis;x86_64"` and `avdmanager create avd -n ci-api-35 -k "system-images;android-35;google_apis;x86_64"`. Apple silicon agents need the `arm64-v8a` image instead.

Firebase Test Lab avoids running emulators at all. Build the app and test APKs with `assembleDebug assembleDebugAndroidTest`, then hand them to `gcloud`, authenticated with a service account key stored as a Secret file credential:

```groovy
stage('Test Lab') {
    environment {
        // keeps gcloud's login out of the agent user's home
        CLOUDSDK_CONFIG = "${env.WORKSPACE_TMP}/gcloud"
    }
    steps {
        withCredentials([file(credentialsId: 'firebase-test-lab-sa', variable: 'GCLOUD_KEY_FILE')]) {
            sh '''
                gcloud auth activate-service-account --key-file="$GCLOUD_KEY_FILE"
                gcloud firebase test android run \
                  --project my-firebase-project \
                  --type instrumentation \
                  --app app/build/outputs/apk/debug/app-debug.apk \
                  --test app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk \
                  --device model=MediumPhone.arm,version=34 \
                  --num-flaky-test-attempts 1
            '''
        }
    }
}
```

`gcloud firebase test android models list` shows the valid `model` and `version` ids. The command exits non-zero when a test fails, which fails the stage.

## Publishing to Google Play

Upload the signed AAB with [Gradle Play Publisher](https://github.com/Triple-T/gradle-play-publisher) (`com.github.triplet.play`, pinned, then `./gradlew publishReleaseBundle`) or fastlane's `supply`. Both authenticate with a Play service account JSON key, stored as a Secret file credential. Put the stage behind an approval gate as in [parameters and approval gates](../fundamentals/parameters-and-approval-gates.md).

```groovy
stage('Publish to Play') {
    steps {
        withCredentials([file(credentialsId: 'play-service-account', variable: 'PLAY_JSON_KEY')]) {
            sh '''
                fastlane supply \
                  --aab app/build/outputs/bundle/release/app-release.aab \
                  --json_key "$PLAY_JSON_KEY" \
                  --package_name com.example.app \
                  --track internal
            '''
        }
    }
}
```

Gradle Play Publisher reads the key from `serviceAccountCredentials` in its `play` block, or from the JSON contents in the `ANDROID_PUBLISHER_CREDENTIALS` environment variable. Its default track is `internal`.

## Gradle cache

Gradle keeps the wrapper distribution, downloaded dependencies and its local build cache under `GRADLE_USER_HOME`. Point it at a persistent per-agent path outside the workspace:

```groovy
environment {
    // outside the workspace, so cleanWs() and fresh checkouts keep the downloads
    GRADLE_USER_HOME = "${env.HOME}/.cache/jenkins/gradle"
}
```

Gradle locks its caches, so concurrent builds on the same agent can share the directory. Turn on the build cache with `org.gradle.caching=true` in `gradle.properties` to reuse task outputs across builds; a remote build cache node shares them across agents too. The [dependency cache](../library/dependency-cache.md) building block applies the same idea to npm and NuGet.

> [!NOTE]
> The cache lives on the agent, so ephemeral and container agents start cold unless the path is a mounted volume.

## Notes

- [React Native](react-native.md) builds its Android app with the Gradle wrapper too, and reuses this page's signing approach.
- Release builds on `main` only, as in the `Bundle` stage, keep the upload keystore away from pull request builds. See [multibranch and pull requests](../fundamentals/multibranch-and-pull-requests.md).

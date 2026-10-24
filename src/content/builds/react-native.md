# React Native Build & Test

Type-checks, lints and tests the JavaScript once on Linux, then builds the Android and iOS apps side by side. iOS can only be built on macOS with Xcode installed, so that stage runs on a `macos` agent.

```groovy
pipeline {
    // no global agent: each stage asks for the machine it needs
    agent none

    stages {
        stage('JS') {
            agent {
                docker {
                    // match the version in .nvmrc so every stage runs the same node
                    image 'node:22.11.0'
                    label 'linux && docker'
                }
            }
            environment {
                JEST_JUNIT_OUTPUT_DIR = 'reports'
            }
            steps {
                sh 'npm ci'
                // typescript projects only
                sh 'npx tsc --noEmit'
                sh 'npm run lint'
                sh '''
                    npx jest \
                      --ci \
                      --reporters=default \
                      --reporters=jest-junit
                '''
            }
            post {
                always {
                    junit 'reports/junit.xml'
                }
            }
        }

        stage('Native') {
            parallel {
                stage('Android') {
                    agent {
                        label 'linux && android-sdk'
                    }
                    steps {
                        // gradle runs node to bundle the js, so it needs node_modules here too
                        sh 'npm ci'
                        dir('android') {
                            // no daemon: a fresh gradle per build, nothing left running on the agent
                            sh './gradlew --no-daemon assembleRelease bundleRelease'
                        }
                    }
                    post {
                        success {
                            archiveArtifacts(
                                artifacts: 'android/app/build/outputs/**/*.aab, android/app/build/outputs/**/*.apk',
                                fingerprint: true
                            )
                        }
                    }
                }

                stage('iOS') {
                    agent {
                        label 'macos'
                    }
                    environment {
                        // pins xcodebuild, xcrun and the sdk to one installed xcode
                        DEVELOPER_DIR = '/Applications/Xcode_26.app/Contents/Developer'
                    }
                    steps {
                        sh 'xcodebuild -version'
                        sh 'npm ci'
                        // cocoapods comes from the Gemfile, so its version is locked in Gemfile.lock
                        sh 'bundle config set --local deployment true'
                        sh 'bundle install'
                        dir('ios') {
                            // --deployment fails if Podfile.lock is out of date instead of rewriting it
                            sh 'bundle exec pod install --deployment'
                        }
                        // signing setup goes here, see ios signing below
                        sh '''
                            xcodebuild \
                              -workspace ios/App.xcworkspace \
                              -scheme App \
                              -configuration Release \
                              -sdk iphoneos \
                              -archivePath build/App.xcarchive \
                              archive
                        '''
                        sh '''
                            xcodebuild \
                              -exportArchive \
                              -archivePath build/App.xcarchive \
                              -exportPath build/export \
                              -exportOptionsPlist ios/ExportOptions.plist
                        '''
                    }
                    post {
                        success {
                            archiveArtifacts(
                                artifacts: 'build/export/*.ipa, build/App.xcarchive/dSYMs/**',
                                fingerprint: true
                            )
                        }
                    }
                }
            }
        }
    }
}
```

`junit` comes from the JUnit plugin and the `docker` agent from the Docker Pipeline plugin. Jest needs the `jest-junit` reporter; setup and Cobertura coverage are covered in [Node.js](nodejs.md).

Each stage runs on its own agent with its own workspace, so each one runs `npm ci`. The native builds read from `node_modules` (React Native's Gradle plugin, the Pods, the Metro bundler), so they can't skip it.

> [!NOTE]
> Passing `node_modules` between stages with [stash](../fundamentals/stash-and-unstash.md) is a poor fit. It is often hundreds of MB and thousands of files, every byte goes through the controller, and packages with native parts may not match across Linux and macOS. A second `npm ci` with a [dependency cache](../library/dependency-cache.md) is faster and safer.

The Android agent needs the Android SDK (with `ANDROID_HOME` set) and the JDK version your React Native release expects, which is JDK 17 for current versions. Pin Node to the same version on every agent, for example with the NodeJS plugin.

The macOS agent needs Xcode, a Ruby for Bundler, and Node. Install Xcode side by side under versioned names (`Xcode_26.app`) so upgrading the agent doesn't change what a build uses; `DEVELOPER_DIR` then picks one per stage. Prefixing commands with `xcrun` works too, and also honours `DEVELOPER_DIR`. App Store Connect only accepts iOS builds made with a recent SDK, currently Xcode 26 or later, so check Apple's [upcoming requirements](https://developer.apple.com/news/upcoming-requirements/) when choosing the pin.

## Android signing

Release builds need a keystore. Store it as a Secret file credential and pass the keystore and key passwords to Gradle through environment variables in a single-quoted `sh`, so they never pass through Groovy. The full setup is in [Android](android.md).

## iOS signing

`xcodebuild archive` needs a distribution certificate with its private key in a keychain it can read without a prompt, and a provisioning profile for the app. On a shared macOS agent, neither should be left behind after the build.

[fastlane `match`](https://docs.fastlane.tools/actions/match/) is the most common CI approach and the one to prefer. It keeps the certificates and profiles encrypted in a private git repo, S3 bucket or Google Cloud bucket, and installs them at build time. Add `fastlane` to the Gemfile so its version is pinned with CocoaPods, and give it a lane:

```ruby
lane :beta do
  # creates a temporary keychain when running on ci
  setup_ci
  match(
    type: "appstore",
    readonly: true
  )
  app_store_connect_api_key(
    key_id: ENV["ASC_KEY_ID"],
    issuer_id: ENV["ASC_ISSUER_ID"],
    key_filepath: ENV["ASC_KEY_PATH"]
  )
  build_app(
    workspace: "ios/App.xcworkspace",
    scheme: "App"
  )
  upload_to_testflight(skip_waiting_for_build_processing: true)
end
```

In the iOS stage, the lane replaces the two `xcodebuild` calls:

```groovy
withCredentials([
    string(credentialsId: 'match-password', variable: 'MATCH_PASSWORD'),
    string(credentialsId: 'match-git-auth', variable: 'MATCH_GIT_BASIC_AUTHORIZATION'),
    file(credentialsId: 'asc-api-key-p8', variable: 'ASC_KEY_PATH')
]) {
    // match and the api key action read these from the environment
    sh 'bundle exec fastlane beta'
}
```

`MATCH_PASSWORD` decrypts the match repo and `MATCH_GIT_BASIC_AUTHORIZATION` is a base64 `user:token` for cloning it, both Secret text. The App Store Connect API key (`.p8`) is a Secret file. `ASC_KEY_ID` and `ASC_ISSUER_ID` aren't secret and can sit in the stage's `environment`. `withCredentials` comes from the Credentials Binding plugin.

Without fastlane, create a keychain for the build, import the `.p12` from a Secret file credential, and delete it in `post { cleanup }`. The keychain password is random and only lives for the build.

```groovy
stage('iOS') {
    agent {
        label 'macos'
    }
    environment {
        DEVELOPER_DIR = '/Applications/Xcode_26.app/Contents/Developer'
        KEYCHAIN = "${WORKSPACE_TMP}/signing.keychain-db"
        PROFILE_DIR = "${HOME}/Library/Developer/Xcode/UserData/Provisioning Profiles"
    }
    steps {
        withCredentials([
            file(credentialsId: 'ios-dist-p12', variable: 'P12_FILE'),
            string(credentialsId: 'ios-dist-p12-password', variable: 'P12_PASSWORD'),
            file(credentialsId: 'ios-appstore-profile', variable: 'PROFILE_FILE')
        ]) {
            sh '''
                KEYCHAIN_PASSWORD="$(uuidgen)"

                security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
                # lock again after 6 hours rather than on sleep or a short timeout
                security set-keychain-settings -lut 21600 "$KEYCHAIN"
                security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

                security import "$P12_FILE" \
                  -k "$KEYCHAIN" \
                  -P "$P12_PASSWORD" \
                  -T /usr/bin/codesign \
                  -T /usr/bin/security

                # lets codesign use the key without a gui prompt
                security set-key-partition-list \
                  -S apple-tool:,apple:,codesign: \
                  -s \
                  -k "$KEYCHAIN_PASSWORD" \
                  "$KEYCHAIN"

                # -s replaces the search list, so keep the existing keychains in it
                security list-keychains \
                  -d user \
                  -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')

                mkdir -p "$PROFILE_DIR"
                cp "$PROFILE_FILE" "$PROFILE_DIR/$BUILD_TAG.mobileprovision"
            '''
        }
        // npm ci, pod install and the xcodebuild calls from the main pipeline
    }
    post {
        cleanup {
            // runs even if the stage failed before the keychain existed, so ignore a missing one
            sh '''
                security delete-keychain "$KEYCHAIN" || true
                rm -f "$PROFILE_DIR/$BUILD_TAG.mobileprovision"
            '''
        }
    }
}
```

- `security import -P` takes the password on the command line. It runs inside the shell with the secret from the environment, so Jenkins masks it in the log, but it is briefly visible in the agent's process list.
- `security delete-keychain` also removes the keychain from the search list.
- Xcode 16 and later read provisioning profiles from `~/Library/Developer/Xcode/UserData/Provisioning Profiles`. Xcode 15 and earlier used `~/Library/MobileDevice/Provisioning Profiles`.
- `ExportOptions.plist` sets the distribution method, team and profile. For App Store and TestFlight builds the method is `app-store-connect` in Xcode 15.3 and later (`app-store` before that).

> [!WARNING]
> Two iOS builds on the same agent at once share the user's keychain search list and profile folder. Give the macOS agent one executor, or use `match` with `setup_ci`, which handles this for you.

For uploading to TestFlight, fastlane's `upload_to_testflight` (also called `pilot`) with an App Store Connect API key is the simplest route from CI, and `deliver` does the same for App Store metadata and submission.

Apple still supports `xcrun altool` for uploading `.ipa` files, alongside Transporter and Xcode, so altool is not deprecated for uploads. What changed:

- altool no longer notarizes. `xcrun notarytool` replaced it, and notarization is for macOS apps distributed outside the App Store, so it plays no part in an iOS upload.
- Within altool, `--upload-app` is marked deprecated in favour of `--upload-package`, which takes the app's Apple ID, bundle ID and version numbers explicitly.
- With `--apiKey`, altool looks for the key as `AuthKey_<key id>.p8` in a `private_keys` folder or in `API_PRIVATE_KEYS_DIR`, so a Secret file credential has to be copied there under that name first.

## Expo / EAS

Expo projects can skip the native stages and run `npx eas-cli build --platform all --non-interactive` with an `EXPO_TOKEN` Secret text bound in the environment. The builds run in Expo's cloud, which removes the need for a macOS agent, at the cost of an EAS plan beyond the small free allowance. Pin `eas-cli` as a dev dependency so `npx` uses a fixed version.

## Notes

- Metro bundling and Hermes bytecode compilation happen inside the native builds: Gradle's release tasks and Xcode's "Bundle React Native code and images" build phase. There is no separate bundle stage.
- `--no-daemon` keeps Gradle from leaving a background process on the agent between builds. Add `--build-cache` with a remote cache if build times matter more.
- Archive the `.aab` for Play, the `.ipa` for TestFlight, and the dSYMs from the archive so crash reports can be symbolicated. Archived artifacts are kept with the build record; stashes are not.
- macOS agents are usually scarce. Gate the iOS stage on the branches that ship, and skip it before an agent is allocated:

```groovy
when {
    beforeAgent true
    anyOf {
        branch 'main'
        branch 'release/*'
    }
}
```

See [`when` conditions](../fundamentals/when-conditions.md) for the other conditions. To treat platform as an axis instead of hand-written `parallel` branches, see [matrix builds](../fundamentals/matrix-builds.md), though the two platforms here differ enough that `parallel` is usually clearer.

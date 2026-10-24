# Ship a Mobile Build

Get a signed Android build onto a Google Play internal testing track and a signed iOS build onto TestFlight from Jenkins. This guide is a checklist; the pipeline code is in [Android](../builds/android.md) and [React Native](../builds/react-native.md).

## Before you start

- The app builds and tests green in Jenkins without signing. If not, start with the [Android](../builds/android.md) or [React Native](../builds/react-native.md) recipe.
- You know who your mobile release owner is: the person with admin access to the Play Console and App Store Connect accounts. Several items below need them.
- Your Jenkins administrator stores credentials and manages agents. You can't add either yourself; you ask for them by ID, then use those IDs in the `Jenkinsfile`. See [add a credential](add-a-credential.md).

## Checklist

| Step | Android | iOS | Who |
| --- | --- | --- | --- |
| 1 | upload keystore and passwords stored | distribution certificate and profile, or `match`, stored | mobile release owner, Jenkins administrator |
| 2 | Play service account JSON stored | App Store Connect API key stored | mobile release owner, Jenkins administrator |
| 3 | Linux agent with the Android SDK | macOS agent with a pinned Xcode | Jenkins administrator |
| 4 | version code from the build | build number from the build | you |
| 5 | first upload by hand in Play Console | app record exists in App Store Connect | mobile release owner |
| 6 | signing and upload only on release branches | signing and upload only on release branches | you |
| 7 | test from the internal track | test from TestFlight | you, testers |

## 1. Android: request the signing and Play credentials

The upload keystore signs the bundle you send to Play. With Play App Signing, Google re-signs it with the app signing key, so the upload key can be reset if it is lost. The mobile release owner holds the keystore and its passwords; the Jenkins administrator stores them.

The Play service account needs to be invited in Play Console (**Users and permissions**) with permission to release to testing tracks for this app. That is a Play Console admin task for the mobile release owner.

```text
Subject: Android release credentials for <app name>

Job: <link to the multibranch job or folder>
Please store these credentials, scoped to the job or folder above:

  android-upload-keystore     Secret file   the upload keystore (.jks or .keystore)
  android-keystore-password   Secret text   keystore password
  android-key-password        Secret text   key password for alias "<alias>"
  play-service-account        Secret file   Play Console service account JSON key

The mobile release owner (<role or contact>) will send the values through <agreed secure channel>.
These are only used by stages that run on main / release branches.
```

Credential IDs above match the [Android](../builds/android.md) recipe. If your administrator uses different IDs, use theirs in the `Jenkinsfile`.

## 2. iOS: request the agent, signing and API key

iOS builds need a macOS agent with Xcode. Ask for Xcode installed side by side under a versioned name so an upgrade doesn't change existing builds. App Store Connect only accepts builds made with a recent SDK, so check the version against Apple's current requirements.

Pick one signing approach with your mobile release owner:

- **fastlane `match`** (preferred): certificates and profiles live encrypted in a private repo or bucket. Jenkins needs the decryption password and read access to the repo.
- **`.p12` and profile**: the distribution certificate with its private key as a `.p12`, its password, and an App Store provisioning profile.

Both need an App Store Connect API key (`.p8`) to upload to TestFlight, created in App Store Connect by the mobile release owner with a role that can upload builds.

```text
Subject: iOS release agent and credentials for <app name>

Job: <link to the multibranch job or folder>

Agent:
  label: macos
  Xcode: <version, e.g. 26.x>, installed as /Applications/Xcode_<version>.app
  also needed: Ruby with Bundler, Node <version>, CocoaPods via the repo's Gemfile
  one executor per agent, so two builds don't share a keychain

Credentials, scoped to the job or folder above:
  with match:
    match-password          Secret text   match encryption password
    match-git-auth          Secret text   base64 "user:token" with read access to <match repo URL>
  or with a .p12:
    ios-dist-p12            Secret file   distribution certificate and key (.p12)
    ios-dist-p12-password   Secret text   .p12 password
    ios-appstore-profile    Secret file   App Store provisioning profile (.mobileprovision)
  always:
    asc-api-key-p8          Secret file   App Store Connect API key (.p8)
    (key ID and issuer ID are not secret; we'll put them in the Jenkinsfile)

The mobile release owner (<role or contact>) will send the values through <agreed secure channel>.
These are only used by stages that run on main / release branches.
```

The lane and the keychain steps that use these are in [React Native](../builds/react-native.md), under iOS signing.

## 3. Set version codes and build numbers

Both stores reject an upload whose build number isn't higher than the last one.

- **Android `versionCode`** is an integer that must increase with every upload to Play, across all tracks.
- **iOS `CFBundleVersion`** (the build number) must increase for each upload of the same version. `CFBundleShortVersionString` is the user-facing version, such as `1.4.0`.

The simplest source is Jenkins' `BUILD_NUMBER`, read from the environment:

```kotlin
// app/build.gradle.kts
android {
    defaultConfig {
        // ci passes the jenkins build number; local builds fall back to 1
        versionCode = providers.environmentVariable("BUILD_NUMBER")
            .map { it.toInt() + 1000 }
            .getOrElse(1)
    }
}
```

```ruby
# fastlane lane, before build_app
increment_build_number(
  build_number: ENV["BUILD_NUMBER"],
  xcodeproj: "ios/App.xcodeproj"
)
```

> [!WARNING]
> `BUILD_NUMBER` counts per job. In a multibranch job each branch has its own count, and it restarts at 1 if the branch job is deleted and recreated or the job is moved. Upload from one branch only, add an offset above any number already used (the `+ 1000` above), or use a counter that can only go up, such as the commit count on `main` (`git rev-list --count HEAD`, which needs a full clone).

## 4. Do the first Android upload by hand

The Play API can't create an app or make its first release. The mobile release owner creates the app in Play Console and uploads the first signed `.aab` to the internal testing track by hand. Download it from the archived artifacts of a Jenkins build so it carries the same signing and version code scheme.

For iOS, the app record must exist in App Store Connect with the same bundle ID before the first upload. The upload itself can come from Jenkins.

## 5. Keep signing out of pull request builds

Pull request builds run code that hasn't been reviewed yet. They should never see signing keys or upload credentials.

- Gate the signing and upload stages on release branches or tags, with `beforeAgent true` so pull requests don't even wait for the macOS agent:

  ```groovy
  stage('Publish') {
      when {
          beforeAgent true
          anyOf {
              branch 'main'
              branch 'release/*'
          }
      }
      steps {
          // signing and upload, as in builds/android.md and builds/react-native.md
          echo 'publishing'
      }
  }
  ```

- A `when` condition is in the `Jenkinsfile`, and a pull request can edit the `Jenkinsfile`. Ask your Jenkins administrator to scope the signing credentials so pull request builds can't read them, for example to a separate job that only builds `main` and tags.
- Keep secrets in single-quoted `sh` and in environment variables read by Gradle or fastlane, never on the command line through Groovy strings. See [secrets in CI](../concepts/secrets-in-ci.md).

## 6. Publish

- **Android:** the `Publish to Play` stage in [Android](../builds/android.md) uploads the `.aab` with fastlane `supply` to the `internal` track. Add an approval gate if releases need sign-off; see [parameters and approval gates](../fundamentals/parameters-and-approval-gates.md).
- **iOS:** the `beta` lane in [React Native](../builds/react-native.md) signs, builds and calls `upload_to_testflight`.

Archive the `.aab`, `mapping.txt`, `.ipa` and dSYMs with every release build so crashes can be symbolicated later.

## 7. Test the build

- **Play internal track:** testers on the internal testing list open the opt-in link from Play Console, then install from the Play Store. Internal test builds are usually available within minutes.
- **TestFlight:** after upload, App Store Connect processes the build, which can take a while. If it stays in **Missing Compliance**, answer the export compliance question, or set `ITSAppUsesNonExemptEncryption` in `Info.plist` so future builds skip it. Internal testers then get it in the TestFlight app.

Check the version and build number shown in the store match the Jenkins build you expect, then smoke test the app before promoting it to wider testing.

## Related

- [Android build and test](../builds/android.md)
- [React Native build and test](../builds/react-native.md)
- [Add a credential](add-a-credential.md)
- [Secrets in CI](../concepts/secrets-in-ci.md)
- [Multibranch and pull requests](../fundamentals/multibranch-and-pull-requests.md)
- [Branches and pull requests](../concepts/branches-and-pull-requests.md)
- [Roles and responsibilities](roles-and-responsibilities.md)

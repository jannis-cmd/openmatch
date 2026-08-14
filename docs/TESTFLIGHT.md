# Mobile builds, TestFlight, and Android testing

The native app is ready for owner testing. The current distributed-build API is
the HTTPS tailnet service documented in `docs/TAILNET_BETA.md`; it is private,
Mac-hosted, and not suitable for public testers. The repository intentionally
contains no endpoint. EAS injects the selected HTTPS origin at build time.

## Current release state

- Expo project: `@jannis-cmd/openmatch`
- Expo project ID: `a5c1bb2c-19ef-43bb-831e-a812f876ee87`
- iOS bundle identifier: `org.openmatch.app`
- Android package: `org.openmatch.app`
- EAS `preview` and `production` environments contain the tailnet API origin.
- Android signing uses the remote EAS keystore.
- Apple Developer Program membership is active for team `9TQ799RY97`.
- EAS holds an active Apple Distribution certificate and App Store
  provisioning profile for `org.openmatch.app`, both expiring 13 August 2027.
- A least-privilege `APP_MANAGER` App Store Connect API key is assigned to the
  project for EAS Submit. No signing private key or API key is committed here.
- App Store Connect app ID: `6801267398`. The initial record is named
  `OpenMatch (857aa4)` because the plain App Store Connect name was unavailable;
  this listing name can be revised independently of the installed app name.
- Full Xcode 26.6, its owner-accepted license and first-launch components,
  CocoaPods, and Fastlane are ready on the build Mac.
- Local EAS produced signed IPA build 8 from commit `99d587d` without consuming
  hosted build quota. EAS submission
  `c85855b2-aab6-475c-99de-f0d096790fde` completed; App Store Connect reports
  the build `VALID` and `IN_BETA_TESTING`.
- The internal TestFlight group is `Team (Expo)` and includes the owner account.
- The tailnet beta exposes a prototype privacy notice at
  `https://janniss-macbook-air.cheetah-vernier.ts.net:8443/privacy` and support
  information at `https://janniss-macbook-air.cheetah-vernier.ts.net:8443/support`.
  These are usable for owner/internal testing only. Store submission requires
  public HTTPS URLs plus an accountable operator and private contact channel.

Do not commit signing material, recovery credentials, Apple sessions, API
tokens, or a private service address to the repository.

## Local development on a phone

Run the API on the development computer's network interface:

```bash
HOST=0.0.0.0 pnpm --filter @openmatch/api dev
```

Then start Expo with that computer's current LAN or Tailnet address:

```bash
EXPO_PUBLIC_OPENMATCH_API_URL=http://YOUR_COMPUTER_IP:4000 \
  pnpm --filter @openmatch/mobile dev
```

Local development accepts HTTP deliberately. Do not reuse this configuration
for a distributed build.

## Configure an EAS environment

Every EAS build requires two plain HTTPS origins:

- `EXPO_PUBLIC_OPENMATCH_API_URL` for private application data and matching;
- `EXPO_PUBLIC_OPENMATCH_WEB_URL` for the public privacy and support pages.

Configure them separately for the `development`, `preview`, or `production`
EAS environment rather than committing either value to `eas.json`:

```bash
cd apps/mobile
eas env:create \
  --environment preview \
  --name EXPO_PUBLIC_OPENMATCH_API_URL \
  --value https://api.example.org \
  --visibility plaintext
eas env:create \
  --environment preview \
  --name EXPO_PUBLIC_OPENMATCH_WEB_URL \
  --value https://openmatch.example.org \
  --visibility plaintext
eas env:list --environment preview
```

The value is public app configuration, not a secret. Never place API keys or
credentials in an `EXPO_PUBLIC_*` variable.

The build hook stops an EAS build if either URL is absent, uses HTTP, or contains
credentials, a path, query, or fragment. The app also validates both values at
runtime. Service misconfiguration fails closed; public-link misconfiguration is
shown in the Method tab instead of opening an invented destination.

EAS also supplies `EAS_BUILD_GIT_COMMIT_HASH`. Dynamic app configuration embeds
that public full revision in the native manifest, and the build hook rejects a
missing or malformed value. The Method tab links the exact native source commit
separately from the API's deployed commit, so a tester can detect an older app
talking to a newer service.

## Preview build

After the HTTPS service has authentication, abuse controls, monitoring, and a
tested data-deletion path:

```bash
cd apps/mobile
eas build --profile preview --platform ios
```

Use this internal build for a small, consented pilot before App Store review.

For an installable Android APK:

```bash
cd apps/mobile
eas build --profile preview --platform android
```

Open the resulting EAS install URL on an Android device in the same tailnet.
Android may require explicit permission to install an app from the browser.

The `preview` profile explicitly produces an APK; it does not rely on an
implicit default. The `production` profile explicitly produces an Android App
Bundle. EAS CLI also requires a clean Git commit before either release build so
the embedded source revision can identify all application source.

For a Play Store Android App Bundle:

```bash
cd apps/mobile
eas build --profile production --platform android
```

An AAB cannot be installed directly. Upload it to a Play Console internal test
track after the store listing, tester access, app-content declarations, data
safety form, and privacy-policy URL have been reviewed against the deployed
service.

## Quota-free local Android build

Expo supports the same local EAS path for Android, but the current Mac has no
Java runtime or Android SDK. The account owner must first review and accept
Google's Android SDK license while installing Android Studio or the official
command-line SDK tools; automation must not accept that agreement on their
behalf. Install the SDK packages requested by Expo/Gradle and a compatible JDK,
then verify them without exposing credentials:

```bash
java -version
sdkmanager --version
adb version
```

After loading the public HTTPS origins, source revision, and `ANDROID_HOME` (or
`ANDROID_SDK_ROOT`) into the current shell, run:

```bash
pnpm release:preflight:android
```

The preflight checks both configuration and tool availability without invoking
Gradle, downloading credentials, accepting licenses, or consuming build quota.

With the production HTTPS environment available locally, build an installable
owner-test APK without consuming hosted quota:

```bash
cd apps/mobile
npx eas-cli@latest env:pull --environment preview --path .env.preview.local
export EAS_BUILD_GIT_COMMIT_HASH="$(git rev-parse HEAD)"
npx eas-cli@latest build --local --profile preview --platform android \
  --output ./openmatch-preview.apk
rm .env.preview.local
```

For a Play Console artifact, replace `preview` with `production` and output an
`.aab`. Local EAS still authenticates with Expo and may download the existing
managed Android keystore, but compilation happens on this Mac. Inspect the
resolved manifest, verify the embedded revision and HTTPS origins, test the APK
on a real Android device, and record its digest before treating it as a current
artifact.

## TestFlight production build

Configure and verify the production EAS environment, then build and submit.
The production submit profile already pins App Store Connect app ID
`6801267398`:

```bash
cd apps/mobile
eas env:list --environment production
eas build --profile production --platform ios --auto-submit
```

The current bundle identifier is `org.openmatch.app`. If it is unavailable for
the selected Apple Developer team, replace it in `app.json` with a unique
reverse-domain identifier. App Store privacy disclosures must reflect the
deployed service, not only this prototype repository.

## Quota-free local iOS build

Local EAS builds use the same managed Expo project and signing configuration but
compile on this Mac rather than consuming hosted build capacity. On a new build
Mac, the account owner must first review and accept the Xcode license in
Terminal:

```bash
sudo xcodebuild -license
```

Then verify the license and Xcode selection without changing either:

```bash
xcode-select -p
xcodebuild -license check
xcodebuild -checkFirstLaunchStatus
xcodebuild -version
```

If the first-launch check fails, complete Xcode's privileged component setup:

```bash
sudo xcodebuild -runFirstLaunch
```

After loading the two public HTTPS origins and source revision into the current
shell, run the repository preflight. It reports all missing local prerequisites
in one pass and never prints command output that could contain machine details:

```bash
pnpm release:preflight:ios
```

From a clean, pushed source revision, fetch the public production environment,
set the immutable source revision explicitly, and build locally:

```bash
cd apps/mobile
npx eas-cli@latest env:pull --environment production --path .env.production.local
export EAS_BUILD_GIT_COMMIT_HASH="$(git rev-parse HEAD)"
npx eas-cli@latest build --local --profile production --platform ios \
  --output ./openmatch-production.ipa
rm .env.production.local
```

The local environment file is ignored by Git, but it should still be removed
after use. Before submission, inspect the IPA, confirm that the embedded source
revision and HTTPS origins are correct, record its SHA-256 digest in the release
inventory, and verify account deletion on the installed build. Do not submit an
uninspected local artifact. If the local builder reports a missing CocoaPods or
Ruby toolchain, install that prerequisite before retrying; do not bypass native
dependency installation or code signing.

Once the archive is verified, submission does not require another build:

```bash
cd apps/mobile
npx eas-cli@latest submit --platform ios --path ./openmatch-production.ipa
```

## Resume iOS when build capacity is available

1. Confirm current agreements remain accepted in Apple Developer and App Store
   Connect.
2. From `apps/mobile`, run `eas credentials --platform ios` and verify the
   existing certificate, provisioning profile, and submission key remain
   valid; do not create replacements unnecessarily.
3. Run `eas build --profile production --platform ios` when EAS capacity is
   available.
4. Inspect the completed archive, then run
   `eas submit --platform ios --latest` only after the App Store Connect record
   and disclosures are complete.
5. Start with internal TestFlight testers. External testers add Beta App Review
   and require accurate beta test information.

## Unsigned iOS Simulator build

The `ios-simulator` profile compiles the native iOS application without an
Apple distribution certificate:

```bash
cd apps/mobile
eas build --profile ios-simulator --platform ios
```

This artifact can be installed only into an iOS Simulator. It proves native
compilation and supports simulator testing, but it cannot run on an iPhone and
does not replace TestFlight signing. The current build Mac is fully prepared;
these instructions remain for reproducibility on another machine.

## Store information still requiring an owner decision

Before submission, record and review:

- public support and privacy-policy URLs;
- an authorized public feedback/support email address;
- app subtitle, category, screenshots, and age-rating answers;
- TestFlight beta description and the exact features testers should exercise;
- App Review contact details and, if needed, a working review account;
- Apple privacy nutrition labels and Google Play data-safety answers based on
  the running service, including account, profile, approximate location,
  decisions, connections, messages, reports, and deletion behavior;
- content-moderation, blocking, reporting, and safety-response readiness;
- export-compliance answers. The app configuration currently declares that it
  does not use non-exempt encryption, but the final binary and service design
  must still be reviewed before answering.

Suggested internal beta focus: account creation and restoration, transparent
setup, finite introductions, score explanations, reciprocal connection,
text-only messaging, unmatch/block/report, data export, and account deletion.
Do not claim that compatibility is scientifically proven or that security email
delivery works while SMTP remains unconfigured.

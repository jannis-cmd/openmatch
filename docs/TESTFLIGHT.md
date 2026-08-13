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
- iOS signing is waiting for active Apple Developer Program membership. A free
  Apple account cannot distribute through TestFlight.
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

For a Play Store Android App Bundle:

```bash
cd apps/mobile
eas build --profile production --platform android
```

An AAB cannot be installed directly. Upload it to a Play Console internal test
track after the store listing, tester access, app-content declarations, data
safety form, and privacy-policy URL have been reviewed against the deployed
service.

## TestFlight production build

Configure and verify the production EAS environment, then build and submit:

```bash
cd apps/mobile
eas env:list --environment production
eas build --profile production --platform ios --auto-submit
```

The current bundle identifier is `org.openmatch.app`. If it is unavailable for
the selected Apple Developer team, replace it in `app.json` with a unique
reverse-domain identifier. App Store privacy disclosures must reflect the
deployed service, not only this prototype repository.

## Resume iOS when enrollment becomes active

1. Sign in at the Apple Developer site and accept any current membership or
   program agreements as the Account Holder.
2. Confirm that the membership page shows an active Apple Developer Program
   team, not only the free developer account.
3. From `apps/mobile`, run `eas credentials --platform ios` and allow EAS to
   create or select the distribution certificate and provisioning profile.
4. Run `eas build --profile production --platform ios`.
5. Inspect the completed archive, then run
   `eas submit --platform ios --latest` only after the App Store Connect record
   and disclosures are complete.
6. Start with internal TestFlight testers. External testers add Beta App Review
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
does not replace TestFlight signing. The current Mac has Apple Command Line
Tools but not full Xcode or Simulator, so local installation remains unavailable
until Xcode is installed.

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

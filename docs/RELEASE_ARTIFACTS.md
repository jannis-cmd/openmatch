# Verified mobile artifacts

This file records reproducible provenance for archived owner-testing artifacts.
Every listed binary is an immutable source snapshot. The newest Simulator
archive is built from the repository revision named below; older Android and
iOS artifacts remain explicitly archived. None is an app-store approval or a
claim of production readiness. The same facts are published in
[`RELEASE_ARTIFACTS.json`](./RELEASE_ARTIFACTS.json) for machine verification.

## OpenMatch 0.1.0

### Signed iOS IPA — build 8

- Purpose: internal TestFlight owner testing
- Source commit: `99d587d80ef4ad9d9da6b3890d3c994ab59d5e83`
- Bundle identifier: `org.openmatch.app`
- Version: `0.1.0` (`CFBundleVersion` 8)
- App Store Connect app ID: `6801267398`
- EAS submission: `c85855b2-aab6-475c-99de-f0d096790fde`
- Size: 16,954,673 bytes
- SHA-256: `ea281e4244a7035527409e529c2e4a043c39f8d6f0fa0882258b61488dd759fb`
- Availability: retained on the owner build Mac and available to the internal
  TestFlight group (`VALID`, `IN_BETA_TESTING`); it is not a public direct
  download
- Verification: the archive exported successfully with active App Store
  distribution signing and provisioning; deep strict code-signature checks
  passed; the application is an `arm64` device binary; the embedded Expo
  configuration contains the exact source revision and both intended HTTPS
  origins; App Transport Security has no arbitrary-load or local-network
  exception; `ITSAppUsesNonExemptEncryption=false`; and privacy manifests are
  present in the app and relevant dependencies.

Apple still controls TestFlight and App Store availability. This record proves
what was built, uploaded, processed, and made available internally; it does not
claim App Store review, public release, production-service readiness, or
scientific effectiveness.

### Current iOS Simulator archive — build ff567a6f

- Purpose: unsigned native compilation and Simulator testing while a signed
  archive waits for available build capacity
- EAS build: `ff567a6f-23eb-4eae-b058-d62842d1cb1e`
- Source commit: `e1c495ec9b216fefe796d0359432ae4ce40f97ab`
- Bundle identifier: `org.openmatch.app`
- Version: `0.1.0` (`CFBundleVersion` 1)
- Artifact: <https://expo.dev/artifacts/eas/5pf4cynFmwyee-zFtDmMeZSQFZlqwnA6wC_O82bt-40.tar.gz>
- Size: 22,493,645 bytes
- SHA-256: `72320e5666f0f5c96cbeef7f3f903a8cc90f14c86514750d0132372b83e4ff51`
- Verification: EAS finished successfully; gzip integrity passed; the archive
  contains `OpenMatch.app`; `Info.plist` contains the expected identifier,
  version, strict transport policy, and `ITSAppUsesNonExemptEncryption=false`;
  the executable is a universal Simulator Mach-O for `arm64` and `x86_64`;
  Expo's embedded app configuration contains the complete source revision; and
  the bundle contains the Tailnet API and web origins plus the verified primary
  email-change and cancellation paths.

This archive cannot run on an iPhone and is not TestFlight-signed. It requires
Xcode's iOS Simulator on a Mac. It is retained as an older independently
inspectable compilation artifact; signed device build 8 now supersedes it for
TestFlight owner testing.

### Android direct-install APK — build 10

- Purpose: installation on an Android device for private tailnet testing
- EAS build: `70822308-3d87-4088-9127-7c944e3f0f77`
- Source commit: `b9c4039ee5a08560f151775c962ed4d56b388ab2`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 10)
- Artifact: <https://expo.dev/artifacts/eas/QgNIPOR4gCsrI0iGhB8Y3wMNZeAWC5hjzdqQyXstxto.apk>
- Size: 96,735,198 bytes
- SHA-256: `78f00010859d5349b4d9e454b8d1e9d3c1164ef4a1611c8e9c1dfbf42d392fe5`
- Verification: EAS finished successfully; downloaded file is a ZIP/APK and
  every archive entry passed `unzip -t`; its application bundle contains the
  configured tailnet API and privacy/support web origins, the message request
  identifier path, append-only safety-report update flow, and reciprocal
  gender-discovery configuration, and the separate learning-example deletion
  control, and an explicit pending cross-account delivery warning

Android may require permission to install an app delivered by the browser. The
device must be a member of the `cheetah-vernier` tailnet. This Mac has no
Android SDK, emulator, or connected Android device, so on-device installation
and APK signature inspection remain separate validation steps.

Build 10 shows durable pending-delivery state on load, manual refresh, and
foreground return. It does not include later source work such as immediate
queued-delivery feedback, account security refinements, expiring explicit
availability, file-based data export, current accessibility changes, or native
source-revision disclosure. Expo rejected Android build 11 before compilation
because the account's included Android build quota is exhausted until September
1, 2026.
The repository now explicitly pins preview builds to APK and production builds
to AAB and requires a clean Git commit. A quota-free local EAS build is ready at
the project level but still needs a compatible JDK and owner-licensed Android
SDK on this Mac.

### Android Play App Bundle — build 10

- Purpose: Google Play internal testing or later store submission
- EAS build: `b93a03b6-7ccf-4a97-a24f-4d8c06e4469a`
- Source commit: `b9c4039ee5a08560f151775c962ed4d56b388ab2`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 10)
- Artifact: <https://expo.dev/artifacts/eas/jbW0V8ehJlgZff2v61OjOkW19-Z7yVvXWl1aLK5aQFY.aab>
- Size: 68,103,161 bytes
- SHA-256: `0cd9d786195666fdc90b6304f11f05e54a379a86425f979b26535b6e59c95958`
- Verification: EAS finished successfully; downloaded file is a ZIP/AAB,
  every archive entry passed `unzip -t`; JAR signature metadata is present;
  and its bundle contains the expected package identifier, tailnet API and
  privacy/support web origins, message request identifier path, append-only
  safety-report update flow, reciprocal gender-discovery configuration, and
  the separate learning-example deletion control, and an explicit pending
  cross-account delivery warning

An AAB is not directly installable. Google Play Console enrollment, listing,
data-safety declarations, tester setup, and submission have not been performed.

### Archived iOS Simulator archive — build 1

- Purpose: unsigned native compilation and testing in iOS Simulator
- EAS build: `f10dbdcd-6d41-4338-9a8a-0b175ade0994`
- Source commit: `a48575199f1dfa0e21301c013122d57dd1964845`
- Bundle identifier: `org.openmatch.app`
- Version: `0.1.0` (`CFBundleVersion` 1)
- Artifact: <https://expo.dev/artifacts/eas/9L0V8WoFPy2D3kbEZGrs6O5hYIKi6tLWBRivGL9FEpU.tar.gz>
- Size: 22,365,824 bytes
- SHA-256: `43294085031b745b618a1ee841b99fbbf694392eefdbb6d122a72e6d9f92c542`
- Verification: EAS finished successfully; gzip integrity passed; archive
  contains `OpenMatch.app`; `Info.plist` contains the expected identifier and
  version; the executable is a universal Simulator Mach-O for `arm64` and
  `x86_64`; the configured tailnet API and privacy/support web origins are
  present; the message request identifier and append-only safety-report update
  paths, reciprocal gender-discovery configuration, and the separate
  learning-example deletion control, explicit pending cross-account delivery
  warning, and immediate safely-queued mutation response are embedded; and
  `ITSAppUsesNonExemptEncryption` is false

This archive cannot run on an iPhone and is not TestFlight-signed. It is an
older source snapshot retained for provenance; current signed device build 8
is available to the internal TestFlight group.

## Common limits

All artifacts connect to the private Mac-hosted tailnet API. They are not
public production releases. EAS builds resolve the
official `EAS_BUILD_GIT_COMMIT_HASH` into the app manifest and expose that full
revision from the in-app Method screen; the pre-install verifier rejects a
missing or malformed revision. SMTP, production monitoring, redundant hosting,
staffed moderation/support, public legal/operator information, independent
security assessment, and store disclosure review remain incomplete. See
`docs/TAILNET_BETA.md` and `docs/IMPLEMENTATION_STATUS.md` before inviting any
tester.

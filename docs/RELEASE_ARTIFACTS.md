# Verified mobile artifacts

This file records reproducible provenance for archived owner-testing artifacts.
Every listed binary is an immutable source snapshot. The newest Simulator
archive is built from the repository revision named below; older Android and
iOS artifacts remain explicitly archived. None is an app-store approval or a
claim of production readiness. The same facts are published in
[`RELEASE_ARTIFACTS.json`](./RELEASE_ARTIFACTS.json) for machine verification.

## OpenMatch 0.1.0

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
Xcode's iOS Simulator on a Mac. Apple membership, the distribution certificate,
provisioning profile, and least-privilege App Store Connect submission key are
now configured. Full Xcode 26.6 is installed, so a physical-device/TestFlight
archive can be compiled with local EAS without consuming hosted build quota
after the account owner reviews and accepts Apple's Xcode license.

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

This archive cannot run on an iPhone and is not TestFlight-signed. Full Xcode is
now installed on the Mac, and Apple Developer membership plus App Store Connect
signing are active. The account owner's acceptance of Apple's Xcode license is
the remaining prerequisite before local native compilation can begin.

## Common limits

All three artifacts connect to the private Mac-hosted tailnet API. They are not
current binaries or public production releases. Future EAS builds resolve the
official `EAS_BUILD_GIT_COMMIT_HASH` into the app manifest and expose that full
revision from the in-app Method screen; the pre-install verifier rejects a
missing or malformed revision. SMTP, production monitoring, redundant hosting,
staffed moderation/support, public legal/operator information, independent
security assessment, and store disclosure review remain incomplete. See
`docs/TAILNET_BETA.md` and `docs/IMPLEMENTATION_STATUS.md` before inviting any
tester.

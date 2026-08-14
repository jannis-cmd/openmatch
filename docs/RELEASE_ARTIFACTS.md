# Verified mobile artifacts

This file records reproducible provenance for archived owner-testing artifacts.
Every listed binary is an immutable source snapshot. Android build 12 and iOS
build 10 are the current owner-testing baselines; older Android and iOS
artifacts remain explicitly archived. Neither current build is an app-store
approval or a claim of production readiness. The same facts are published in
[`RELEASE_ARTIFACTS.json`](./RELEASE_ARTIFACTS.json) for machine verification.

## OpenMatch 0.1.0

### Signed Android APK — build 12

- Purpose: direct installation for private owner testing
- Source commit: `260210398014484a4ca69474b5bc81fa9148720f`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 12)
- Runtime: Expo SDK 57 / React Native 0.86.2 / corrected Hermes `250829098.0.16`
- Release: <https://github.com/jannis-cmd/openmatch/releases/tag/android-baseline-build-12>
- APK: <https://github.com/jannis-cmd/openmatch/releases/download/android-baseline-build-12/openmatch-android-0.1.0-build-12.apk>
- Build workflow: <https://github.com/jannis-cmd/openmatch/actions/runs/31817416931>
- Signing/release workflow: <https://github.com/jannis-cmd/openmatch/actions/runs/31819280112>
- Size: 98,013,247 bytes
- SHA-256: `dbfe31e424698ab69169761bb815c4a9460ee742323b9dc69d3ffa562b4aa167`
- Signing certificate SHA-256: `C4:73:46:D5:C2:B9:75:88:8C:66:A3:5F:62:04:F9:18:D9:1B:B8:C7:72:9F:B5:9F:6C:A6:84:8D:1A:63:F2:9D`
- Availability: public direct download for owner testing; not Google Play

GitHub's licensed Android toolchain built the standalone release APK from the
exact named commit after the hosted EAS free-plan quota was exhausted. A
separate least-privilege workflow restored the existing EAS Android signing
identity from encrypted repository secrets, aligned and signed the APK,
verified one signer with APK signature schemes v2 and v3, checked the complete
ZIP archive and embedded JavaScript bundle, and published the APK, checksum,
and signing report as one immutable release. Re-downloading the public asset
produced the exact recorded size and checksum; `assets/app.config` records
versionCode 12, Expo SDK 57, and the complete source revision.

The build includes the current structured profile and photo flow. It connects
only to the documented private tailnet service, so the Android device must be a
member of `cheetah-vernier`. Android may require explicit browser permission to
install an APK. This is not a Google Play release: no production AAB from this
revision, Play Console enrollment, data-safety declaration, tester track, or
store review is claimed.

### Signed iOS IPA — build 10

- Purpose: internal TestFlight owner testing
- Source commit: `260210398014484a4ca69474b5bc81fa9148720f`
- Bundle identifier: `org.openmatch.app`
- Version: `0.1.0` (`CFBundleVersion` 10)
- Runtime: Expo SDK 57 / React Native 0.86.2 / corrected Hermes `250829098.0.16`
- App Store Connect app ID: `6801267398`
- EAS submission: `631d324d-de3f-473c-9bc3-4a3aaaea956e`
- Size: 17,215,629 bytes
- SHA-256: `4a9654720b4035e6b234053714aaa00077421295ab669884747352c47c1dec8f`
- Availability: retained on the owner build Mac and available to the internal
  TestFlight group (`VALID`, `IN_BETA_TESTING`); it is not a public direct
  download
- Verification: the archive exported successfully with active App Store
  distribution signing and provisioning; deep strict code-signature checks
  passed; the application is an `arm64` device binary; the embedded Expo
  configuration contains the exact source revision and both intended HTTPS
  origins; App Transport Security has no arbitrary-load or local-network
  exception; `ITSAppUsesNonExemptEncryption=false`; and privacy manifests are
  present in the app and relevant dependencies. Expo Doctor passed all 21
  checks inside the isolated build environment.

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
inspectable compilation artifact; signed device build 10 now supersedes it for
TestFlight owner testing.

### Archived Android direct-install APK — build 10

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
device must be a member of the `cheetah-vernier` tailnet. There was no connected
Android device for an installation test. This artifact is superseded by
stable-signed build 12 above.

Build 10 shows durable pending-delivery state on load, manual refresh, and
foreground return. It does not include later source work such as immediate
queued-delivery feedback, account security refinements, expiring explicit
availability, file-based data export, current accessibility changes, or native
source-revision disclosure. Expo rejected an earlier hosted build-11 attempt
before compilation because the account's included Android quota was exhausted
until September 1, 2026. The verified GitHub build and signing path first
completed build 11 without using that hosted quota; SDK 57 build 12 now
supersedes it.

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
older source snapshot retained for provenance; current signed device build 10
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

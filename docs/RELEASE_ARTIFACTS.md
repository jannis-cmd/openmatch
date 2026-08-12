# Verified mobile artifacts

This file records reproducible provenance for the current owner-testing
artifacts. It is not an app-store approval or a claim of production readiness.

## OpenMatch 0.1.0

### Android direct-install APK — build 8

- Purpose: installation on an Android device for private tailnet testing
- EAS build: `e46717f0-ec4b-434e-b2b2-6de5aa068c3f`
- Source commit: `de13e2e06fca8c8b5eff9ed3db70f228e372c186`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 8)
- Artifact: <https://expo.dev/artifacts/eas/Qjrq_A_Zh2WRqnLOU0ElRfR1He9x95E8XloxV9lxZ6U.apk>
- Size: 96,732,974 bytes
- SHA-256: `bef5b9014c9c9ff787ba7e8229d670f88f07810e60e2f2791f95b0f78a65d287`
- Verification: EAS finished successfully; downloaded file is a ZIP/APK and
  every archive entry passed `unzip -t`; its application bundle contains the
  configured tailnet API and privacy/support web origins, the message request
  identifier path, append-only safety-report update flow, and reciprocal
  gender-discovery configuration

Android may require permission to install an app delivered by the browser. The
device must be a member of the `cheetah-vernier` tailnet. This Mac has no
Android SDK, emulator, or connected Android device, so on-device installation
and APK signature inspection remain separate validation steps.

### Android Play App Bundle — build 8

- Purpose: Google Play internal testing or later store submission
- EAS build: `14730f2a-bc2d-40bd-a381-3fe3e1d63182`
- Source commit: `de13e2e06fca8c8b5eff9ed3db70f228e372c186`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 8)
- Artifact: <https://expo.dev/artifacts/eas/teUXhXHFhoVUftYqdqevOpS7THIFDkt4klYm-oaT1V4.aab>
- Size: 68,101,719 bytes
- SHA-256: `5fb5f06793f1343cf3529a4c415764287c0fb5cd900b5562736722cc63b7a602`
- Verification: EAS finished successfully; downloaded file is a ZIP/AAB,
  every archive entry passed `unzip -t`; JAR signature metadata is present;
  and its bundle contains the expected package identifier, tailnet API and
  privacy/support web origins, message request identifier path, append-only
  safety-report update flow, and reciprocal gender-discovery configuration

An AAB is not directly installable. Google Play Console enrollment, listing,
data-safety declarations, tester setup, and submission have not been performed.

### iOS Simulator archive — build 1

- Purpose: unsigned native compilation and testing in iOS Simulator
- EAS build: `025f2947-2eb9-4da5-8cf9-ef1b5fb43b30`
- Source commit: `de13e2e06fca8c8b5eff9ed3db70f228e372c186`
- Bundle identifier: `org.openmatch.app`
- Version: `0.1.0` (`CFBundleVersion` 1)
- Artifact: <https://expo.dev/artifacts/eas/uqnAcVIh2iYvLmbAZoSE_5Sc6ZG_bMKS7yB8E5k4dKk.tar.gz>
- Size: 22,362,228 bytes
- SHA-256: `996879a1b2d591f83ab0be84cf646762878070ee6f603e9d8ea53733f60199f6`
- Verification: EAS finished successfully; gzip integrity passed; archive
  contains `OpenMatch.app`; `Info.plist` contains the expected identifier and
  version; the executable is a universal Simulator Mach-O for `arm64` and
  `x86_64`; the configured tailnet API and privacy/support web origins are
  present; the message request identifier and append-only safety-report update
  paths and reciprocal gender-discovery configuration are embedded; and
  `ITSAppUsesNonExemptEncryption` is false

This archive cannot run on an iPhone and is not TestFlight-signed. The Mac does
not currently have full Xcode or Simulator installed. A physical-device build
and TestFlight submission remain gated by active Apple Developer Program
membership and App Store Connect setup.

## Common limits

All three artifacts connect to the private Mac-hosted tailnet API. They are not
public production releases. SMTP, production monitoring, redundant hosting,
staffed moderation/support, public legal/operator information, independent
security assessment, and store disclosure review remain incomplete. See
`docs/TAILNET_BETA.md` and `docs/IMPLEMENTATION_STATUS.md` before inviting any
tester.

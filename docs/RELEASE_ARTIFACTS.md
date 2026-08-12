# Verified mobile artifacts

This file records reproducible provenance for the current owner-testing
artifacts. It is not an app-store approval or a claim of production readiness.

## OpenMatch 0.1.0

### Android direct-install APK — build 5

- Purpose: installation on an Android device for private tailnet testing
- EAS build: `af701477-ff8b-42be-9d95-269b0f0647cc`
- Source commit: `ed26f248835f6703ffd0fc67054851148f0dd448`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 5)
- Artifact: <https://expo.dev/artifacts/eas/-b2IrqTEFDahSZ103ryP4Ff60orR5qThCi3zg0NIX4w.apk>
- Size: 96,699,170 bytes
- SHA-256: `2f6da8d83ef31443eac8df30dc65b77780b07a0d5700b874348b82ab185ca463`
- Verification: EAS finished successfully; downloaded file is a ZIP/APK and
  every archive entry passed `unzip -t`; its application bundle contains the
  configured tailnet API and privacy/support web origins

Android may require permission to install an app delivered by the browser. The
device must be a member of the `cheetah-vernier` tailnet. This Mac has no
Android SDK, emulator, or connected Android device, so on-device installation
and APK signature inspection remain separate validation steps.

### Android Play App Bundle — build 5

- Purpose: Google Play internal testing or later store submission
- EAS build: `ca7f7e21-0e0a-42f9-8fea-909ab7cfe03e`
- Source commit: `ed26f248835f6703ffd0fc67054851148f0dd448`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 5)
- Artifact: <https://expo.dev/artifacts/eas/g0cXQjJhbUDWwm8ji6cPhj0mZxQo_0l-vkvQeGWcZKg.aab>
- Size: 68,068,693 bytes
- SHA-256: `9c81c0d670e642be32fb7acccdc1b79279cb134e0a1f9bde68dbde825f957537`
- Verification: EAS finished successfully; downloaded file is a ZIP/AAB,
  every archive entry passed `unzip -t`, and its application bundle contains
  the configured tailnet API and privacy/support web origins

An AAB is not directly installable. Google Play Console enrollment, listing,
data-safety declarations, tester setup, and submission have not been performed.

### iOS Simulator archive — build 1

- Purpose: unsigned native compilation and testing in iOS Simulator
- EAS build: `d6b7d2eb-e48a-4de6-bd8a-7443639fd9a3`
- Source commit: `ed26f248835f6703ffd0fc67054851148f0dd448`
- Bundle identifier: `org.openmatch.app`
- Version: `0.1.0` (`CFBundleVersion` 1)
- Artifact: <https://expo.dev/artifacts/eas/S_qTRtmaRSp4rLaCBQ82WbmI5zcioo9hKkbBFJFBdNQ.tar.gz>
- Size: 22,246,746 bytes
- SHA-256: `99d6bfdf79f9755bac779e0e2f35aba1db93cbab4567c9c93d1db9370a374c81`
- Verification: EAS finished successfully; gzip integrity passed; archive
  contains `OpenMatch.app`; `Info.plist` contains the expected identifier and
  version; the executable is a universal Simulator Mach-O for `arm64` and
  `x86_64`; the configured tailnet API and privacy/support web origins are
  present; and `ITSAppUsesNonExemptEncryption` is false

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

# Verified mobile artifacts

This file records reproducible provenance for the current owner-testing
artifacts. It is not an app-store approval or a claim of production readiness.

## OpenMatch 0.1.0

### Android direct-install APK — build 9

- Purpose: installation on an Android device for private tailnet testing
- EAS build: `88471e80-2eea-4a40-b2a1-a7ce0fff2bc7`
- Source commit: `d44bcdb210473149401e4b4594d6ed699365386a`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 9)
- Artifact: <https://expo.dev/artifacts/eas/Ibt2xd84VIC9uyK9jxc2DD9ERNptQvUY8GTzSAkbjFU.apk>
- Size: 96,734,366 bytes
- SHA-256: `9f4c06548b100b34af1071709c2e64b67322609c911a8b58ca669de167af5884`
- Verification: EAS finished successfully; downloaded file is a ZIP/APK and
  every archive entry passed `unzip -t`; its application bundle contains the
  configured tailnet API and privacy/support web origins, the message request
  identifier path, append-only safety-report update flow, and reciprocal
  gender-discovery configuration, and the separate learning-example deletion
  control

Android may require permission to install an app delivered by the browser. The
device must be a member of the `cheetah-vernier` tailnet. This Mac has no
Android SDK, emulator, or connected Android device, so on-device installation
and APK signature inspection remain separate validation steps.

### Android Play App Bundle — build 9

- Purpose: Google Play internal testing or later store submission
- EAS build: `697d46ed-e75d-4e69-8bb9-3b276bae5306`
- Source commit: `d44bcdb210473149401e4b4594d6ed699365386a`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 9)
- Artifact: <https://expo.dev/artifacts/eas/VhuE70Pem8AqJaCOW62GGzNRTG-H3Nmftjheisf_MZQ.aab>
- Size: 68,102,281 bytes
- SHA-256: `5537df38ee43697e043e56c9e49548d33b3feab7fc50eee8a2c554825dc2383d`
- Verification: EAS finished successfully; downloaded file is a ZIP/AAB,
  every archive entry passed `unzip -t`; JAR signature metadata is present;
  and its bundle contains the expected package identifier, tailnet API and
  privacy/support web origins, message request identifier path, append-only
  safety-report update flow, reciprocal gender-discovery configuration, and
  the separate learning-example deletion control

An AAB is not directly installable. Google Play Console enrollment, listing,
data-safety declarations, tester setup, and submission have not been performed.

### iOS Simulator archive — build 1

- Purpose: unsigned native compilation and testing in iOS Simulator
- EAS build: `eb343358-d97e-4713-b76a-1a6d3bf6ea0d`
- Source commit: `d44bcdb210473149401e4b4594d6ed699365386a`
- Bundle identifier: `org.openmatch.app`
- Version: `0.1.0` (`CFBundleVersion` 1)
- Artifact: <https://expo.dev/artifacts/eas/gWWEhaAB1ThDA1p1prSTafb13yDpGGWV6ESd082Xwu8.tar.gz>
- Size: 22,364,769 bytes
- SHA-256: `0c37f3592a6f61c879106fc169bb0c20fb3b1e771320e9118d84eeea24f228aa`
- Verification: EAS finished successfully; gzip integrity passed; archive
  contains `OpenMatch.app`; `Info.plist` contains the expected identifier and
  version; the executable is a universal Simulator Mach-O for `arm64` and
  `x86_64`; the configured tailnet API and privacy/support web origins are
  present; the message request identifier and append-only safety-report update
  paths, reciprocal gender-discovery configuration, and the separate
  learning-example deletion control are embedded; and
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

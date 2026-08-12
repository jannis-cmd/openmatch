# Verified mobile artifacts

This file records reproducible provenance for the current owner-testing
artifacts. It is not an app-store approval or a claim of production readiness.

## OpenMatch 0.1.0

### Android direct-install APK — build 4

- Purpose: installation on an Android device for private tailnet testing
- EAS build: `19b58ff5-e836-45bb-b9f8-b05fa42f437b`
- Source commit: `81a2c5f916c02fe041f92803ea2dd24beaddb5e5`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 4)
- Artifact: <https://expo.dev/artifacts/eas/1pu0XlF73xLmkKCpcmlKMbbvsFgZaUzr9iYLBY813sU.apk>
- Size: 96,697,542 bytes
- SHA-256: `65b825d2b5c81cebae53a6f6ea45c14a581f6900a715920c4fb647f723a08197`
- Verification: EAS finished successfully; downloaded file is a ZIP/APK and
  every archive entry passed `unzip -t`

Android may require permission to install an app delivered by the browser. The
device must be a member of the `cheetah-vernier` tailnet. This Mac has no
Android SDK, emulator, or connected Android device, so on-device installation
and APK signature inspection remain separate validation steps.

### Android Play App Bundle — build 4

- Purpose: Google Play internal testing or later store submission
- EAS build: `10035aa1-c3c0-48d5-827c-b9dbfbbd4fa7`
- Source commit: `81a2c5f916c02fe041f92803ea2dd24beaddb5e5`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 4)
- Artifact: <https://expo.dev/artifacts/eas/zGn2snnIz5a2oFbtMcr4wFs51fUh0ktYAhoyUETFVBw.aab>
- Size: 68,068,203 bytes
- SHA-256: `f0dca0c20fb317325f963311a30b4f17291e26321e5e58c916aa5c497f3bf865`
- Verification: EAS finished successfully; downloaded file is a ZIP/AAB,
  every archive entry passed `unzip -t`, and JAR signature metadata is present

An AAB is not directly installable. Google Play Console enrollment, listing,
data-safety declarations, tester setup, and submission have not been performed.

### iOS Simulator archive — build 1

- Purpose: unsigned native compilation and testing in iOS Simulator
- EAS build: `1b3e4285-bcf3-4db7-aff3-b1fcb231318f`
- Source commit: `f98a125bad3b25238613ef86f1eb3fa911149ac0`
- Bundle identifier: `org.openmatch.app`
- Version: `0.1.0` (`CFBundleVersion` 1)
- Artifact: <https://expo.dev/artifacts/eas/6EbyZNOovVBlb2HHSzRWyDWnrJKqy1DC6mfnaJf52BE.tar.gz>
- Size: 22,245,917 bytes
- SHA-256: `bf8542c8a57390ab819d86607394cec94a6defc06202fc245564087846c674e0`
- Verification: EAS finished successfully; gzip integrity passed; archive
  contains `OpenMatch.app`; `Info.plist` contains the expected identifier and
  version; the executable is a universal Simulator Mach-O for `arm64` and
  `x86_64`; the configured tailnet HTTPS API origin is present; and
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

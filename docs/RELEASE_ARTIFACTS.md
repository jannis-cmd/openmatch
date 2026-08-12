# Verified mobile artifacts

This file records reproducible provenance for the current owner-testing
artifacts. It is not an app-store approval or a claim of production readiness.

## OpenMatch 0.1.0

### Android direct-install APK — build 6

- Purpose: installation on an Android device for private tailnet testing
- EAS build: `6ec16c71-6200-4e44-b383-8776188d90f8`
- Source commit: `59e35324823f4027ce66d329ff4447d406954568`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 6)
- Artifact: <https://expo.dev/artifacts/eas/labA_0e8QUJhJJBYO7I03TSd0wX4uyE2BcELOX-wI7o.apk>
- Size: 96,726,278 bytes
- SHA-256: `46f51f74b8e2000484f8254e83342f6087937e640a3474ec924dde0fdc5d565d`
- Verification: EAS finished successfully; downloaded file is a ZIP/APK and
  every archive entry passed `unzip -t`; its application bundle contains the
  configured tailnet API and privacy/support web origins, the message request
  identifier path, and the Expo Crypto implementation

Android may require permission to install an app delivered by the browser. The
device must be a member of the `cheetah-vernier` tailnet. This Mac has no
Android SDK, emulator, or connected Android device, so on-device installation
and APK signature inspection remain separate validation steps.

### Android Play App Bundle — build 6

- Purpose: Google Play internal testing or later store submission
- EAS build: `d2339ae4-2d0e-466c-9f91-efbab72ccf86`
- Source commit: `59e35324823f4027ce66d329ff4447d406954568`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 6)
- Artifact: <https://expo.dev/artifacts/eas/Cb1LK93W5OTbir1-SZd-w7UwOWGm4wL03Jq03RSF-as.aab>
- Size: 68,098,316 bytes
- SHA-256: `755f58468d9317a694801ff805f76d73b35c5ce6cfdef6eb7e9464dbc8ad2b7a`
- Verification: EAS finished successfully; downloaded file is a ZIP/AAB,
  every archive entry passed `unzip -t`, and its application bundle contains
  JAR signature metadata is present; and its bundle contains the expected
  package identifier, tailnet API and privacy/support web origins, message
  request identifier path, and Expo Crypto implementation

An AAB is not directly installable. Google Play Console enrollment, listing,
data-safety declarations, tester setup, and submission have not been performed.

### iOS Simulator archive — build 1

- Purpose: unsigned native compilation and testing in iOS Simulator
- EAS build: `53aa9b32-af87-44b7-86ae-c047ae45c4af`
- Source commit: `59e35324823f4027ce66d329ff4447d406954568`
- Bundle identifier: `org.openmatch.app`
- Version: `0.1.0` (`CFBundleVersion` 1)
- Artifact: <https://expo.dev/artifacts/eas/jUblWyriqdEpCCDbNWgUqM7fgQ3wTDF_lpbuwdOKCYc.tar.gz>
- Size: 22,357,552 bytes
- SHA-256: `a679188010105dac5ec2fc48c1a8983e725207183c7afdaed57943a2274defba`
- Verification: EAS finished successfully; gzip integrity passed; archive
  contains `OpenMatch.app`; `Info.plist` contains the expected identifier and
  version; the executable is a universal Simulator Mach-O for `arm64` and
  `x86_64`; the configured tailnet API and privacy/support web origins are
  present; the message request identifier path is embedded; and
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

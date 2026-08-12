# Verified mobile artifacts

This file records reproducible provenance for the current owner-testing
artifacts. It is not an app-store approval or a claim of production readiness.

## OpenMatch 0.1.0

### Android direct-install APK — build 7

- Purpose: installation on an Android device for private tailnet testing
- EAS build: `19b32ec1-68b6-40c3-b3ff-fd600eecc4d3`
- Source commit: `31ac79a0432d3d97e78b642f8de6b39f7aa4e270`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 7)
- Artifact: <https://expo.dev/artifacts/eas/CCopaRfzWcBnyOQidypYrGQxYKFwMyhSi7xzMkUSSrg.apk>
- Size: 96,728,894 bytes
- SHA-256: `443ed585e98f6cc816664702b30e1f213466f699df686a7f0f196b49fb46755f`
- Verification: EAS finished successfully; downloaded file is a ZIP/APK and
  every archive entry passed `unzip -t`; its application bundle contains the
  configured tailnet API and privacy/support web origins, the message request
  identifier path, and the append-only safety-report update flow

Android may require permission to install an app delivered by the browser. The
device must be a member of the `cheetah-vernier` tailnet. This Mac has no
Android SDK, emulator, or connected Android device, so on-device installation
and APK signature inspection remain separate validation steps.

### Android Play App Bundle — build 7

- Purpose: Google Play internal testing or later store submission
- EAS build: `3b650421-2270-4901-823c-364a918424be`
- Source commit: `31ac79a0432d3d97e78b642f8de6b39f7aa4e270`
- Package: `org.openmatch.app`
- Version: `0.1.0` (`versionCode` 7)
- Artifact: <https://expo.dev/artifacts/eas/TfmqYMf_O7130TUr2uqJqaSUj6-wttKcIRenWeMHTms.aab>
- Size: 68,100,018 bytes
- SHA-256: `586c7482d245aac1561da02397b8b962c2f3487f26d1e73fcd76489b2d296efe`
- Verification: EAS finished successfully; downloaded file is a ZIP/AAB,
  every archive entry passed `unzip -t`, and its application bundle contains
  JAR signature metadata is present; and its bundle contains the expected
  package identifier, tailnet API and privacy/support web origins, message
  request identifier path, and append-only safety-report update flow

An AAB is not directly installable. Google Play Console enrollment, listing,
data-safety declarations, tester setup, and submission have not been performed.

### iOS Simulator archive — build 1

- Purpose: unsigned native compilation and testing in iOS Simulator
- EAS build: `4992a30c-015b-4f2c-a00a-debdb60c4c96`
- Source commit: `31ac79a0432d3d97e78b642f8de6b39f7aa4e270`
- Bundle identifier: `org.openmatch.app`
- Version: `0.1.0` (`CFBundleVersion` 1)
- Artifact: <https://expo.dev/artifacts/eas/RPZTQkyb5so5bkdnhdkDmISvtQNL2P4Y7astq7SxGsw.tar.gz>
- Size: 22,359,150 bytes
- SHA-256: `eee5e7b500e21cecdb666ec595175653f6665c03155c312ce612837966659e58`
- Verification: EAS finished successfully; gzip integrity passed; archive
  contains `OpenMatch.app`; `Info.plist` contains the expected identifier and
  version; the executable is a universal Simulator Mach-O for `arm64` and
  `x86_64`; the configured tailnet API and privacy/support web origins are
  present; the message request identifier and append-only safety-report update
  paths are embedded; and
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

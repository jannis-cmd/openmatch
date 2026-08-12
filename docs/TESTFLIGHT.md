# TestFlight prototype

This profile creates a private iOS build for testing on a real iPhone. It is
not a production deployment yet.

## Current network model

The build connects to `http://192.168.1.134:4000`, the development Mac's LAN
address when this profile was created. The iPhone and Mac must be on the same
trusted Wi-Fi network, and the local API must remain running:

```bash
HOST=0.0.0.0 pnpm --filter @openmatch/api dev
```

If the Mac's LAN address changes, update
`build.production.env.EXPO_PUBLIC_OPENMATCH_API_URL` in
`apps/mobile/eas.json` before making another build. A later external testing
release must use an HTTPS-hosted API with real authentication instead.

## Build and submit

From `apps/mobile`, sign in to an Expo account and a paid Apple Developer
account, then run:

```bash
npx testflight
```

The command creates the EAS project if needed, configures signing, builds the
iOS app, and submits it to App Store Connect. After Apple finishes processing,
install it from the TestFlight app using the internal tester invitation.

The initial bundle identifier is `org.openmatch.app`. If Apple reports that it
is unavailable for the selected developer team, replace it in `app.json` with
a unique reverse-domain identifier before retrying.

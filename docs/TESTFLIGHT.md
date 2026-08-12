# Mobile builds and TestFlight

The native app is ready for local-device development. Public preview and
TestFlight distribution must wait for an authenticated OpenMatch API deployed
at a stable HTTPS origin. The repository intentionally contains no private IP
address or production endpoint.

## Local development on a phone

Run the API on the development computer's network interface:

```bash
HOST=0.0.0.0 pnpm --filter @openmatch/api dev
```

Then start Expo with that computer's current LAN or Tailnet address:

```bash
EXPO_PUBLIC_OPENMATCH_API_URL=http://YOUR_COMPUTER_IP:4000 \
  pnpm --filter @openmatch/mobile dev
```

Local development accepts HTTP deliberately. Do not reuse this configuration
for a distributed build.

## Configure an EAS environment

Every EAS build requires `EXPO_PUBLIC_OPENMATCH_API_URL` to be a plain HTTPS
origin. Configure it separately for the `development`, `preview`, or
`production` EAS environment rather than committing it to `eas.json`:

```bash
cd apps/mobile
eas env:create \
  --environment preview \
  --name EXPO_PUBLIC_OPENMATCH_API_URL \
  --value https://api.example.org \
  --visibility plaintext
eas env:list --environment preview
```

The value is public app configuration, not a secret. Never place API keys or
credentials in an `EXPO_PUBLIC_*` variable.

The build hook stops an EAS build if the URL is absent, uses HTTP, or contains
credentials, a path, query, or fragment. The app also checks the configuration
at runtime and displays a configuration error without making a request.

## Preview build

After the HTTPS service has authentication, abuse controls, monitoring, and a
tested data-deletion path:

```bash
cd apps/mobile
eas build --profile preview --platform ios
```

Use this internal build for a small, consented pilot before App Store review.

## TestFlight production build

Configure and verify the production EAS environment, then build and submit:

```bash
cd apps/mobile
eas env:list --environment production
eas build --profile production --platform ios --auto-submit
```

The current bundle identifier is `org.openmatch.app`. If it is unavailable for
the selected Apple Developer team, replace it in `app.json` with a unique
reverse-domain identifier. App Store privacy disclosures must reflect the
deployed service, not only this prototype repository.

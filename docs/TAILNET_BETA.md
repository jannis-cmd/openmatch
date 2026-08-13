# Tailnet beta operation

This is an internal test arrangement, not public production hosting.

## Current endpoints

- API: `https://janniss-macbook-air.cheetah-vernier.ts.net`
- Web app and landing page: `https://janniss-macbook-air.cheetah-vernier.ts.net:8443`

Both endpoints are restricted to devices signed into the `cheetah-vernier`
tailnet. The iOS and Android production build profiles receive the API origin
through the EAS `production` environment. No private IP address is embedded in
the application.

The API enables both isolated accounts and the explicitly labeled private demo.
Demo sessions use separate random bearer tokens but intentionally share one
sample identity and dataset. They are suitable only for owner testing on this
restricted tailnet and must be disabled before any public deployment.

The Mac runs production builds of the API and web client as user LaunchAgents:

- `org.openmatch.api` proxies local port `4000` through tailnet HTTPS port 443.
- `org.openmatch.web` proxies local port `3000` through tailnet HTTPS port 8443.

The API accepts browser requests only from the exact web-app origin above.
Native clients do not send a browser `Origin` header.

## Update procedure

After a verified code change:

1. Run the complete repository release gate.
2. Build the API and web app. The web build must receive the tailnet API URL as
   `NEXT_PUBLIC_OPENMATCH_API_URL`.
   This host keeps that public value in ignored
   `apps/web/.env.production.local`. The web LaunchAgent sets
   `OPENMATCH_EXPECTED_WEB_API_ORIGIN`; startup fails instead of silently
   serving an unconfigured account/demo bundle when the expected origin is not
   embedded in the production client chunks.
3. Update `OPENMATCH_COMMIT_SHA` in the API LaunchAgent to the reviewed commit.
4. restart both LaunchAgents;
5. verify local and tailnet `/health`, the web title, and the allowed CORS origin;
6. create store builds only from the same committed revision.

## Explicit limits

- The Mac must be powered on, awake, connected to the internet, signed in, and
  running Tailscale.
- Test devices must be members of the same tailnet.
- This setup has no redundant host, durable job queue, operational alerting,
  encrypted backup, restoration drill, or staffed incident response.
- SMTP is not configured in the current host service. Inbox confirmation,
  backup notification addresses, and security-email delivery therefore remain
  visibly unavailable. They must not be represented as active.
- Account-to-account changes use a durable local journal with idempotent replay
  after interruption. This has no cross-host worker, dead-letter support path,
  or production monitoring and is not a distributed transaction system.
- Tailnet access is useful for owner testing, not a substitute for a reviewed
  public deployment, moderation operation, DPIA, penetration test, or app-store
  launch review.

If the Mac is lost or compromised, revoke EAS credentials and tailnet access,
stop distribution, and treat the local account database as potentially
exposed. Do not invite external testers until the security, moderation, legal,
and service-availability prerequisites in `docs/IMPLEMENTATION_STATUS.md` are
resolved.

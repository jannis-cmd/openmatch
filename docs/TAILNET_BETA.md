# Funnel development operation

This is an internal test arrangement, not public production hosting.

## Current endpoints

- API, web app, and landing page: `https://myna-1.cheetah-vernier.ts.net:8443`

Tailscale Funnel publishes this origin to the internet, so invited developers
do not need to join the `cheetah-vernier` tailnet. The iOS and Android
production build profiles receive the API origin through the EAS `production`
environment. No private IP address or service credential is embedded in the
application.

The deployed API enables isolated accounts and disables shared demo sessions.
Every tester must create or receive an individual account; dating profile,
preferences, decisions, matches, messages, safety actions, and settings remain
account-scoped.

`myna-1` runs the Docker development stack. Tailscale Funnel terminates HTTPS
on port 8443 and proxies one origin to the Caddy gateway; Caddy routes the
website and WhyMatch API. Hosted Supabase provides Auth and PostgreSQL. Port
443 remains untouched because another server application already owns it.

The API accepts browser requests only from the exact web-app origin above.
Native clients do not send a browser `Origin` header.

## Update procedure

After a verified code change:

1. Run the complete repository release gate.
2. Pull the reviewed commit in `/opt/openmatch`, set the HTTPS site/API/Auth
   origins and the reviewed `OPENMATCH_COMMIT_SHA` in ignored
   `infra/dev/.env`, and rebuild the affected Compose services.
3. Restart the gateway after a Caddy routing change.
4. Confirm `tailscale funnel status` still publishes HTTPS port 8443 to the
   gateway.
5. Verify local and public-Funnel `/health`, the web title, and the allowed CORS
   origin.
6. create store builds only from the same committed revision.

## Explicit limits

- `myna-1` must be powered on, connected to the internet, and running Tailscale
  plus the Docker Compose services.
- This setup has no redundant host, durable job queue, operational alerting,
  encrypted backup, restoration drill, or staffed incident response.
- Hosted Supabase Auth sends confirmation and password-reset messages through a
  dedicated Brevo SMTP credential and a temporary authenticated `myna-ai.ch`
  sender. A WhyMatch sender domain, bounce/complaint monitoring, and an operator
  support path remain required before a real-person pilot.
- Account-to-account changes use a durable local journal with idempotent replay
  after interruption. This has no cross-host worker, dead-letter support path,
  or production monitoring and is not a distributed transaction system.
- Funnel access is useful for invited developer testing, not a substitute for a
  reviewed production deployment, moderation operation, DPIA, penetration
  test, or app-store launch review.

If the server is lost or compromised, disable Funnel, revoke EAS and hosted
Supabase credentials, stop distribution, and treat the development account
database as potentially exposed. Invite only developers using fictional test
profiles until the security, moderation, legal, and service-availability
prerequisites in `docs/IMPLEMENTATION_STATUS.md` are resolved.

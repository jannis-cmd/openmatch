# Tailnet beta operation

This is an internal test arrangement, not public production hosting.

## Current endpoints

- API, web app, and landing page: `https://myna-1.cheetah-vernier.ts.net:8443`

Both endpoints are restricted to devices signed into the `cheetah-vernier`
tailnet. The iOS and Android production build profiles receive the API origin
through the EAS `production` environment. No private IP address is embedded in
the application.

The API enables both isolated accounts and the explicitly labeled private demo.
Demo sessions use separate random bearer tokens but intentionally share one
sample identity and dataset. They are suitable only for owner testing on this
restricted tailnet and must be disabled before any public deployment.

`myna-1` runs the self-hosted Docker development stack. Tailscale Serve
terminates HTTPS on port 8443 and proxies one origin to the Caddy gateway;
Caddy routes the website, WhyMatch API, and GoTrue Auth. Port 443 remains
untouched because another server application already owns it.

The API accepts browser requests only from the exact web-app origin above.
Native clients do not send a browser `Origin` header.

## Update procedure

After a verified code change:

1. Run the complete repository release gate.
2. Pull the reviewed commit in `/opt/openmatch`, set the HTTPS site/API/Auth
   origins and the reviewed `OPENMATCH_COMMIT_SHA` in ignored
   `infra/dev/.env`, and rebuild the affected Compose services.
3. Restart the gateway after a Caddy routing change.
4. Confirm `tailscale serve status` still routes HTTPS port 8443 to the gateway.
5. verify local and tailnet `/health`, the web title, and the allowed CORS origin;
6. create store builds only from the same committed revision.

## Explicit limits

- `myna-1` must be powered on, connected to the internet, and running Tailscale
  plus the Docker Compose services.
- Test devices must be members of the same tailnet.
- This setup has no redundant host, durable job queue, operational alerting,
  encrypted backup, restoration drill, or staffed incident response.
- Mailpit captures development confirmation and password-reset messages. It is
  not production SMTP and is tailnet-private; no public tester should depend on
  it. A production mail provider, bounce/complaint monitoring, and an operator
  support path remain required.
- Account-to-account changes use a durable local journal with idempotent replay
  after interruption. This has no cross-host worker, dead-letter support path,
  or production monitoring and is not a distributed transaction system.
- Tailnet access is useful for owner testing, not a substitute for a reviewed
  public deployment, moderation operation, DPIA, penetration test, or app-store
  launch review.

If the server is lost or compromised, revoke EAS credentials and tailnet
access, stop distribution, and treat the development account database as potentially
exposed. Do not invite external testers until the security, moderation, legal,
and service-availability prerequisites in `docs/IMPLEMENTATION_STATUS.md` are
resolved.

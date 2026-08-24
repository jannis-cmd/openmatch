# Self-hosted development services

WhyMatch development uses a deliberately small, Supabase-compatible service
set: PostgreSQL, Supabase Auth (GoTrue), a narrow Caddy gateway, and Mailpit.
It omits Studio, Realtime, Analytics, Storage, and PostgREST until the product
actually needs them. This keeps the shared development server small and makes
the authentication and database boundary explicit.

This environment is development infrastructure, not a public production
deployment. It has no high availability, managed backups, production mail,
security monitoring, or incident response.

In this mode GoTrue owns user credentials, email confirmation, and access
tokens. WhyMatch stores only an identity mirror plus a hash of each token to
route requests to isolated application stores. Password change and permanent
account deletion are wired through GoTrue. The older WhyMatch recovery-code,
primary-email-change, and backup-notification-address workflows are not used by
the self-hosted clients. Forgotten passwords use GoTrue's standard email reset
link; completing the link changes the password and invalidates every other
WhyMatch session. Production still needs a real SMTP provider, HTTPS redirect
URLs, and delivery monitoring. Dating profiles and interactions use
normalized, account-scoped tables in PostgreSQL's `app` schema. SQLite remains
only for standalone regression tests and as an archived migration source.

## Start locally

```bash
./scripts/dev-infra-env.sh
docker compose --env-file infra/dev/.env -f infra/dev/compose.yaml up -d
docker compose --env-file infra/dev/.env -f infra/dev/compose.yaml ps
```

The generated configuration binds to `127.0.0.1`:

- Auth: `http://127.0.0.1:54321/auth/v1`
- WhyMatch API: `http://127.0.0.1:54321`
- Web app: `http://127.0.0.1:3000`
- Mailpit inbox: `http://127.0.0.1:8025`
- PostgreSQL: private Docker network only

To stop the services without deleting data:

```bash
docker compose --env-file infra/dev/.env -f infra/dev/compose.yaml down
```

Do not add `--volumes` unless deletion of every development account and email
is intentional.

## myna-1

On `myna-1`, set all three public URL host values and
`OPENMATCH_BIND_ADDRESS` to the server's Tailnet IP. The firewall-facing public
interface must not expose ports 54321 or 8025. Mailpit contains authentication
links and is therefore as sensitive as the corresponding development accounts.

The initial server configuration is:

```text
OPENMATCH_BIND_ADDRESS=100.94.214.92
OPENMATCH_AUTH_URL=http://100.94.214.92:54321/auth/v1
OPENMATCH_API_URL=http://100.94.214.92:54321
OPENMATCH_SITE_URL=http://100.94.214.92:3000
```

The current private HTTPS entry point is
`https://myna-1.cheetah-vernier.ts.net:8443`. Tailscale Serve terminates TLS and
proxies that origin to the gateway, which serves both the website and API.
Port 8443 is intentional because another service on `myna-1` already owns 443.
GoTrue's external/auth/site URLs and the web/mobile release configuration must
use this HTTPS origin; keep the older HTTP origin allowlisted only while
transitioning existing development browser sessions.

## Verification

```bash
curl --fail http://127.0.0.1:54321/health
curl --fail http://127.0.0.1:54321/auth/v1/health

OPENMATCH_AUTH_URL=http://127.0.0.1:54321/auth/v1 \
OPENMATCH_MAILPIT_URL=http://127.0.0.1:8025 \
node scripts/dev-auth-smoke.mjs
```

The full WhyMatch API flow and the fictional 20-profile pool can be checked
without placing a password in the repository:

```bash
OPENMATCH_API_URL=http://127.0.0.1:54321 \
OPENMATCH_MAILPIT_URL=http://127.0.0.1:8025 \
node scripts/dev-api-auth-smoke.mjs

OPENMATCH_API_URL=http://127.0.0.1:54321 \
OPENMATCH_MAILPIT_URL=http://127.0.0.1:8025 \
OPENMATCH_TEST_PASSWORD='set-a-local-secret-of-15-or-more-characters' \
node scripts/dev-seed-test-accounts.mjs
```

An account-flow smoke test should register a unique development address, read
its confirmation message in Mailpit, confirm the address, sign in, refresh the
session, request a password-reset email, follow its one-time link, and verify
that the new password signs in while a password shorter than 15 characters is
rejected.
No seeded account should use a real person's address or production password.

## SQLite application-data migration

Stop API writes and create both an API-volume archive and a PostgreSQL dump
before importing. Apply `infra/dev/postgres/migrations/001-application-data.sql`
through the `app-migrations` Compose service, then run:

```bash
OPENMATCH_MIGRATION_APPLY=true \
docker compose --env-file infra/dev/.env -f infra/dev/compose.yaml run --rm \
  api node scripts/migrate-sqlite-app-data.mjs
```

The explicit apply flag prevents accidental writes. Each account is replaced
inside one PostgreSQL transaction only when a matching `auth.users` UUID
exists. The importer compares a canonical hash of every source row with the
rows read back from PostgreSQL and records the verified hash and per-table
counts in `app.sqlite_migration_audit`. Keep the pre-migration archives until a
restore drill and a PostgreSQL-only API restart both pass. The migration is
idempotent but must not run while either data source is accepting writes.

The current synchronous compatibility bridge uses a dedicated worker and
database connection for every loaded account. It is appropriate for the small
private development pool, not for a public deployment. Replace it with an
asynchronous pooled repository, transaction-scoped account context, reviewed
database roles/RLS, load tests, and connection-budget monitoring before a pilot.

## Transfer path

Application schema changes belong in versioned, plain SQL migrations. GoTrue
owns the `auth` schema; WhyMatch owns the `app` schema. Application tables
should reference `auth.users(id)` using opaque UUIDs but must not store dating
profile fields in auth user metadata.

For a managed Supabase destination, use a schema-only dump plus a reviewed data
migration. Authentication users can move with the `auth` schema, but changing
JWT signing keys invalidates existing sessions, so users must sign in again.
Development email contents are never transferred. Before any move, test both a
backup and a restore into a disposable database and record the exact image and
migration versions.

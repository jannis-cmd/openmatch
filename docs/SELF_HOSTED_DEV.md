# Self-hosted development services

OpenMatch development uses a deliberately small, Supabase-compatible service
set: PostgreSQL, Supabase Auth (GoTrue), a narrow Caddy gateway, and Mailpit.
It omits Studio, Realtime, Analytics, Storage, and PostgREST until the product
actually needs them. This keeps the shared development server small and makes
the authentication and database boundary explicit.

This environment is development infrastructure, not a public production
deployment. It has no high availability, managed backups, production mail,
security monitoring, or incident response.

In this mode GoTrue owns user credentials, email confirmation, and access
tokens. OpenMatch stores only an identity mirror plus a hash of each token to
route requests to isolated application stores. Password change and permanent
account deletion are wired through GoTrue. The older OpenMatch recovery-code,
primary-email-change, and backup-notification-address workflows are not yet
migrated and remain a release blocker. Dating profiles and interactions still
use per-account SQLite files; PostgreSQL currently holds the GoTrue schema and
the reserved OpenMatch application schema only.

## Start locally

```bash
./scripts/dev-infra-env.sh
docker compose --env-file infra/dev/.env -f infra/dev/compose.yaml up -d
docker compose --env-file infra/dev/.env -f infra/dev/compose.yaml ps
```

The generated configuration binds to `127.0.0.1`:

- Auth: `http://127.0.0.1:54321/auth/v1`
- OpenMatch API: `http://127.0.0.1:54321`
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

## Verification

```bash
curl --fail http://127.0.0.1:54321/health
curl --fail http://127.0.0.1:54321/auth/v1/health

OPENMATCH_AUTH_URL=http://127.0.0.1:54321/auth/v1 \
OPENMATCH_MAILPIT_URL=http://127.0.0.1:8025 \
node scripts/dev-auth-smoke.mjs
```

The full OpenMatch API flow and the fictional 20-profile pool can be checked
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
session, and verify that a password shorter than 15 characters is rejected.
No seeded account should use a real person's address or production password.

## Transfer path

Application schema changes belong in versioned, plain SQL migrations. GoTrue
owns the `auth` schema; OpenMatch owns the `app` schema. Application tables
should reference `auth.users(id)` using opaque UUIDs but must not store dating
profile fields in auth user metadata.

For a managed Supabase destination, use a schema-only dump plus a reviewed data
migration. Authentication users can move with the `auth` schema, but changing
JWT signing keys invalidates existing sessions, so users must sign in again.
Development email contents are never transferred. Before any move, test both a
backup and a restore into a disposable database and record the exact image and
migration versions.

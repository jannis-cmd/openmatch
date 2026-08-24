# Public web deployment

The WhyMatch web app has two deliberately separate modes:

1. **Public site only (recommended now):** build without
   `NEXT_PUBLIC_OPENMATCH_API_URL`. The complete landing page, research links,
   transparency material, safety resources, and offline score calculator work.
   Demo buttons are visibly unavailable and make no network request.
2. **Interactive development demo:** build with a plain HTTPS API origin only
   for a deliberately isolated test environment. The API must explicitly enable
   demo-session issuance. Random expiring tokens replace the old universal
   credential, but every token still reaches one shared demo identity. This is
   not suitable for real users or a public network service.

## Publish the public site now

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @openmatch/web build
pnpm --filter @openmatch/web start
```

Do not set `NEXT_PUBLIC_OPENMATCH_API_URL`. The production build fails closed at
the demo boundary instead of trying a visitor's localhost or another implicit
endpoint.

## Configure an isolated interactive demo

For a controlled development environment only:

```bash
NEXT_PUBLIC_OPENMATCH_API_URL=https://api.example.org \
  pnpm --filter @openmatch/web build
pnpm --filter @openmatch/web start
```

The value is public client configuration and must never contain a credential or
secret. Production accepts only a plain HTTPS origin without a path, query, or
fragment. Because public environment values are embedded at build time, rebuild
after changing the endpoint.

Configure `OPENMATCH_ALLOWED_ORIGINS` on the API with the exact public web
origin and set `OPENMATCH_ENABLE_DEMO_SESSIONS=true`. A wildcard is not an
acceptable substitute. Before any pilot, replace this entire demo-session path
with account authentication and user-partitioned authorization.

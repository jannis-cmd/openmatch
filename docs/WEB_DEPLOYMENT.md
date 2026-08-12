# Public web deployment

The OpenMatch web app has two deliberately separate modes:

1. **Public site only (recommended now):** build without
   `NEXT_PUBLIC_OPENMATCH_API_URL`. The complete landing page, research links,
   transparency material, safety resources, and offline score calculator work.
   Demo buttons are visibly unavailable and make no network request.
2. **Interactive service:** build with a plain HTTPS API origin. This mode is
   reserved for a service that has production authentication, authorization,
   abuse controls, monitoring, and the other pilot prerequisites. The current
   static demo-session header is not authentication, so the prototype API must
   not be exposed publicly.

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

## Configure a future interactive deployment

Only after the API is safe for a networked pilot:

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
origin. A wildcard is not an acceptable substitute.

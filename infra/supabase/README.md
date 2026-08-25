# Hosted Supabase deployment

WhyMatch keeps hosted production infrastructure reproducible and portable:

1. Run `001-hosted-bootstrap.sql` as the project database owner.
2. Run `../dev/postgres/migrations/001-application-data.sql`.
3. Keep the `app` schema out of the Data API's exposed schema list.
4. Connect the server-side API with the pooled PostgreSQL connection string.
5. Configure Auth with the project URL, publishable key, and backend secret key.

The browser and mobile clients continue to call the WhyMatch API. They never
receive database credentials or the Supabase backend secret key. Supabase Auth
passwords, sessions, confirmation links, and recovery links remain owned by
the hosted Auth service.

IPv4-only application hosts should use Supabase's session pooler with
`sslmode=verify-full`. The API image trusts the Supabase Root 2021 CA published
by Supabase at
`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`.
The pinned certificate expires in April 2031 and must be reviewed before then.

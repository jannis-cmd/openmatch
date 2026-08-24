DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres NOLOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION openmatch_auth;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION openmatch_auth;

ALTER ROLE openmatch_auth SET search_path TO auth, app, public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMENT ON SCHEMA auth IS
  'Owned and migrated by Supabase Auth. Application code must not write here.';
COMMENT ON SCHEMA app IS
  'WhyMatch application data. Changes are applied by versioned SQL migrations.';

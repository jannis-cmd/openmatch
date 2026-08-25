BEGIN;

CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION postgres;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM anon;
REVOKE ALL ON SCHEMA app FROM authenticated;

COMMENT ON SCHEMA app IS
  'WhyMatch private application data. Only the server-side matching API may access it.';

COMMIT;


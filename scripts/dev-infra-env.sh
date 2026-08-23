#!/bin/sh
set -eu

target=${1:-infra/dev/.env}
example=infra/dev/.env.example

if [ -e "$target" ]; then
  echo "$target already exists; refusing to overwrite it" >&2
  exit 1
fi

if [ ! -f "$example" ]; then
  echo "run this script from the repository root" >&2
  exit 1
fi

postgres_password=$(openssl rand -hex 24)
jwt_secret=$(openssl rand -hex 32)

sed \
  -e "s/replace-with-a-random-secret/$postgres_password/" \
  -e "s/replace-with-at-least-32-random-characters/$jwt_secret/" \
  "$example" > "$target"

chmod 600 "$target"
echo "Created $target. Review its URLs before starting the services."

# Dependency security status

Reviewed 13 August 2026 against `pnpm audit --prod` and the npm registry.

## Resolved advisories

The root lock policy forces these patched transitive versions across every
workspace:

- `sharp` 0.35.3, resolving the inherited libvips advisories reported against
  versions before 0.35.0;
- `postcss` 8.5.26, resolving the source-map file-disclosure and earlier
  stringification advisories reported through 8.5.22;
- `uuid` 11.1.1 when an upstream package requests an older version, resolving
  the missing buffer-bound check reported before 11.1.1.

`scripts/dependency-policy.test.mjs` checks both the declared override policy
and resolved lock snapshots so an ordinary dependency update cannot silently
restore those vulnerable versions. This is a compensating pin, not a claim
that upstream compatibility lasts forever; every Expo and Next.js upgrade must
rerun the complete native/web build gate and the audit.

## Known unpatched advisory

The audit still reports two high-severity denial-of-service advisories in
`image-size` 1.2.1, reached only through Expo/Metro and React Native build
tooling. As of this review, the registry advisory declares every published
version through 2.0.2 vulnerable and names no patched version. It concerns
parsing crafted ICNS, JXL, or HEIF files.

OpenMatch does not accept or parse user-uploaded images at runtime, and the
current source tree contains only reviewed repository assets. This limits the
current exposure to a developer or cloud builder processing a malicious source
asset; it does not remove the vulnerability. Do not build unreviewed branches
or replace native assets with untrusted files. Track the upstream Metro and
`image-size` fix, remove this exception as soon as a compatible patched release
exists, and rerun `pnpm audit --prod` before every distributed build.

# Privacy and security baseline

## Data principles

Collect only what a current feature requires; state purpose before collection; separate public visibility from processing consent; use coarse location; encrypt in transit and at rest; short retention; audited access; easy export/deletion; no advertising identifiers, contact uploads, data brokers, or cross-service tracking.

## Initial retention proposal (requires legal and community review)

- paused profile: hidden immediately, retained 90 days unless user selects earlier deletion;
- deleted profile and preference records: purge within 30 days, backups age out within 90 days;
- ordinary messages: user-controlled deletion, maximum 12 months after connection closes;
- unresolved safety evidence: case-specific retention with notice where lawful and periodic review;
- security logs: 30–90 days with minimized IP/device data;
- aggregate statistics: only after disclosure control prevents singling out.

## Primary threats

Stalking/location triangulation, scraping and enumeration, credential stuffing, catfishing/impersonation, romance scams, unsolicited sexual content, discriminatory harassment, report brigading, moderator abuse, insider access, intimate-data breach, model inversion/re-identification, supply-chain compromise, and coerced device access.

### Prototype message friction

Before a message is sent, two public deterministic rules check its text for an external link or common payment-request wording. The same rules run at the API boundary so a modified client cannot silently bypass the pause. A warning names the triggered rules, states that they can be wrong, and allows the person to go back or explicitly send anyway. The service stores only a message that is ultimately sent: it creates no scam score, warning log, report, block, or visibility change. This is contextual education, not an accusation or a safety guarantee. The evidence basis is grade D practice guidance and literature synthesis; effectiveness requires prospective safety evaluation.

## Required controls before pilot

Threat model, data inventory, DPIA, passkeys or strong authentication, session/device management, rate limiting, enumeration-resistant APIs, coarse-location tests, secure media processing, malware scanning, audit logs, least privilege, dual approval for bulk access, secret management, encrypted backups, deletion drills, incident plan, dependency/SAST scanning, independent penetration test, vulnerability disclosure and safe harbor.

End-to-end encryption for messaging is an open design question because user safety reports need consented evidence submission. The decision must publish its threat tradeoff; “encrypted” cannot be used as vague marketing.

## Matching explanations

Source code, formulas, field purposes, and aggregate audits are public. Individual preference settings remain personal data. Candidate-side factor weights default to private, including in the fictional demo; a complete trace is returned only when that candidate's `explanationSharing` setting is `shared`. Redaction occurs after the complete score is calculated and cannot change eligibility, directed fit, reciprocal fit, or ordering. The explanation distinguishes private personal inputs from undocumented system factors: private inputs may affect a score, but undocumented system inputs may not.

Candidate generation uses an internal distance estimate between coarse profile regions. Introduction and connection payloads remove that number and expose only `Within 5 km`, `5–15 km`, `15–30 km`, `30–50 km`, or `50+ km`. This prevents an interface or downstream client from accidentally presenting false precision. The banding policy still requires triangulation testing before a pilot, especially in sparsely populated regions.

## Development-service boundary

The local API is not production authentication, but it is still defensive: personal responses are `no-store`, JSON bodies are limited to 64 KiB, candidate identifiers must resolve before decisions or safety actions, and browser origins default to only `localhost:3000` and `127.0.0.1:3000`. Native requests without an `Origin` header remain supported. Additional development origins require the explicit comma-separated `OPENMATCH_ALLOWED_ORIGINS` setting. A real deployment must replace the visible demo header with authenticated, rotating, origin-independent sessions and CSRF protections appropriate to the chosen credential transport.

Authenticated prototype routes are also limited per direct network address (600 requests per 60 seconds by default, configurable with `OPENMATCH_RATE_LIMIT_MAX` and `OPENMATCH_RATE_LIMIT_WINDOW_MS`). The deliberately generous development default supports the prototype’s broad state refreshes; it is not a recommended production threshold. Responses expose remaining capacity and return `429` plus `Retry-After` when exhausted. This in-memory local guard is not a production abuse system: a deployment behind a proxy must use authenticated-account/device keys, safely configured proxy addresses, shared storage, endpoint-specific limits, and monitoring.

# Changelog

All notable changes to Lock Note are documented here. The project uses these entries to explain **why** a release changed the security or delivery model, not merely which files changed.

## 2026-08-25 — Encrypted recipient replies

This release adds a deliberate two-way delivery option without turning Lock Note into a plaintext messaging service or weakening the verified-delivery model.

| Area | Change | Why it matters |
| --- | --- | --- |
| **Opt-in encrypted replies** | Senders may enable short recipient replies on non-burn notes. A fresh reply capability is embedded only inside the AES-GCM-authenticated content envelope; the database stores only its SHA-256 verifier. | A recipient can voluntarily confirm or ask a follow-up after decrypting, while a bare paste ID cannot inject replies. |
| **Domain separation and ownership** | Reply plaintext is encrypted in the browser with a dedicated `${pasteId}|locknote/v1|reply` AAD domain. The sender retrieves opaque reply envelopes only with the owner capability and decrypts them locally. | Reply ciphertext cannot be replayed as note/file ciphertext, and the API never gains plaintext, a content key, passphrase, raw reply capability, or recipient identity. |
| **Lifecycle enforcement** | A locked service-role-only database function accepts replies only for active reply-enabled parents, caps each note at 20 replies, and parent deletion cascades to reply ciphertext. Replies do not refresh a dead switch. | A reply cannot become a keepalive channel, burn-after-read remains exactly-once delivery, and owner/Guardian/expiry cleanup removes future reply access. |
| **Evidence** | Added browser AAD/capability tests, server capability/owner/wipe/dead-switch tests, and production-smoke coverage. | The feature is tested as a security lifecycle, not only as a UI panel. |

## 2026-08-24 — Verified delivery and Guardian Wipe

This release turns Lock Note from a generic encrypted paste service into a more verifiable sender-control workflow.

| Area | Change | Why it matters |
| --- | --- | --- |
| **Verified delivery** | Version-two envelopes contain a random receipt proof. Only its hash is stored; a recipient browser acknowledges it only after successful local decryption. | An unauthenticated request can no longer inflate receipts or keep a dead-switch note alive. A receipt now means a browser opened the authenticated encrypted envelope. |
| **Private encrypted files** | The `secrets` bucket is non-public. A successful consume receives a 60-second, one-use lease that the API redeems server-side; a burn-after-read file persists its lease hash in the same conditional transition that burns the record. | Encrypted file objects no longer have a public storage URL, withdrawal/deletion invalidates pending delivery, and a transient post-burn lease failure cannot strand the successful recipient. |
| **Guardian Wipe** | Senders can distribute 2-of-3 through 5-of-5 browser-generated guardian cards. A quorum reconstructs only a revocation capability. | Trusted people can jointly withdraw a note without possessing any decryption key or plaintext access. |
| **Protocol policy** | The service and client enforce a 32-byte salt, 12-byte IV, HKDF with zero iterations, or PBKDF2-SHA256 at exactly 600,000 iterations. | Attacker-controlled metadata cannot select an unexpected KDF cost or malformed crypto parameter shape. |
| **Evidence** | Added proof replay, invalid-proof, file-lease replay, guardian verifier, malformed/mixed/duplicate share, and KDF policy regression coverage. | The differentiated security claims are executable tests, not presentation-only claims. |

## 2026-08-23 — Production hardening and evaluator readiness

| Area | Change | Why it matters |
| --- | --- | --- |
| **Account integrity** | Replaced demo profile fallback with Supabase-session-aware protected routes, owner-only profile metadata, and private contacts under RLS. | The product no longer presents browser-local demo identity as an account system. |
| **Deployment safety** | Corrected production Supabase routing and configuration, added readiness reporting, and hardened static headers. | The deployed application remains functional and gives maintainers a safe way to verify runtime configuration. |
| **Quality gates** | Added type checks, unit tests, Playwright + axe accessibility checks, bundle budget checks, dependency audit, and scheduled production smoke checks. | Evaluation evidence and regression protection are repeatable on every change. |
| **Observability** | Added request IDs, Server-Timing, build identity, and structured redacted request logs. | Operations can diagnose failure classes without logging notes, keys, fragments, proofs, or capabilities. |

## 2026-08-22 — Initial zero-knowledge delivery foundation

The initial release established browser-side AES-256-GCM encryption, fragment-key delivery, passphrase support, burn-after-read, expiry, owner withdrawal, encrypted files, draft sealing, and GitHub Auth. These controls established the foundational boundary that the service stores an encrypted envelope but never receives the decryption key.

## Release rules

Each release must pass `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:bundle`, `npm run test:accessibility`, and `npm audit --omit=dev --audit-level=high` before deployment. Production migrations must be applied first, followed by the live lifecycle and header checks described in [docs/TESTING.md](docs/TESTING.md).

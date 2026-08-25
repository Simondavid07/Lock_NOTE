# 🛡️ Locknote Security & Threat Model

Locknote adheres to strict cryptographic principles to ensure zero-knowledge data privacy.

---

## 1. Cryptographic Primitive Specs

| Layer | Algorithm / Standard | Specification |
|---|---|---|
| **Symmetric Cipher** | AES-256-GCM | 256-bit key, 96-bit random IV per payload, 128-bit authentication tag |
| **URL Key Derivation** | HKDF-SHA256 | `PROTOCOL = "locknote/v1"`, 256-bit output key |
| **Passphrase KDF** | PBKDF2-HMAC-SHA256 | Exactly 600,000 iterations, 32-byte random salt, 256-bit output key |
| **AAD Binding** | Authenticated Additional Data | `${pasteId}\|locknote/v1` bound to GCM tag |
| **Seal Fingerprint** | FNV-1a Hashing | 4-word mnemonic + color glyph derived from master secret |

---

## 2. Threat Model Analysis

### Threat Scenario 1: Malicious or Compromised Server / Database Leak
- **Risk**: An attacker gains full root access to the database or storage bucket.
- **Mitigation**: The database stores **only ciphertext, public salts, and public IVs**. Without the URL fragment `#k=...` (which never reaches HTTP headers or logs), recovery of plaintext is mathematically infeasible.

### Threat Scenario 2: Ciphertext Swap Attack
- **Risk**: A compromised server attempts to swap ciphertext from Paste A into Paste B to trick a recipient.
- **Mitigation**: AES-256-GCM uses **Authenticated Additional Data (AAD)** containing the Paste ID (`${pasteId}|locknote/v1`). Attempting to decrypt swapped ciphertext causes GCM authentication failure (`IntegrityError`).

### Threat Scenario 3: Wrong Passphrase on a One-Time Link
- **Risk**: A recipient uses the wrong passphrase on a burn-after-read paste and loses the server copy without recovering plaintext.
- **Mitigation and boundary**: The server cannot test a passphrase without violating the zero-knowledge model. A burn-after-read record is consumed when the ciphertext is delivered; a wrong passphrase still fails locally with `IntegrityError` but can consume the one-time delivery. Senders should verify passphrase delivery out of band, use owner preview before sending, or avoid burn-after-read when passphrase coordination is uncertain. No false claim is made that the service can distinguish a correct passphrase.

### Threat Scenario 4: Receipt Spoofing or Dead-Switch Keepalive
- **Risk**: A party with a paste ID attempts to inflate a receipt or refresh `lastViewedAt` without opening the encrypted envelope.
- **Mitigation**: New version-two envelopes contain a random 32-byte proof inside AES-GCM-authenticated ciphertext. The service stores only `SHA-256(proof)` and accepts the first acknowledgement only if the submitted proof matches. Replays and guessed values cannot change the receipt or dead-switch activity.

### Threat Scenario 5: Public Encrypted-File Link Reuse
- **Risk**: A public object URL remains fetchable after a sender withdraws a note or a one-time recipient opens it.
- **Mitigation**: The `secrets` bucket is private. A successful consume produces a 60-second, one-use API lease; the service redeems it server-side, clears it atomically, streams ciphertext with `Cache-Control: no-store`, and never returns a storage path to the browser.

### Threat Scenario 6: Guardian Share Misuse or Mixed Quorums
- **Risk**: A malicious party combines duplicate, altered, mixed-note, or mismatched threshold shares to obtain a revocation capability—or mistakes a guardian card for a decryption key.
- **Mitigation**: Guardian cards are browser-generated Shamir shares over a separate wipe capability. Each card is versioned, paste-bound, share-set-bound, coordinate-bound, quorum-bound, payload-length-checked, and SHA-256 checksum-protected. Reconstruction rejects duplicates and mismatches locally; the server stores only the capability verifier. Guardians never receive the content key.

### Threat Scenario 7: Encrypted Reply Capability Misuse
- **Risk**: A party who knows a paste identifier attempts to inject a reply, read recipient replies, or use reply traffic to keep a dead-switch note alive.
- **Mitigation and boundary**: Replies are opt-in and unavailable for burn-after-read notes. The raw reply capability exists only inside the AES-GCM-authenticated content envelope; the server retains only its SHA-256 verifier. Reply ciphertext is bound to a dedicated `${pasteId}|locknote/v1|reply` AAD domain, capped in size and count, and returned only after owner-capability verification. Reply traffic never changes verified-open or dead-switch timestamps. A reply is not an authenticated identity: anyone holding the full link may be able to reply or decrypt replies.

### Threat Scenario 8: Shoulder Surfing / Out-of-Band Substitution
- **Risk**: An intermediary modifies a link sent over chat/email.
- **Mitigation**: Locknote generates a **Seal Fingerprint** (4-word mnemonic + color glyph). Senders can verify the fingerprint with recipients over another channel (voice/signal).

---

## 3. Server Hardening Measures

- **No Content Logging**: Request logs strictly exclude response bodies and payloads.
- **Zod Strict Validation**: All REST routes sanitize inputs with Zod schemas. New envelopes must use a 32-byte salt, 12-byte IV, HKDF with zero iterations, or PBKDF2-SHA256 at exactly 600,000 iterations; hostile metadata cannot choose an arbitrary browser work factor.
- **Strict Size Limits**: Text payloads capped at ~1 MB; file payloads capped at 5 MB; reply ciphertext is bounded to 8 KiB and 20 encrypted replies per active paste.
- **Rate Limiting**: Sliding window per-IP buckets on paste creation (20/min), consumption (120/min), and encrypted reply submission (20/min).
- **Constant-Time Comparison**: Owner capability tokens and verifier comparisons use `crypto.timingSafeEqual`.
- **Hash-only Capability State**: Receipt proofs, Guardian Wipe capabilities, reply capabilities, and private file leases are persisted only as SHA-256 verifiers. Raw values are never logged, stored, or returned by owner endpoints.
- **One-use File Leases**: The private Storage bucket cannot be read directly by browsers. A file delivery token is valid for 60 seconds and consumed on the first redemption attempt.

- **Static Delivery Policy**: Vercel serves the application with an enforced CSP, restrictive Permissions Policy, `nosniff`, frame protection, COOP, CORP, and a strict referrer policy. The policy permits only Lock Note assets, required font/identity sources, and Supabase HTTPS/WebSocket connections.
- **Session-backed Private Routes**: `/dashboard` and `/profile` wait for Supabase session restoration and redirect unauthenticated visitors to login. Browser-local display data is never accepted as identity proof.
- **Owner-only Account Metadata**: `profiles` and `vault_contacts` use authenticated owner-only row-level security. These tables are limited to opt-in display metadata and contact usernames; they must never store note content, ciphertext, keys, fragments, passphrases, share URLs, or owner capabilities.
- **Redacted Operational Telemetry**: API responses expose a request ID and timing metric. Structured logs retain only a normalized route template, method, status, duration, request ID, and safe error class. They do not record bodies, secrets, path identifiers, authorization values, or user-provided content.
- **Release Gates**: CI fails on type, test, production-audit, bundle-budget, or serious/critical accessibility regressions. A scheduled/manual live smoke job verifies both the zero-knowledge lifecycle and production static headers.

> **Operational caveat:** the enforced CSP is intentionally narrow. When adding an external asset, analytics provider, identity provider, or browser integration, update the policy only after confirming the exact required origins and testing the OAuth, QR, and Supabase flows.

### Final review findings

The Supabase security advisor initially identified the database RLS auto-enable event-trigger helper as publicly executable. Migration `004_revoke_rls_trigger_execute.sql` removes `PUBLIC`, `anon`, and `authenticated` execution rights while preserving invocation by the database event-trigger mechanism. The post-remediation advisory no longer reports public execution of that SECURITY DEFINER function.

The project’s free Supabase plan does not provide the HaveIBeenPwned leaked-password check. As a compensating baseline for the enabled email provider, production requires the current password for password changes, a twelve-character minimum, and lowercase, uppercase, numeric, and symbol characters. This does not change the zero-knowledge note flow or GitHub OAuth.

Migration `005_verified_delivery_and_guardian_wipe.sql` adds receipt/guardian/file-lease verifiers and makes the file bucket non-public. The enforced browser boundary is a private `secrets` bucket, enabled Storage RLS, and no browser Storage-object policies; Supabase-managed baseline table-grant listings are not treated as authorization by themselves. It **must be applied before** the corresponding server release; legacy version-one records remain readable but do not claim cryptographic delivery receipts.

Migration `007_encrypted_recipient_replies.sql` adds opt-in reply policy state and a private `paste_replies` table. Browser roles have no table policies; service-role API code invokes a server-role-only locked database function that verifies the hash-only reply capability, enforces active lifecycle state and the 20-reply cap, then inserts opaque reply ciphertext. Parent deletion cascades to reply ciphertext on owner wipe, Guardian Wipe, or expiry cleanup.

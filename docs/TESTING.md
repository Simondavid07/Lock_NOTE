# Lock Note Testing and Reliability Guide

## Testing objective

Lock Note is evaluated as a privacy-sensitive lifecycle system, not only a visual interface. The verification strategy therefore checks cryptographic integrity, API state transitions, production configuration, and the deployed end-to-end workflow.

| Test layer | Primary concern | Tooling | Command |
| --- | --- | --- | --- |
| Client unit tests | Browser encryption/decryption and UI utilities | Vitest + jsdom | `npm run test -w client` |
| Server integration tests | Request validation, lifecycle logic, rate limits, and store contracts | Vitest + Supertest | `npm run test -w server` |
| Type checking | Type safety across React, Express, and Vercel entry points | TypeScript | `npm run typecheck` |
| Production build | Vite client and server artifact generation | npm workspaces | `npm run build` |
| Browser accessibility and keyboard flow | Public routes, serious/critical axe violations, command palette, and skip-link behavior | Playwright + axe-core | `npm run test:accessibility` |
| Bundle budget | Largest emitted JavaScript chunk remains within the production budget | Node post-build check | `npm run test:bundle` |
| Static-header smoke | Live CSP and companion static headers remain present | Node fetch check | `npm run test:headers` |
| Live lifecycle smoke test | Real deployed API and Supabase behavior | Node/TypeScript smoke script | `API_URL=... npm run test:live` |

## What is verified

### Client cryptography

| Behavior | Expected result |
| --- | --- |
| Encrypt then decrypt a note | Original plaintext is recovered only with the correct derived key. |
| Tamper with ciphertext | Authenticated decryption fails. |
| Change bound paste identifier | AES-GCM additional authenticated data check fails. |
| Use a wrong passphrase | Decryption fails locally. For a burn-after-read note, delivery may already be consumed because the zero-knowledge server cannot verify a passphrase; this boundary is demonstrated and documented. |
| Version-two proof envelope | A valid encrypted proof round-trips; a missing or malformed proof is rejected after authenticated decryption. |
| Fixed KDF policy | Invalid salt lengths and non-policy PBKDF2 iteration counts fail before key derivation. |
| Guardian shares | Valid K-of-N shares reconstruct the wipe capability; fewer, duplicate, modified, or mixed-set shares fail locally. |
| Generate a seal fingerprint | The visible fingerprint is deterministic for the same encrypted envelope metadata. |

### API lifecycle and authorization

| Behavior | Expected result |
| --- | --- |
| Create an encrypted paste | API returns a valid paste identifier and owner capability. |
| Read public metadata | API returns safe metadata without exposing an owner capability or plaintext. |
| Owner preview | Sender can inspect a note without consuming a burn-after-read note. |
| Recipient burn consume | First eligible consume succeeds; a later consume returns the burned state. |
| Remote wipe | Owner capability removes an active paste and future reads are unavailable. |
| Verified delivery receipt | Only a matching proof from a successfully decrypted envelope creates the first receipt acknowledgement; guessed/replayed proofs fail. |
| Private encrypted-file lease | Successful file consume returns no storage path, issues one short-lived lease, and rejects replay after ciphertext streaming. |
| Guardian Wipe | A verifier-matched reconstructed capability deletes a note; an incorrect capability is forbidden. |
| Draft seal | A temporary draft can be converted into a sealed encrypted note. |
| Invalid request | Zod validation returns a controlled client error rather than an unhandled failure. |
| Rate-limit policy | Repeated traffic is constrained through API rate limiting. |

## Required release checks

Run these commands before merging, deploying, or presenting the project.

```bash
# Install the exact locked dependency graph
npm ci

# Validate all TypeScript entry points
npm run typecheck

# Build the production client and server artifacts
npm run build

# Run unit and integration tests
npm run test

# Enforce the largest emitted JavaScript-chunk budget
npm run test:bundle

# Exercise public routes with axe and keyboard navigation
npm run test:accessibility

# Audit production dependencies for high-severity findings
npm audit --omit=dev --audit-level=high
```

A release is not ready merely because the frontend builds. The deployed API must also initialize the Supabase store successfully and route nested endpoints correctly.

## Live deployment smoke test

Use the live Vercel domain after deployment:

```bash
API_URL=https://lock-note-sigma.vercel.app npm run test:live
```

The smoke test confirms all of the following against the real deployed service:

1. Health endpoint reports a reachable Supabase-backed store.
2. An encrypted note can be created.
3. Safe metadata is available without plaintext disclosure.
4. Owner preview works without burning the note.
5. Burn-after-read consumes the note exactly once.
6. A later recipient consume returns the burned lifecycle response.
7. A proof acknowledgement is accepted once and the owner receipt reports one verified open.
8. A private encrypted-file lease streams ciphertext once without returning a Storage path; lease replay fails.
9. A Guardian Wipe verifier can revoke its test note.
10. A draft room can be created and sealed.
11. Remote wipe destroys an active paste.

A passing run provides meaningful reliability evidence because it exercises the same Vercel routing, environment configuration, API functions, and Supabase persistence used in the live evaluator demo.

## Automated quality gates

The repository defines two workflows under `.github/workflows/`.

| Workflow | Trigger | Evidence enforced |
| --- | --- | --- |
| `Quality gate` | Pull requests and pushes to `main` | TypeScript, unit/integration tests, production build, JavaScript bundle budget, production dependency audit, Chromium accessibility audit, keyboard-flow test, and failure artifacts. |
| `Production smoke` | Daily schedule and manual dispatch | Real deployed zero-knowledge lifecycle smoke test plus static CSP/header verification against the public Vercel URL. |

The browser suite waits for intentional entrance animations to settle, then fails if axe reports a serious or critical issue on `/`, `/login`, or `/how-it-works`. It also verifies command-palette Escape behavior and the visible-on-focus skip link. The API observability test verifies generated or accepted request IDs, `Server-Timing`, and safe readiness data.

## Manual acceptance checklist

| Scenario | Expected outcome |
| --- | --- |
| New text note | Link opens and decrypts in a separate browser context. |
| Passphrase-protected note | User must supply the correct passphrase before plaintext is shown. |
| Burn-after-read note | First recipient read works; refresh or repeat read does not. |
| Expiring note | Expired state is shown when the deadline is reached. |
| Remote withdrawal | Sender can invalidate a non-burned active link with the owner capability. |
| Encrypted file note | File is retrieved through a 60-second one-use API lease, has no public storage path, and is decrypted only in the recipient browser. |
| Verified delivery receipt | Owner sees a verified-open acknowledgement only after the recipient browser decrypts the envelope proof; guessed/replayed proof requests do not change it. |
| Guardian Wipe | Create 2-of-3 cards, confirm a single card fails, then paste two cards into `/guardian-wipe`; the note becomes unavailable while no card reveals a decryption key. |
| GitHub sign-in | User returns from Supabase Auth to `/auth/callback` and reaches the requested same-origin private route. |
| Protected route | Visiting `/dashboard` or `/profile` without a Supabase session redirects to `/login` without showing a demo identity. |
| Account bio | An authenticated user can save an optional ≤160-character bio and see it after refresh. |
| Private contact | An authenticated user can add/remove a GitHub username; it is private to that account and grants no secret access. |
| Collaboration draft | Users can enter the pre-seal draft workflow; sealed output becomes a Lock Note envelope. |
| Direct deep link | Refreshing `/paste/:id` or `/auth/callback` returns the single-page app rather than a host-level 404. |

## Current validated production evidence

The production hardening release was validated with the following results:

| Check | Result |
| --- | --- |
| TypeScript validation | Passed. |
| Automated test suite for this release | **88 tests passed**: 30 server lifecycle/schema/API tests and 58 browser crypto/encoding/Guardian Wipe tests. The suite includes proof replay, private file-lease one-use/expiry/atomic-burn behavior, fixed crypto-policy validation, Guardian quorum/tamper cases, owner control, lifecycle, and draft regressions. |
| Production build | Passed. |
| Production dependency audit | 0 high-severity production vulnerabilities found. |
| Prior production deployment | READY for the preceding RLS hardening release. The verified-delivery/Guardian Wipe release remains pending migration, deployment, and live smoke at the time of this document update. |
| Live lifecycle smoke test | Passed after Supabase RLS hardening. |
| GitHub OAuth flow | Verified through the production callback and dashboard redirect. |
| Post-deployment security review | HTTPS, HSTS, API hardening, CORS behavior, source-map access, sensitive-path fallback, and dependency checks passed within scoped automation. |
| Accessibility regression suite | Passed: axe reported no serious or critical violations on public routes; command palette and skip-link keyboard checks passed. |
| Bundle budget | Passed: largest emitted JavaScript chunk was 736.7 KiB against an 850 KiB budget. |
| CI and smoke workflows | Added: pull-request/main quality gate plus a scheduled/manual production lifecycle and static-header smoke workflow. |

## Demo recording evidence

The user-recorded video should show a keyboard-only skip-link and command-palette interaction, a normal encrypted note, pre-share fingerprint comparison, a verified receipt after successful recipient open, a private file lease/download, and a 2-of-3 Guardian Wipe. The full spoken sequence is in [DEMO.md](DEMO.md#recording-checklist). Replace the README video placeholder only after uploading the final recording.

## Troubleshooting a failed check

| Failure | Likely cause | Corrective action |
| --- | --- | --- |
| `store` is `memory` or health is unhealthy | Missing/invalid Vercel Supabase server variables. | Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy. |
| GitHub OAuth returns to localhost | Supabase Site URL or allow-list is stale. | Set the production Site URL and add the deployed `/auth/callback` URL. |
| Nested paste URL returns Vercel 404 | API catch-all rewrite is missing. | Verify `vercel.json` routes `/api/:path*` to the Express function. |
| File upload/read fails | Supabase Storage, migration `005`, or service-role configuration is incomplete. | Apply migration `005_verified_delivery_and_guardian_wipe.sql`, confirm the `secrets` bucket is private, and check server-only key settings. |
| File lease expired | A recipient waited more than 60 seconds or retried after a completed download. | Re-open the still-active note to obtain a fresh lease; do not expose a persistent object URL. |
| Guardian Wipe rejects cards | The cards are insufficient, duplicated, altered, or from different notes/share sets. | Use the exact number of original cards for one note; never hand-edit the encoded `LNGW1` share string. |
| Live smoke cannot reach API | Wrong `API_URL` or deployment not ready. | Use the Vercel production URL and wait for `READY`. |

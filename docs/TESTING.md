# Lock Note Testing and Reliability Guide

## Testing objective

Lock Note is evaluated as a privacy-sensitive lifecycle system, not only a visual interface. The verification strategy therefore checks cryptographic integrity, API state transitions, production configuration, and the deployed end-to-end workflow.

| Test layer | Primary concern | Tooling | Command |
| --- | --- | --- | --- |
| Client unit tests | Browser encryption/decryption and UI utilities | Vitest + jsdom | `npm run test -w client` |
| Server integration tests | Request validation, lifecycle logic, rate limits, and store contracts | Vitest + Supertest | `npm run test -w server` |
| Type checking | Type safety across React, Express, and Vercel entry points | TypeScript | `npm run typecheck` |
| Production build | Vite client and server artifact generation | npm workspaces | `npm run build` |
| Live lifecycle smoke test | Real deployed API and Supabase behavior | Node/TypeScript smoke script | `API_URL=... npm run test:live` |
| Optional browser E2E | Browser-level compose, share, read, and burn journey | Playwright | `npm run test:e2e` |

## What is verified

### Client cryptography

| Behavior | Expected result |
| --- | --- |
| Encrypt then decrypt a note | Original plaintext is recovered only with the correct derived key. |
| Tamper with ciphertext | Authenticated decryption fails. |
| Change bound paste identifier | AES-GCM additional authenticated data check fails. |
| Use a wrong passphrase | Decryption fails without recording an accidental recipient consume. |
| Generate a seal fingerprint | The visible fingerprint is deterministic for the same encrypted envelope metadata. |

### API lifecycle and authorization

| Behavior | Expected result |
| --- | --- |
| Create an encrypted paste | API returns a valid paste identifier and owner capability. |
| Read public metadata | API returns safe metadata without exposing an owner capability or plaintext. |
| Owner preview | Sender can inspect a note without consuming a burn-after-read note. |
| Recipient burn consume | First eligible consume succeeds; a later consume returns the burned state. |
| Remote wipe | Owner capability removes an active paste and future reads are unavailable. |
| Receipt retrieval | Owner sees lifecycle metadata without revealing plaintext. |
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
7. Receipt metadata records the expected view behavior.
8. A draft room can be created and sealed.
9. Remote wipe destroys an active paste.

A passing run provides meaningful reliability evidence because it exercises the same Vercel routing, environment configuration, API functions, and Supabase persistence used in the live evaluator demo.

## Manual acceptance checklist

| Scenario | Expected outcome |
| --- | --- |
| New text note | Link opens and decrypts in a separate browser context. |
| Passphrase-protected note | User must supply the correct passphrase before plaintext is shown. |
| Burn-after-read note | First recipient read works; refresh or repeat read does not. |
| Expiring note | Expired state is shown when the deadline is reached. |
| Remote withdrawal | Sender can invalidate a non-burned active link with the owner capability. |
| Encrypted file note | File is retrieved as ciphertext and decrypted only in the recipient browser. |
| GitHub sign-in | User returns from Supabase Auth to `/auth/callback` and reaches `/dashboard`. |
| Collaboration draft | Users can enter the pre-seal draft workflow; sealed output becomes a Lock Note envelope. |
| Direct deep link | Refreshing `/paste/:id` or `/auth/callback` returns the single-page app rather than a host-level 404. |

## Current validated production evidence

The production hardening release was validated with the following results:

| Check | Result |
| --- | --- |
| TypeScript validation | Passed. |
| Automated test suite | 51 tests passed. |
| Production build | Passed. |
| Production dependency audit | 0 high-severity production vulnerabilities found. |
| Vercel production deployment | READY. |
| Live lifecycle smoke test | Passed after Supabase RLS hardening. |
| GitHub OAuth flow | Verified through the production callback and dashboard redirect. |
| Post-deployment security review | HTTPS, HSTS, API hardening, CORS behavior, source-map access, sensitive-path fallback, and dependency checks passed within scoped automation. |

## Troubleshooting a failed check

| Failure | Likely cause | Corrective action |
| --- | --- | --- |
| `store` is `memory` or health is unhealthy | Missing/invalid Vercel Supabase server variables. | Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy. |
| GitHub OAuth returns to localhost | Supabase Site URL or allow-list is stale. | Set the production Site URL and add the deployed `/auth/callback` URL. |
| Nested paste URL returns Vercel 404 | API catch-all rewrite is missing. | Verify `vercel.json` routes `/api/:path*` to the Express function. |
| File upload/read fails | Supabase Storage or service-role configuration is incomplete. | Run the SQL bootstrap/hardening migrations and check server-only key settings. |
| Live smoke cannot reach API | Wrong `API_URL` or deployment not ready. | Use the Vercel production URL and wait for `READY`. |

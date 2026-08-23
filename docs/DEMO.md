# Lock Note Demo Guide

This guide provides a repeatable **three-to-five-minute evaluator walkthrough**. It prioritizes visible behavior and explains the technical decisions only where they help a reviewer understand the result.

## Before the demo

Use the deployed app at <https://lock-note-sigma.vercel.app/>. Keep a second browser profile, incognito window, or separate device ready to represent the recipient. Do not use real passwords, private files, or a reusable passphrase during a demonstration.

| Pre-demo check | Expected result |
| --- | --- |
| Open `https://lock-note-sigma.vercel.app/api/health` | JSON response reports `ok: true` and `store: "supabase"`. |
| Open the live application | Compose page renders with no configuration error. |
| Prepare recipient browser context | It is not authenticated as the owner and has no existing Lock Note local storage. |
| Optional: prepare test file | Use a non-sensitive text file for encrypted-file demonstration. |

## Recommended walkthrough

### 1. Frame the problem — 20 seconds

> “Lock Note is for sharing sensitive information that should not become a permanent database record. It encrypts the content inside the browser and only stores the encrypted envelope on the server.”

Point to the composer and the privacy-oriented interface. Explain that the intended use cases are temporary credentials, personal messages, code snippets, and files.

### 2. Seal, fingerprint, and share a note — 55 seconds

Enter a short test note, select **burn after reading**, and seal it. Show the generated link, the lifecycle badge, the seal fingerprint, and the QR code.

> “The decryption material is placed after the `#` in the URL. Browsers do not send URL fragments to the server in normal HTTP requests, so the backend gets ciphertext and delivery metadata but not the decryption key.”

Explain that the **copyable link, native share option, and QR code are three ways to transfer the same full private URL**. The QR code is convenient for opening the link on another device, but it is sensitive because it encodes the entire delivery link. Use the seal fingerprint as a compact out-of-band verification cue.

For a visual reference, see the sealed delivery screenshot in [FEATURES.md](FEATURES.md#sealed-delivery-qr-handoff-and-sender-controls).

### 3. Recipient read and burn lifecycle — 45 seconds

Open the link in the recipient browser context. Decrypt and view the note. Return to or reload the recipient link to show that a burn-after-read note is no longer available.

> “The server manages the one-time delivery state, but the plaintext appears only after browser-side decryption.”

This demonstrates the core functionality, lifecycle logic, and security model together.

### 4. Sender control — 30 seconds

Create a second note without burn-after-read. Use the owner controls to show preview, a receipt/view count, and remote withdrawal. After remote withdrawal, refresh the recipient route or explain that future reads are prevented.

> “Lock Note gives the sender lifecycle control after sharing: preview without burning, observe receipt metadata, and withdraw an active note.”

### 5. Meaningful differentiation — 35 seconds

Create a passphrase-protected note or attach a small non-sensitive file.

> “Beyond a standard one-time paste, Lock Note supports an extra passphrase channel, encrypted files, time expiry, inactivity-based dead switches, owner withdrawal, and a documented pre-seal collaboration mode.”

If time allows, show the collaboration entry point and say clearly that drafts are a temporary pre-seal workspace rather than end-to-end encrypted co-editing.

### 6. GitHub identity, private account profile, and browser-local vault — 40 seconds

Select **Continue with GitHub**, complete sign-in if necessary, and open the profile/dashboard.

> “GitHub authentication is handled through Supabase Auth. The profile shows the verified provider identity, avatar, username, and email. The optional bio and private contact shortcuts are stored in owner-only Supabase rows, while the vault manages capability-bearing links created in this browser.”

Point out the editable research bio, the View Vault action, the sealed/active link statistics, and the contacts interface. Explain the privacy boundary: the dashboard is not a server-side plaintext note archive; contacts do not grant a user decryption access; and the profile/contact tables never contain note content, share URLs, URL fragments, owner tokens, passphrases, or keys.

For a visual reference, see the GitHub-authenticated profile screenshot in [FEATURES.md](FEATURES.md#github-authenticated-personal-profile-and-vault).

### 7. Reliability evidence — 30 seconds

Show the health endpoint or run the live smoke test:

```bash
API_URL=https://lock-note-sigma.vercel.app npm run test:live
```

The expected passing output covers health, note creation, safe metadata, owner preview, burn-after-read, receipts, draft sealing, and remote wipe. Point out the `version`, `X-Request-ID`, and `Server-Timing` fields as safe operational evidence.

> “This is not a visual-only demo. The repository includes type checks, build validation, unit/integration tests, an automated axe/keyboard suite, a JavaScript bundle budget, pull-request CI, static security-header verification, and a live lifecycle test against the deployed Supabase-backed API.”

## Evaluation talking points

| Criterion | One-sentence evidence statement |
| --- | --- |
| Problem and functionality | “It solves temporary sensitive sharing with browser-side encryption, one-time delivery, expiry, and sender withdrawal.” |
| Innovation | “It combines fragment-keyed decryption, authenticated encryption, encrypted files, dead switches, seal fingerprints, and pre-seal collaboration.” |
| Architecture | “React/Vite performs cryptography in-browser; an Express API manages lifecycle state and redacted telemetry; Supabase stores encrypted records plus owner-only account metadata; Vercel hosts the deployed system with a static CSP.” |
| UX and accessibility | “The app uses clear workflow states, session-aware private routes, keyboard-accessible controls, a skip link, theme support, actionable errors, and automated axe checks.” |
| Reliability | “A versioned readiness endpoint, request IDs, safe timing, rate limits, protected maintenance, test suites, CI, bundle budgets, static-header checks, and live production smoke make the demo repeatable.” |
| Documentation | “The README is supported by dedicated evaluation, feature, demo, architecture, security, API, testing, environment, and deployment documents.” |
| Personalized product proof | “The GitHub-authenticated private profile, owner-only contact shortcuts, browser-local capability vault, QR delivery card, and seal fingerprint make the secure-sharing journey visible to reviewers.” |

## Troubleshooting during a demo

| Symptom | Check | Recovery |
| --- | --- | --- |
| App reports backend unavailable | Open `/api/health`. | Confirm Supabase Vercel variables are present and the endpoint reports `store: "supabase"`. |
| GitHub sign-in returns to the wrong page | Check Supabase Auth URL Configuration. | Ensure the production Site URL and `/auth/callback` redirect are configured. |
| A note cannot be opened | Confirm the full share link includes its fragment. | Copy the original full URL again; do not remove the `#...` portion. |
| Burn note is unavailable | This is expected after one non-owner successful consume. | Create a new note for the next demonstration. |
| Demo uses stale deployment | Check the Vercel production alias. | Redeploy the current `main` branch and wait for the READY state. |

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

### 2. Seal and share a note — 45 seconds

Enter a short test note, select **burn after reading**, and seal it. Show the generated link.

> “The decryption material is placed after the `#` in the URL. Browsers do not send URL fragments to the server in normal HTTP requests, so the backend gets ciphertext and delivery metadata but not the decryption key.”

Show the share link without exposing a real secret. If available, show the seal fingerprint and explain that it is a human-friendly verification aid.

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

### 6. Authentication and personal library — 25 seconds

Select **Continue with GitHub**, complete sign-in if necessary, and show the dashboard.

> “GitHub authentication is handled through Supabase Auth. The dashboard helps the sender keep track of the links created in this browser, receipts, and withdrawal controls.”

### 7. Reliability evidence — 30 seconds

Show the health endpoint or run the live smoke test:

```bash
API_URL=https://lock-note-sigma.vercel.app npm run test:live
```

The expected passing output covers health, note creation, safe metadata, owner preview, burn-after-read, receipts, draft sealing, and remote wipe.

> “This is not a visual-only demo. The repository includes type checks, build validation, unit/integration tests, and a live lifecycle test against the deployed Supabase-backed API.”

## Evaluation talking points

| Criterion | One-sentence evidence statement |
| --- | --- |
| Problem and functionality | “It solves temporary sensitive sharing with browser-side encryption, one-time delivery, expiry, and sender withdrawal.” |
| Innovation | “It combines fragment-keyed decryption, authenticated encryption, encrypted files, dead switches, seal fingerprints, and pre-seal collaboration.” |
| Architecture | “React/Vite performs cryptography in-browser; an Express API manages lifecycle state; Supabase stores encrypted records; Vercel hosts the deployed system.” |
| UX and accessibility | “The app uses clear workflow states, keyboard-accessible controls, theme support, actionable errors, and a focused compose-to-share journey.” |
| Reliability | “A real readiness endpoint, rate limits, protected maintenance, test suites, and a live production smoke test make the demo repeatable.” |
| Documentation | “The README is supported by dedicated evaluation, architecture, security, API, testing, environment, and deployment documents.” |

## Troubleshooting during a demo

| Symptom | Check | Recovery |
| --- | --- | --- |
| App reports backend unavailable | Open `/api/health`. | Confirm Supabase Vercel variables are present and the endpoint reports `store: "supabase"`. |
| GitHub sign-in returns to the wrong page | Check Supabase Auth URL Configuration. | Ensure the production Site URL and `/auth/callback` redirect are configured. |
| A note cannot be opened | Confirm the full share link includes its fragment. | Copy the original full URL again; do not remove the `#...` portion. |
| Burn note is unavailable | This is expected after one non-owner successful consume. | Create a new note for the next demonstration. |
| Demo uses stale deployment | Check the Vercel production alias. | Redeploy the current `main` branch and wait for the READY state. |

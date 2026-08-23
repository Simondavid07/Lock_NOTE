# Lock Note Evaluation Guide

## Project summary

**Lock Note** is a zero-knowledge, self-destructing note-sharing application for sending time-limited sensitive information. Its core promise is simple: plaintext and decryption keys remain in the sender’s and recipient’s browsers, while the backend stores only encrypted envelopes and non-secret delivery metadata.

The project is designed as a complete deployed system rather than a prototype. It combines a React client, a TypeScript/Express API, Supabase for persistence, auth, storage, and realtime collaboration, and Vercel for the live deployment and maintenance schedule.

| Evaluation area | Evidence in this repository |
| --- | --- |
| Problem Understanding & Core Functionality | This document, [README](../README.md), [API reference](API.md), and the live lifecycle smoke test. |
| Innovation & Meaningful Differentiation | [Comparison guide](COMPARISON.md), seal fingerprints, encrypted files, dead switches, and encrypted-note lifecycle controls. |
| Technical Implementation & Architecture | [Architecture guide](ARCHITECTURE.md), [Security model](SECURITY.md), source structure, tests, and Supabase migrations. |
| User Experience & Accessibility | README screenshots, session-aware protected routes, keyboard command palette, skip link, theme support, clear error states, semantic controls, responsive workflows, and automated axe checks. |
| Performance & Reliability / Demo Quality | [Testing guide](TESTING.md), live smoke test, health/version endpoint, request IDs, bundle budget, static-header checks, rate limiting, protected maintenance, CI, and Vercel deployment. |
| Documentation & Explanation | README, this guide, environment template, API, architecture, testing, security, and deployment instructions. |

## 1. Problem Understanding & Core Functionality — 20 marks

### The problem

Sensitive information is often shared through channels that are permanent, easily forwarded, and difficult for the sender to revoke. Common use cases include temporary credentials, personal notes, recovery details, confidential code snippets, and files that should disappear after a recipient opens them.

Lock Note addresses this by separating **encrypted storage** from **decryption capability**. The recipient receives a share link whose fragment contains the key material; the fragment is not sent in normal HTTP requests. The API receives and persists ciphertext, not the key that decrypts it.

### Core workflow

| User journey | What the application does | Verification evidence |
| --- | --- | --- |
| Seal a note | Encrypts the selected text or file in the browser and creates an encrypted envelope. | `POST /api/pastes`; unit and live smoke tests. |
| Share safely | Generates a fragment-keyed URL and copyable share controls. | Browser crypto module and README security model. |
| Read a note | Fetches ciphertext, derives the key in-browser, and decrypts locally. | Client crypto tests and read workflow. |
| Burn after read | Allows exactly one successful non-owner read, then permanently returns a burned state. | Server lifecycle tests and live smoke test. |
| Expire or withdraw | Supports deadline expiry, inactivity-based deletion, and sender-controlled remote wipe. | Lifecycle endpoints, maintenance function, and live smoke test. |
| Recover sender control | Provides owner preview, delivery receipts, and withdrawal through an owner capability token. | API reference and tests. |
| Work with files and drafts | Encrypts files before storage and supports short-lived collaboration drafts before sealing. | Supabase Storage, Realtime, migrations, and smoke test. |

> **Core design choice:** Lock Note is not merely a database-backed pastebin. It treats the API as an encrypted-envelope lifecycle service and keeps key material outside the backend boundary.

## 2. Innovation & Meaningful Differentiation — 20 marks

Lock Note builds on the familiar one-time-secret concept but adds sender control, modern browser cryptography, file handling, and collaboration-oriented workflows.

| Differentiator | Why it is meaningful |
| --- | --- |
| Zero-knowledge envelope model | The server stores ciphertext and delivery metadata only; decryption keys live in share URL fragments. |
| Context-bound encryption | AES-GCM additional authenticated data binds the payload to the paste identifier and protocol version, detecting envelope substitution. |
| Passphrase-protected shares | An optional second secret gives senders an additional distribution channel beyond the URL. |
| Dead-switch lifecycle | A note can self-delete after a configured period of visitor inactivity, not only a fixed deadline. |
| Encrypted file envelopes | Files are encrypted in the browser and stored separately as ciphertext blobs. |
| Seal fingerprints | Four-word mnemonic and color-glyph fingerprints provide a human-verifiable out-of-band authenticity signal. |
| QR-assisted delivery | The sealed link can be rendered as a QR code for deliberate cross-device transfer without changing the encrypted-envelope model. |
| GitHub-authenticated identity | Supabase Auth returns the user to the app with a provider identity, avatar, username, and email visible in a personalized profile. |
| Browser-local personal vault | A sender can manage browser-tracked links, active state, receipts, and withdrawal controls without a backend plaintext library. |
| Private account continuity | Optional profile metadata and private contact usernames persist across refreshes through owner-only Supabase RLS while capability-bearing paste links remain browser-local. |
| Realtime pre-seal drafting | Supabase Realtime enables presence and collaborative drafting before the final content is sealed into an encrypted note. |
| Owner-oriented controls | Preview, receipts, withdrawal, and lifecycle controls make sender agency visible rather than hidden. |

The comparison with a traditional pastebin is documented in [COMPARISON.md](COMPARISON.md). The important distinction is not visual styling alone; it is the combination of browser-side encryption, recipient-aware lifecycle behavior, and sender-controlled revocation.

## 3. Technical Implementation & Architecture — 15 marks

| Layer | Implementation | Responsibility |
| --- | --- | --- |
| Client | React 19, TypeScript, Vite, Tailwind, Motion | Encryption/decryption, editor UX, authenticated library, share links, and realtime collaboration. |
| Cryptography | Web Crypto API | AES-256-GCM encryption, PBKDF2/HKDF key derivation, IV and salt handling, and integrity checks. |
| API | Express 5, Zod, Helmet, rate limits | Schema validation, lifecycle state transitions, owner capability checks, receipts, controlled deletion, request IDs, safe timing, and structured redacted operational logs. |
| Persistence | Supabase Postgres, Storage, Auth, Realtime | Ciphertext records, encrypted file objects, provider-backed GitHub sign-in, ephemeral collaboration signals, and owner-only profile/contact metadata. |
| Hosting | Vercel serverless functions and static delivery | Vite build hosting, nested API routing, enforced static CSP/security headers, production environment isolation, and scheduled cleanup. |

The architecture deliberately uses a **store interface** so local development can use a memory implementation, while production initializes only with a valid Supabase configuration. Production does not silently substitute ephemeral memory for persistent storage.

Additional technical evidence is available in [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [API.md](API.md), and [`docs/sql`](sql/).

## 4. User Experience & Accessibility — 15 marks

The interface uses a private-correspondence visual system to make sensitive sharing feel deliberate rather than transactional. It supports both light and dark themes and focuses the user journey around one clear action: seal, share, and manage a note.

| UX or accessibility concern | Implementation approach |
| --- | --- |
| Clear status and recovery | The application shows actionable configuration and authentication errors instead of falling back silently. |
| Keyboard efficiency | A command palette is available through `⌘K` / `Ctrl+K`; standard controls remain reachable by keyboard. |
| Color independence | State is communicated through labels, status text, and controls in addition to color. |
| Readability | Structured headings, concise helper text, and high-contrast controls guide high-stakes actions. |
| Responsive usage | The React layout supports compose, open, and library workflows across modern browser viewport sizes. |
| Accessible controls | Native buttons, links, inputs, labels, form feedback, and meaningful alternative text are used throughout the main flows. |
| Privacy clarity | The interface distinguishes encrypted notes from collaboration drafts, which are intentionally pre-seal workspaces. |
| Personalized continuity | GitHub-authenticated users see provider identity, an opt-in RLS-backed bio, a browser-local capability-vault summary, and private account-scoped contact shortcuts. |
| Measurable accessibility | The browser test suite fails on serious/critical axe findings across public routes and checks command-palette Escape behavior plus the skip link. |
| Cross-device handoff | A labeled QR code, copyable full link, native sharing where supported, and a human-verifiable fingerprint make secure delivery understandable. |

For visual evidence, see the composer, GitHub-authenticated profile, browser-local vault, and QR delivery screenshots in the [README](../README.md) and the detailed [Feature Guide](FEATURES.md).

## 5. Performance, Reliability & Demo Quality — 20 marks

Lock Note is designed for demonstrable reliability. The project includes automated checks at multiple levels and exposes a production readiness endpoint rather than relying on a successful deployment alone.

| Reliability control | Evidence |
| --- | --- |
| Type safety | `npm run typecheck` validates client, server, and Vercel function TypeScript entry points. |
| Build validation | `npm run build` produces the Vite client and server artifacts. |
| Unit and integration coverage | `npm run test` covers crypto integrity, schema validation, rate limiting, lifecycle transitions, and API behavior. |
| Accessibility and keyboard workspace | `npm run test:accessibility` serves the built client, fails on serious/critical axe findings, and verifies command-palette/skip-link keyboard behavior. |
| Bundle budget | `npm run test:bundle` fails when the largest emitted JavaScript chunk exceeds the documented 850 KiB threshold. |
| Live lifecycle test | `API_URL=https://lock-note-sigma.vercel.app npm run test:live` exercises production health, create, metadata, preview, burn, receipts, drafts, and remote wipe. |
| Honest readiness and telemetry | `GET /api/health` reports the active store/build version; API responses provide request IDs and safe timing without recording sensitive request data. |
| Static delivery hardening | The Vercel static policy enforces CSP, Permissions Policy, `nosniff`, referrer, opener, and resource policies; a live header script verifies their presence. |
| CI and scheduled verification | GitHub Actions enforces pull-request/main quality gates and performs a daily/manual public lifecycle and header smoke check. |
| API resilience | Input validation, size limits, rate limiting, no-store API caching, safe CORS defaults, and controlled failure responses reduce operational risk. |
| Scheduled reconciliation | A protected daily Vercel maintenance endpoint cleans expired content, stale drafts, and orphaned encrypted files. |

### Recommended evaluator demo sequence

1. Open the live application and create a short note.
2. Show the generated share URL and explain that the key is after `#`.
3. Open the link in a separate browser profile and decrypt it.
4. Repeat with burn-after-read enabled, then show that the second read is unavailable.
5. Show owner preview, receipt, and remote withdrawal controls.
6. Show the seal fingerprint and QR code; explain that both represent the same sensitive full link and should be shared only with the intended recipient.
7. Demonstrate a passphrase-protected note or encrypted file attachment.
8. Sign in with GitHub and show the protected profile, optional account bio, private contact shortcuts, and browser-local capability vault; explain the RLS and zero-knowledge boundary.
9. Explain that collaboration occurs before sealing and is intentionally documented as a different trust boundary.
10. Run or show the passing live smoke command.

A concise evaluator script is included in [DEMO.md](DEMO.md).

## 6. Documentation & Explanation — 10 marks

The repository is structured so a reviewer can understand the project before running it:

| Document | Purpose |
| --- | --- |
| [README](../README.md) | Project overview, setup, deployment, security boundary, commands, and documentation map. |
| [DEMO.md](DEMO.md) | Evaluator-facing three-to-five-minute walkthrough and verification steps. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System boundaries, encryption flow, storage model, and operational lifecycle. |
| [SECURITY.md](SECURITY.md) | Threat model, mitigations, trust boundaries, and security limitations. |
| [API.md](API.md) | Endpoint contracts and lifecycle operations. |
| [TESTING.md](TESTING.md) | Test strategy and release verification commands. |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Safe configuration guidance and secret-handling rules. |
| [FEATURES.md](FEATURES.md) | Visual product tour of GitHub identity, owner-only profile/contact metadata, browser-local capability vault management, QR delivery, fingerprints, and sender controls. |
| [`sql/003_profiles_and_contacts.sql`](sql/003_profiles_and_contacts.sql) | Idempotent profile/contact schema with strict owner-only row-level security and an explicit no-secrets data contract. |
| [`sql/004_revoke_rls_trigger_execute.sql`](sql/004_revoke_rls_trigger_execute.sql) | Least-privilege remediation that removes exposed caller execution of the SECURITY DEFINER RLS event-trigger helper. |
| [COMPARISON.md](COMPARISON.md) | Meaningful differentiation from classic pastebin workflows. |

> Reviewers should use `.env.example` or `.env.submission.template` as a copyable configuration map. Real service-role keys and OAuth secrets are intentionally excluded from Git history and submission archives.

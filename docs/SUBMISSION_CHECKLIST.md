# Lock Note Submission Checklist

Use this checklist immediately before sending the GitHub repository and any private environment configuration to an evaluator.

## Repository presentation

| Check | Complete when… |
| --- | --- |
| Repository opens cleanly | The default branch is `main` and has no uncommitted local changes. |
| README is reviewer-friendly | It shows the live URL, screenshots, feature summary, setup, deployment, evaluation map, and documentation links. |
| Evaluation evidence is visible | `docs/EVALUATION.md` and `docs/DEMO.md` are linked from the README. |
| Documentation is navigable | `docs/README.md` links to evaluation, architecture, security, API, testing, environment, and comparison documents. |
| Optional video is ready | Replace the README placeholder with the final demo video link if one is required. |
| License is visible | `LICENSE` remains in the repository root. |

## Evaluation criteria

| Criterion | Submission evidence |
| --- | --- |
| Problem Understanding & Core Functionality | `README.md`, `docs/EVALUATION.md`, live compose/share/read workflow. |
| Innovation & Meaningful Differentiation | `docs/COMPARISON.md`, seal fingerprints, passphrase gate, encrypted files, dead switch, and sender controls. |
| Technical Implementation & Architecture | `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, API/store source, Vercel functions, static CSP, and owner-only SQL migrations. |
| User Experience & Accessibility | README screenshots, theme support, session-aware protected routes, keyboard command palette, skip link, semantic controls, clear state messages, and axe evidence. |
| Performance & Reliability / Demo Quality | `docs/TESTING.md`, live smoke command, health/version endpoint, request IDs, timing, static-header check, bundle budget, CI, protected maintenance, and Vercel deployment. |
| Documentation & Explanation | README plus the documentation index and all linked guides. |

## Quality gates

Run from the repository root:

```bash
npm ci
npm run typecheck
npm run build
npm run test
npm run test:bundle
npm run test:accessibility
npm audit --omit=dev --audit-level=high
API_URL=https://lock-note-sigma.vercel.app npm run test:live
npm run test:headers
```

| Deployment check | Expected result |
| --- | --- |
| `https://lock-note-sigma.vercel.app/` | Live app opens successfully. |
| `https://lock-note-sigma.vercel.app/api/health` | `ok: true`, `store: "supabase"`, and a safe `version` value. |
| GitHub sign-in | Returns through `/auth/callback` to the requested same-origin private route. |
| Private profile data | `003_profiles_and_contacts.sql` is applied; bio/contact operations work for the authenticated owner only. |
| Header policy | Production root response includes CSP, Permissions Policy, `nosniff`, COOP, CORP, and referrer policy. |
| CI evidence | The `Quality gate` workflow is green; `Production smoke` is available for daily/manual verification. |
| Deep link refresh | `/paste/:id` and `/auth/callback` do not become Vercel 404 pages. |

## Environment and secret safety

| Rule | Required action |
| --- | --- |
| Never publish real server credentials | Do not commit `.env`; use `.env.example` and `.env.submission.template` only. |
| Secure evaluator handoff | If the evaluator requires actual runtime credentials, send the completed `.env` by the approved private submission channel, not through GitHub. |
| Server-role secret | Keep `SUPABASE_SERVICE_ROLE_KEY` in Vercel and a private local `.env` only. |
| Browser build values | Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optional `VITE_API_BASE` may have the `VITE_` prefix. |
| GitHub OAuth secret | Configure it in Supabase Auth provider settings; do not add it to the repository environment files. |
| Daily maintenance secret | Generate/set `CRON_SECRET` in Vercel; do not publish it. |

## Evaluator handoff package

Provide the following:

1. GitHub repository URL: <https://github.com/Simondavid07/Lock_NOTE>
2. Live app URL: <https://lock-note-sigma.vercel.app/>
3. Optional demonstration video URL, if the evaluation format requires it.
4. Private `.env` only if the evaluator explicitly requires a runnable local deployment; start from `.env.submission.template`.
5. This repository checklist and [DEMO.md](DEMO.md) for the evaluation walkthrough.

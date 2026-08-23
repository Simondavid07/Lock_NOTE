# Lock Note Documentation Index

This directory contains the project documentation used for implementation, deployment, evaluation, and demonstration.

| Document | Read this when you need to… |
| --- | --- |
| [EVALUATION.md](EVALUATION.md) | Review the project against the six assessment criteria. |
| [DEMO.md](DEMO.md) | Present a consistent three-to-five-minute evaluator demonstration. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Understand browser encryption, API boundaries, Supabase, Vercel, and lifecycle design. |
| [SECURITY.md](SECURITY.md) | Review the cryptographic trust model, mitigations, and residual risks. |
| [API.md](API.md) | Inspect endpoint contracts and lifecycle operations. |
| [TESTING.md](TESTING.md) | Run local, build, automated, live smoke, and manual verification checks. |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Configure local development, Vercel, Supabase, GitHub OAuth, and a private submission environment file. |
| [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) | Verify repository presentation, quality gates, deployment access, and secret-safe evaluator handoff. |
| [COMPARISON.md](COMPARISON.md) | See the project’s meaningful differentiation from a classic pastebin workflow. |
| [FEATURES.md](FEATURES.md) | Take a visual tour of GitHub identity, browser-local vault management, QR delivery, fingerprints, and sender controls. |
| [sql/001_init.sql](sql/001_init.sql) | Bootstrap a new Supabase project. |
| [sql/002_harden_drafts_rls.sql](sql/002_harden_drafts_rls.sql) | Apply draft access hardening to an existing Lock Note installation. |

## Suggested evaluation reading order

1. Start with the repository [README](../README.md).
2. Review [EVALUATION.md](EVALUATION.md) for the rubric mapping.
3. Use [DEMO.md](DEMO.md) while viewing the live app.
4. Read [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md) for implementation depth.
5. Use [TESTING.md](TESTING.md) and [ENVIRONMENT.md](ENVIRONMENT.md) to reproduce checks safely.

> The environment templates are located at the repository root: [`.env.example`](../.env.example) and [`.env.submission.template`](../.env.submission.template). They contain variable names and safe placeholders only; production secrets are intentionally excluded from version control.

# Production smoke check

The `Production smoke` GitHub Actions workflow (`.github/workflows/production-smoke.yml`)
runs daily at 10:47 IST (05:17 UTC) against the live deployment at
https://lock-note-sigma.vercel.app. It verifies the zero-knowledge note
lifecycle end to end (`npm run test:live`) and checks the static security
headers (`npm run test:headers`).

GitHub automatically disables scheduled workflows in repositories with no
activity for 60 days. Ordinary commits to this repository keep the schedule
armed; if the workflow is ever disabled, re-enable it from the repository's
Actions tab.

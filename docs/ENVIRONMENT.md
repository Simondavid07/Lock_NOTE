# Lock Note Environment Configuration

This document explains how to configure Lock Note locally and on Vercel without exposing secrets. It accompanies [`.env.example`](../.env.example) and [`.env.submission.template`](../.env.submission.template).

> **Never commit a populated `.env` file to GitHub.** The `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are private production credentials. Rotate them immediately if they are ever pasted into a public repository, report, or chat.

## Configuration map

| Variable | Required | Where it is used | Visibility | How to obtain it |
| --- | --- | --- | --- | --- |
| `SUPABASE_URL` | Yes | Server and Vercel functions | Server only | Supabase project **Connect** or **API** settings; it looks like `https://PROJECT_REF.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side database, storage, cleanup, and audit operations | **Secret** | Supabase project API settings. Use only server-side or Vercel environment settings. |
| `VITE_SUPABASE_URL` | Yes | Vite browser build | Public build value | Same URL as `SUPABASE_URL`. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Vite browser build and Supabase Auth client | Public build value | Supabase project Connect/API settings. This is a browser publishable/anon key, not the service-role key. |
| `VITE_API_BASE` | No | Browser API client | Public build value | Leave blank for the single Vercel deployment. Set only if the API uses another origin. |
| `CORS_ORIGINS` | No | Express API CORS policy | Server only | `http://localhost:5173` locally; a comma-separated list only when a separate frontend origin calls the API. |
| `PORT` | No | Local Express development server | Local only | Use `3001` unless another local service is using that port. |
| `CRON_SECRET` | Yes in Vercel | Daily maintenance authorization | **Secret** | Generate a long random value and add it to Vercel. |

## Local development setup

1. Copy the safe template.

   ```bash
   cp .env.example .env
   ```

2. Open `.env` and paste your own Supabase project URL, service-role key, and browser publishable/anon key.

3. Do not add GitHub OAuth secrets to `.env`. GitHub OAuth is configured in **Supabase Dashboard → Authentication → Providers → GitHub**.

4. Start the application.

   ```bash
   npm install
   npm run dev
   ```

The Vite development server runs on `http://localhost:5173`; the Express API runs on `http://localhost:3001` and receives local `/api` requests through Vite’s proxy.

## Vercel production and preview setup

Add these variables in **Vercel Project Settings → Environment Variables**. Apply the required variables to **Production** and **Preview**. The `VITE_` values are embedded at build time, so redeploy after changing them.

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=REPLACE_WITH_SERVER_ONLY_SECRET
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=REPLACE_WITH_BROWSER_PUBLISHABLE_OR_ANON_KEY
VITE_API_BASE=
CORS_ORIGINS=
CRON_SECRET=REPLACE_WITH_A_LONG_RANDOM_SERVER_SECRET
```

### GitHub OAuth settings

GitHub client credentials are deliberately not part of the app environment file. Configure them only in Supabase:

1. Create or open the GitHub OAuth App in GitHub Developer Settings.
2. Use your production homepage as the GitHub OAuth App homepage.
3. Use the exact Supabase callback URL as the GitHub OAuth App authorization callback:

   ```text
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```

4. Add the GitHub Client ID and Client Secret inside the Supabase GitHub provider settings; enable it.
5. In Supabase **Authentication → URL Configuration**, set the production Site URL and add these redirect URLs:

   ```text
   http://localhost:5173/auth/callback
   https://YOUR_VERCEL_DOMAIN/auth/callback
   ```

For the deployed project, the production application URL is `https://lock-note-sigma.vercel.app`.

## Generate a secure maintenance secret

Use one of these commands locally and paste the output into `CRON_SECRET` in Vercel:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Submission rules

Use `.env.submission.template` when an evaluator asks for an environment file. It is intentionally **not runnable until the evaluator supplies their own private values**. If the submission platform requires a file literally named `.env`, copy the template to `.env` outside Git and fill it locally:

```bash
cp .env.submission.template .env
```

Before submitting, confirm these rules:

| Check | Expected result |
| --- | --- |
| `git status --ignored` | `.env` appears as ignored, not staged. |
| GitHub repository | Contains `.env.example` and `.env.submission.template`, but no populated `.env`. |
| Browser variables | Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optional `VITE_API_BASE` use the `VITE_` prefix. |
| Vercel | Holds the real `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` securely. |
| GitHub OAuth | Client secret appears only in Supabase’s provider configuration, never in the repository. |

-- ============================================================
-- Locknote — production hardening migration v2
-- Run once after 001_init.sql on existing projects.
-- ============================================================
--
-- Draft data is created, read, updated, and sealed through the Locknote API
-- with the server-only service-role key. The browser uses Supabase Realtime
-- Broadcast and Presence for ephemeral collaboration messages; it does not
-- need direct PostgREST access to public.drafts. Removing these anonymous
-- policies prevents anyone holding the public browser key from enumerating,
-- reading, or overwriting draft rows directly.

alter table public.drafts enable row level security;

drop policy if exists "drafts anon insert" on public.drafts;
drop policy if exists "drafts anon select" on public.drafts;
drop policy if exists "drafts anon update" on public.drafts;

-- Defense in depth: direct privileges are unnecessary because the API uses
-- the service-role key, which bypasses RLS. Keeping explicit revocations
-- makes the intended access boundary clear even if a permissive policy is
-- accidentally introduced later.
revoke all on table public.drafts from anon, authenticated;

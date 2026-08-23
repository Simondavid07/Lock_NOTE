-- ============================================================
-- Locknote — Supabase schema migration v1
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query
-- Idempotent: safe to re-run after a partial failure.
-- ============================================================

-- pg_cron powers the database-level expiry purge. It is preinstalled
-- in Supabase but must be activated (this also creates the `cron` schema).
create extension if not exists pg_cron;

-- ------------------------------------------------------------
-- 1. Pastes — the zero-knowledge warehouse.
--    Every payload column is opaque ciphertext. The server
--    (service role) is the only writer; the browser never talks
--    to this table directly.
-- ------------------------------------------------------------
create table if not exists public.pastes (
  id                text primary key,
  ciphertext        text not null,             -- base64url AES-256-GCM payload
  salt              text not null,             -- base64url KDF salt (public)
  iv                text not null,             -- base64url payload IV
  iterations        bigint not null default 0, -- PBKDF2 rounds (0 = hkdf)
  kdf               text not null default 'hkdf',
  alg               text not null default 'aes-256-gcm',
  format            text not null,             -- text | markdown | code | credentials | file
  language          text,
  burn_after_read   boolean not null default false,
  dead_switch_days  integer,                   -- auto-destroy after N days idle
  storage_path      text,                      -- encrypted file blob (file secrets)
  file_meta         jsonb,                     -- { size, iv } envelope only
  created_at        bigint not null,           -- epoch ms
  expires_at        bigint,                    -- epoch ms; null = never
  view_count        integer not null default 0,
  first_viewed_at   bigint,
  last_viewed_at    bigint,
  owner_token       text not null,             -- remote wipe / preview / receipt capability
  burned            boolean not null default false
);

create index if not exists idx_pastes_expires on public.pastes (expires_at);
create index if not exists idx_pastes_burned  on public.pastes (burned);
create index if not exists idx_pastes_dead    on public.pastes (dead_switch_days, last_viewed_at, created_at);

-- Pastes are fully server-managed; no anonymous database access.
alter table public.pastes enable row level security;

-- ------------------------------------------------------------
-- 2. Drafts — ephemeral pre-seal collaboration scratchpads.
--    The Locknote API owns all persistence using the server-only service
--    role. Realtime Broadcast and Presence carry ephemeral collaboration
--    messages without granting browser clients direct table access.
-- ------------------------------------------------------------
create table if not exists public.drafts (
  room_id     text primary key,
  content     text not null default '',
  created_at  bigint not null,
  updated_at  bigint not null,
  owner_token text not null
);

create index if not exists idx_drafts_updated on public.drafts (updated_at);

alter table public.drafts enable row level security;

-- Do not create anon/authenticated policies. Browser clients use the API,
-- while the server-only service role bypasses RLS for the intended operations.
revoke all on table public.drafts from anon, authenticated;

-- ------------------------------------------------------------
-- 3. Events — privacy-safe audit trail (ids only, never content).
-- ------------------------------------------------------------
create table if not exists public.events (
  id         text primary key,
  paste_id   text not null,
  event      text not null,
  created_at bigint not null
);

create index if not exists idx_events_paste on public.events (paste_id);
alter table public.events enable row level security;

-- ------------------------------------------------------------
-- 4. Realtime — draft document sync via change data capture.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'drafts'
  ) then
    alter publication supabase_realtime add table public.drafts;
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. Storage — encrypted file blobs (ciphertext only).
--    Public read is safe: objects are unreadable without the key.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('secrets', 'secrets', true)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 6. pg_cron — database-level expiry purge (defense in depth;
--    the API janitor also purges on every request cycle).
-- ------------------------------------------------------------
-- Drop any prior jobs first so this file stays re-runnable.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'locknote-purge-pastes') then
    perform cron.unschedule('locknote-purge-pastes');
  end if;
  if exists (select 1 from cron.job where jobname = 'locknote-purge-drafts') then
    perform cron.unschedule('locknote-purge-drafts');
  end if;
end $$;

select cron.schedule(
  'locknote-purge-pastes',
  '0 * * * *',
  $$
  delete from public.pastes
  where (expires_at is not null and expires_at <= (extract(epoch from now())::bigint * 1000))
     or (dead_switch_days is not null
         and coalesce(last_viewed_at, created_at) + dead_switch_days * 86400000
             <= (extract(epoch from now())::bigint * 1000))
  $$
);

select cron.schedule(
  'locknote-purge-drafts',
  '30 * * * *',
  $$
  delete from public.drafts
  where updated_at <= (extract(epoch from now())::bigint * 1000) - 86400000
  $$
);
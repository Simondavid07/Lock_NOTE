-- ============================================================
-- Lock Note — account metadata and private contacts migration v3
--
-- Run after 001_init.sql and 002_harden_drafts_rls.sql.
-- This migration stores only opt-in profile metadata and contact usernames.
-- It MUST NOT be used for note plaintext, ciphertext, URLs with fragments,
-- passphrases, encryption material, or paste owner capabilities.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Private account metadata. Each row belongs to exactly one
--    Supabase Auth identity and is unreadable by every other user.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  username     text not null default '' check (
    char_length(username) <= 39
    and username = lower(username)
    and username ~ '^[a-z0-9](?:[a-z0-9-]{0,37})$'
  ),
  avatar_url   text not null default '' check (char_length(avatar_url) <= 2048),
  bio          text not null default '' check (char_length(bio) <= 160),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Per-user contact labels. A contact is not an authorization,
--    collaboration invitation, or a share recipient. It is merely an
--    owner-scoped username shortcut in the signed-in user's own account.
-- ------------------------------------------------------------
create table if not exists public.vault_contacts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  username   text not null check (
    char_length(username) <= 39
    and username = lower(username)
    and username ~ '^[a-z0-9](?:[a-z0-9-]{0,37})$'
  ),
  created_at timestamptz not null default now(),
  unique (owner_id, username)
);

create index if not exists idx_vault_contacts_owner_created
  on public.vault_contacts (owner_id, created_at);

-- Maintain a truthful update timestamp without accepting client-provided
-- timestamps as an authority.
create or replace function public.locknote_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.locknote_set_updated_at() from public;

drop trigger if exists locknote_profiles_set_updated_at on public.profiles;
create trigger locknote_profiles_set_updated_at
before update on public.profiles
for each row execute function public.locknote_set_updated_at();

-- Browser access uses the anon key plus the signed-in user's Supabase JWT.
-- Grants expose only operations which are then narrowed by RLS. The server's
-- service role remains server-only and bypasses RLS for existing paste/draft
-- operations; it is never bundled to the browser.
alter table public.profiles enable row level security;
alter table public.vault_contacts enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.vault_contacts from anon;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.vault_contacts to authenticated;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

create policy profiles_select_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy profiles_delete_own
  on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

drop policy if exists vault_contacts_select_own on public.vault_contacts;
drop policy if exists vault_contacts_insert_own on public.vault_contacts;
drop policy if exists vault_contacts_update_own on public.vault_contacts;
drop policy if exists vault_contacts_delete_own on public.vault_contacts;

create policy vault_contacts_select_own
  on public.vault_contacts for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy vault_contacts_insert_own
  on public.vault_contacts for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy vault_contacts_update_own
  on public.vault_contacts for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy vault_contacts_delete_own
  on public.vault_contacts for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Keep accidental broad grants from prior local prototypes from widening
-- browser access. RLS above is the final privacy boundary.
revoke all on table public.profiles from public;
revoke all on table public.vault_contacts from public;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.vault_contacts to authenticated;

comment on table public.profiles is
  'Private opt-in account metadata only; never store notes, crypto material, share URLs, or owner capabilities.';
comment on table public.vault_contacts is
  'Private per-owner username shortcuts; contacts grant no access to Lock Note secrets.';

-- Lock Note verified delivery and Guardian Wipe migration
--
-- Adds only hash-only verifiers and delivery state. The database never receives
-- plaintext, a content key, a passphrase, a raw receipt proof, a guardian
-- capability, or individual guardian shares.

begin;

alter table public.pastes
  add column if not exists receipt_proof_hash text,
  add column if not exists receipt_acknowledged_at bigint,
  add column if not exists guardian_verifier text,
  add column if not exists guardian_threshold smallint,
  add column if not exists guardian_total smallint,
  add column if not exists file_lease_hash text,
  add column if not exists file_lease_expires_at bigint;

-- Legacy v1 records intentionally have a null receipt verifier. New v2 records
-- always supply one through the server validation contract.
create index if not exists idx_pastes_file_lease_expiry on public.pastes (file_lease_expires_at)
  where file_lease_expires_at is not null;

alter table public.pastes drop constraint if exists pastes_guardian_policy_check;
alter table public.pastes add constraint pastes_guardian_policy_check
  check (
    (guardian_verifier is null and guardian_threshold is null and guardian_total is null)
    or (
      guardian_verifier is not null
      and guardian_threshold between 2 and 5
      and guardian_total between guardian_threshold and 5
    )
  ) not valid;
alter table public.pastes validate constraint pastes_guardian_policy_check;

-- File ciphertext is no longer directly addressable through the public Storage
-- route. Server-side service-role code issues and redeems a one-use lease after
-- a successful paste consume. Browser authorization is enforced by the private
-- bucket plus Storage RLS with no browser object policies; do not rely on table
-- grant listings alone because Supabase manages baseline Storage table grants.
update storage.buckets set public = false where id = 'secrets';
revoke all on table storage.objects from public, anon, authenticated;
revoke all on table storage.buckets from public, anon, authenticated;

commit;

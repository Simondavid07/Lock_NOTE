-- Lock Note encrypted recipient replies
--
-- Recipient reply plaintext, decryption keys, passphrases, and raw reply
-- capabilities remain in the browser. The API receives only opaque AES-GCM
-- ciphertext, a public IV, and a hash-only capability verifier.

begin;

alter table public.pastes
  add column if not exists allow_replies boolean not null default false,
  add column if not exists reply_verifier text;

alter table public.pastes drop constraint if exists pastes_reply_policy_check;
alter table public.pastes add constraint pastes_reply_policy_check
  check (
    (allow_replies = false and reply_verifier is null)
    or (allow_replies = true and reply_verifier is not null)
  ) not valid;
alter table public.pastes validate constraint pastes_reply_policy_check;

create table if not exists public.paste_replies (
  id text primary key,
  paste_id text not null references public.pastes(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  created_at bigint not null
);

create index if not exists idx_paste_replies_paste_created
  on public.paste_replies (paste_id, created_at, id);

-- Browser roles have no table policy. All access is mediated by the API using
-- its server-only service role; paste deletion cascades to all reply ciphertext.
alter table public.paste_replies enable row level security;
revoke all on table public.paste_replies from public, anon, authenticated;

-- Verify a hash-only reply capability and create a bounded opaque reply in the
-- same locked database operation. Replies never refresh dead-switch activity.
create or replace function public.locknote_add_encrypted_reply(
  p_paste_id text,
  p_reply_verifier text,
  p_reply_id text,
  p_ciphertext text,
  p_iv text
)
returns table (id text, ciphertext text, iv text, created_at bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_paste public.pastes%rowtype;
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  select * into parent_paste
  from public.pastes
  where public.pastes.id = p_paste_id
  for update;

  if not found
    or parent_paste.burned
    or not parent_paste.allow_replies
    or parent_paste.reply_verifier is null
    or parent_paste.reply_verifier <> p_reply_verifier
    or (parent_paste.expires_at is not null and parent_paste.expires_at <= now_ms)
    or (parent_paste.dead_switch_days is not null and now_ms - coalesce(parent_paste.last_viewed_at, parent_paste.created_at) > parent_paste.dead_switch_days * 86400000)
  then
    return;
  end if;

  if (select count(*) from public.paste_replies where paste_id = p_paste_id) >= 20 then
    return;
  end if;

  return query
  insert into public.paste_replies (id, paste_id, ciphertext, iv, created_at)
  values (p_reply_id, p_paste_id, p_ciphertext, p_iv, now_ms)
  returning paste_replies.id, paste_replies.ciphertext, paste_replies.iv, paste_replies.created_at;
end;
$$;

revoke all on function public.locknote_add_encrypted_reply(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.locknote_add_encrypted_reply(text, text, text, text, text) to service_role;

commit;

-- Lock Note Storage privilege follow-up
--
-- This defensive migration was applied to existing production after migration
-- 005. Supabase may retain or re-provision baseline table grants for its Storage
-- API roles, so browser authorization MUST be verified through the controls that
-- govern the Storage API: `secrets` is private, Storage RLS is enabled, and no
-- browser policy exists for storage.objects. The server-side service role still
-- performs file upload, stream, and cleanup after an API lifecycle transition.

begin;

revoke all on table storage.objects from public, anon, authenticated;
revoke all on table storage.buckets from public, anon, authenticated;

commit;

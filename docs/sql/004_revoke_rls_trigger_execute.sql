-- Lock Note Supabase security hardening migration
-- Removes publicly callable EXECUTE privileges from the SECURITY DEFINER
-- event-trigger helper that auto-enables RLS on newly created public tables.
--
-- The function is invoked by the database event-trigger mechanism, not by the
-- PostgREST API. It must not be exposed to anon/authenticated callers.

begin;

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

commit;

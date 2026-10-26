CREATE OR REPLACE FUNCTION public.server_now() RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT now() $$;
GRANT EXECUTE ON FUNCTION public.server_now() TO anon, authenticated;
-- A stand-in for the parts of Supabase the migrations rely on, so they can
-- be tested on a plain local Postgres. Not used on Supabase itself.
--
-- Supabase reads the caller's JWT into request.jwt.claims; tests set that
-- setting directly to act as a given user.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text not null
);

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create publication supabase_realtime;

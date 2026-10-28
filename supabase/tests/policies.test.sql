-- Access-rule and sync tests for the migrations, on a throwaway local
-- Postgres with supabase-shim.sql loaded (npm run test:db). Each check
-- prints "ok - ..." or stops the run with "FAILED: ...".
--
-- Alice and Bob are allowlisted; Carol has an account but isn't on the list.

create schema test;
grant usage on schema test to anon, authenticated;

create function test.expect(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end
$$;

-- Runs `statement` and passes only if it raises an error.
create function test.expect_error(statement text, what text) returns void
language plpgsql as $$
declare
  failed boolean := false;
begin
  begin
    execute statement;
  exception when others then
    failed := true;
    raise notice 'ok - % (%)', what, sqlerrm;
  end;
  if not failed then raise exception 'FAILED: % (no error raised)', what; end if;
end
$$;

-- Acts as a signed-in user, the way Supabase passes the JWT to Postgres.
create function test.sign_in(sub uuid, email text) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', sub, 'email', email, 'role', 'authenticated')::text,
    false
  )
$$;

grant execute on all functions in schema test to anon, authenticated;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'alice@example.com'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@example.com'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@example.com');
insert into public.allowed_emails (email) values ('alice@example.com'), ('bob@example.com');

-- A project as the app sends it, edited at `edited` (an ISO time).
create function test.project(title text, edited text, deleted boolean default false) returns jsonb
language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'id', 'f0000000-0000-4000-8000-0000000000aa', 'title', title, 'platform', 'youtube',
    'color', 'blue', 'publish_date', '2026-11-14', 'notes', '', 'archived', false,
    'deleted', deleted, 'edited_at', edited
  ))
$$;

create function test.publish_subtask() returns jsonb
language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'id', 'f0000000-0000-4000-8000-0000000000bb', 'project_id', 'f0000000-0000-4000-8000-0000000000aa',
    'kind', 'publish', 'title', 'Publish', 'start_date', '2026-11-14', 'end_date', null,
    'done', false, 'notes', '', 'sort_order', 5, 'deleted', false, 'edited_at', '2026-10-27T10:00:00Z'
  ))
$$;

create function test.idea(
  title text, edited text, deleted boolean default false, month text default null
) returns jsonb
language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'id', 'f0000000-0000-4000-8000-0000000000cc', 'title', title, 'platform', 'instagram',
    'description', 'A reel about it', 'month', month, 'created_at', '2026-10-28T09:00:00Z',
    'deleted', deleted, 'edited_at', edited
  ))
$$;

-- Alice --------------------------------------------------------------------

select test.sign_in('a0000000-0000-4000-8000-000000000001', 'alice@example.com');
set role authenticated;

select public.sync_push(test.project('Vlog', '2026-10-27T10:00:00Z'), test.publish_subtask());
select test.expect((select count(*) = 1 from public.projects), 'Alice pushes a project and sees it');
select test.expect(
  (select count(*) = 1 from public.subtasks where project_id = 'f0000000-0000-4000-8000-0000000000aa'),
  'its Publish subtask arrives in the same push'
);
select test.expect(
  (select user_id = auth.uid() from public.projects),
  'the row is stamped with her user id'
);

select public.sync_push(test.project('Old title', '2026-10-27T09:00:00Z'), null);
select test.expect(
  (select title = 'Vlog' from public.projects),
  'an older edit from an offline device does not overwrite a newer one'
);

select public.sync_push(test.project('Vlog v2', '2026-10-27T11:00:00Z'), null);
select test.expect((select title = 'Vlog v2' from public.projects), 'a newer edit is applied');

select public.sync_push(test.project('Vlog v2', '2026-10-27T12:00:00Z', true), null);
select test.expect((select deleted from public.projects), 'a delete arrives as a tombstone');
select test.expect(
  (select updated_at is not null and updated_at <= now() from public.projects),
  'updated_at is set by the server'
);

select public.sync_push(null, null, test.idea('Reel idea', '2026-10-28T10:00:00Z', month => '2027-03'));
select test.expect(
  (select count(*) = 1 and bool_and(user_id = auth.uid() and month = '2027-03') from public.ideas),
  'Alice pushes an idea, stamped with her user id'
);
select public.sync_push(null, null, test.idea('Old idea', '2026-10-28T09:30:00Z'));
select test.expect(
  (select title = 'Reel idea' from public.ideas),
  'an older edit of an idea does not overwrite a newer one'
);
select test.expect_error(
  $$select public.sync_push(null, null, test.idea('Reel idea', '2026-10-28T11:00:00Z', month => 'March 2027'))$$,
  'an idea''s month must be YYYY-MM'
);
select public.sync_push(null, null, test.idea('Reel idea', '2026-10-28T12:00:00Z', true));
select test.expect((select deleted from public.ideas), 'a deleted idea arrives as a tombstone');

select test.expect_error('select * from public.allowed_emails', 'Alice cannot read the allowlist');
select test.expect_error(
  $$insert into public.allowed_emails values ('mallory@example.com')$$,
  'Alice cannot add to the allowlist'
);
select test.expect_error(
  $$delete from public.projects$$,
  'nobody can hard-delete rows'
);
select test.expect_error($$delete from public.ideas$$, 'nobody can hard-delete ideas');

reset role;

-- Bob: allowlisted, but a different user -----------------------------------

select test.sign_in('b0000000-0000-4000-8000-000000000002', 'bob@example.com');
set role authenticated;

select test.expect((select count(*) = 0 from public.projects), 'Bob cannot see Alice''s projects');
select test.expect((select count(*) = 0 from public.subtasks), 'Bob cannot see Alice''s subtasks');
select test.expect((select count(*) = 0 from public.ideas), 'Bob cannot see Alice''s ideas');
select test.expect(
  (with changed as (
    update public.projects set title = 'Hacked' where id = 'f0000000-0000-4000-8000-0000000000aa' returning 1
  ) select count(*) = 0 from changed),
  'Bob cannot update Alice''s project'
);
select test.expect_error(
  $$insert into public.projects (id, user_id, title, platform, color, publish_date, edited_at)
    values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'Planted', 'youtube', 'blue', '2026-11-01', now())$$,
  'Bob cannot write a row as Alice'
);
select test.expect_error(
  $$select public.sync_push(test.project('Hijacked', '2027-01-01T00:00:00Z'), null)$$,
  'Bob cannot overwrite Alice''s project by reusing its id'
);
select test.expect_error(
  $$select public.sync_push(null, null, test.idea('Hijacked', '2027-01-01T00:00:00Z'))$$,
  'Bob cannot overwrite Alice''s idea by reusing its id'
);
select test.expect_error(
  $$insert into public.subtasks (id, project_id, kind, title, start_date, sort_order, edited_at)
    values (gen_random_uuid(), 'f0000000-0000-4000-8000-0000000000aa', 'task', 'Planted', '2026-11-01', 0, now())$$,
  'Bob cannot attach a subtask to Alice''s project'
);

reset role;

-- Carol: signed in, not allowlisted ------------------------------------------

select test.sign_in('c0000000-0000-4000-8000-000000000003', 'carol@example.com');
set role authenticated;

select test.expect((select count(*) = 0 from public.projects), 'Carol sees nothing');
select test.expect_error(
  $$insert into public.projects (id, title, platform, color, publish_date, edited_at)
    values (gen_random_uuid(), 'Mine', 'youtube', 'blue', '2026-11-01', now())$$,
  'Carol cannot store anything'
);
select test.expect((select count(*) = 0 from public.ideas), 'Carol sees no ideas');
select test.expect_error(
  $$select public.sync_push(null, null, jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'title', 'Mine', 'platform', 'youtube', 'description', '',
    'month', null, 'created_at', now(), 'deleted', false, 'edited_at', now())))$$,
  'Carol cannot store an idea'
);

reset role;

-- Signed out -------------------------------------------------------------------

select set_config('request.jwt.claims', '', false);
set role anon;

select test.expect_error('select * from public.projects', 'signed-out requests cannot read projects');
select test.expect_error('select * from public.subtasks', 'signed-out requests cannot read subtasks');
select test.expect_error('select * from public.ideas', 'signed-out requests cannot read ideas');
select test.expect_error(
  $$select public.sync_push(test.project('Anon', '2027-01-01T00:00:00Z'), null)$$,
  'signed-out requests cannot push'
);

reset role;

-- Afterwards -------------------------------------------------------------------

select test.expect(
  (select title = 'Vlog v2' and user_id = 'a0000000-0000-4000-8000-000000000001' from public.projects),
  'Alice''s project is untouched by the others'
);
select test.expect((select count(*) = 1 from public.projects), 'nothing else was stored');
select test.expect(
  (select count(*) = 1 and bool_and(title = 'Reel idea' and deleted) from public.ideas),
  'Alice''s idea is untouched by the others'
);

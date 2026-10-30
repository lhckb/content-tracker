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

select public.sync_push(null, jsonb_build_array(jsonb_build_object(
  'id', 'f0000000-0000-4000-8000-0000000000dd', 'project_id', 'f0000000-0000-4000-8000-0000000000aa',
  'kind', 'cleanup', 'title', 'Back up raw footage', 'start_date', '2026-11-15', 'end_date', null,
  'done', false, 'notes', '', 'sort_order', 6, 'deleted', false, 'edited_at', '2026-10-27T10:00:00Z'
)));
select test.expect(
  (select kind = 'cleanup' from public.subtasks where id = 'f0000000-0000-4000-8000-0000000000dd'),
  'a clean-up task is accepted'
);
select test.expect_error(
  $$select public.sync_push(null, jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'project_id', 'f0000000-0000-4000-8000-0000000000aa',
    'kind', 'chore', 'title', 'Unknown', 'start_date', '2026-11-15', 'end_date', null,
    'done', false, 'notes', '', 'sort_order', 7, 'deleted', false, 'edited_at', '2026-10-27T10:00:00Z'
  )))$$,
  'an unknown kind of subtask is refused'
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
-- A data-modifying WITH has to be at the top level, so the update runs here
-- and the check reads its result.
with changed as (
  update public.projects set title = 'Hacked' where id = 'f0000000-0000-4000-8000-0000000000aa' returning 1
)
select test.expect((select count(*) = 0 from changed), 'Bob cannot update Alice''s project');
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

-- Daily reminders --------------------------------------------------------------
--
-- Most checks are at 8:00 AM in Recife (UTC-3) on Nov 10, 2026: 11:00 UTC.

grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

select test.sign_in('a0000000-0000-4000-8000-000000000001', 'alice@example.com');
set role authenticated;

insert into public.push_subscriptions (endpoint, p256dh, auth, time_zone, remind_at)
values ('https://push.example/alice-phone', 'key', 'secret', 'America/Recife', '08:00');
select test.expect(
  (select user_id = auth.uid() and last_sent_on is null from public.push_subscriptions),
  'Alice turns on reminders on her phone, stamped with her user id'
);
select test.expect_error(
  $$insert into public.push_subscriptions (endpoint, p256dh, auth, time_zone)
    values ('https://push.example/alice-x', 'key', 'secret', 'Mars/Olympus')$$,
  'an unknown time zone is refused'
);
select test.expect_error(
  $$insert into public.push_subscriptions (endpoint, p256dh, auth, time_zone, remind_at)
    values ('https://push.example/alice-x', 'key', 'secret', 'America/Recife', '08:00:30')$$,
  'a reminder time is in whole minutes'
);
insert into public.push_subscriptions (endpoint, p256dh, auth, time_zone, remind_at) values
  ('https://push.example/alice-tablet', 'key', 'secret', 'America/Recife', '07:15'),
  ('https://push.example/alice-laptop', 'key', 'secret', 'America/Recife', '06:00'),
  ('https://push.example/alice-late', 'key', 'secret', 'America/Recife', '23:30'),
  ('https://push.example/alice-old', 'key', 'secret', 'America/Recife', '08:00');
update public.push_subscriptions set remind_at = '06:30' where endpoint = 'https://push.example/alice-laptop';
delete from public.push_subscriptions where endpoint = 'https://push.example/alice-old';
select test.expect(
  (select count(*) = 4 and bool_or(remind_at = '06:30') from public.push_subscriptions),
  'Alice can change and remove her own devices'
);
select test.expect_error('select public.claim_due_reminders()', 'app users cannot claim reminders');
select test.expect_error('select public.reminders_due()', 'app users cannot run the job''s check');
select test.expect_error(
  $$select public.forget_push_subscriptions(array['https://push.example/alice-phone'])$$,
  'app users cannot forget devices'
);

reset role;
select test.sign_in('b0000000-0000-4000-8000-000000000002', 'bob@example.com');
set role authenticated;

select test.expect((select count(*) = 0 from public.push_subscriptions), 'Bob cannot see Alice''s devices');
with changed as (
  update public.push_subscriptions set remind_at = '03:00' returning 1
)
select test.expect((select count(*) = 0 from changed), 'Bob cannot change Alice''s devices');
with removed as (
  delete from public.push_subscriptions returning 1
)
select test.expect((select count(*) = 0 from removed), 'Bob cannot remove Alice''s devices');
select test.expect_error(
  $$insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, time_zone)
    values ('https://push.example/planted', 'a0000000-0000-4000-8000-000000000001', 'key', 'secret', 'UTC')$$,
  'Bob cannot save a device as Alice'
);
insert into public.push_subscriptions (endpoint, p256dh, auth, time_zone, remind_at)
values ('https://push.example/bob-phone', 'key', 'secret', 'America/Recife', '08:00');

reset role;
select test.sign_in('c0000000-0000-4000-8000-000000000003', 'carol@example.com');
set role authenticated;

select test.expect_error(
  $$insert into public.push_subscriptions (endpoint, p256dh, auth, time_zone)
    values ('https://push.example/carol-phone', 'key', 'secret', 'America/Recife')$$,
  'Carol cannot turn on reminders'
);

reset role;
select set_config('request.jwt.claims', '', false);
set role anon;

select test.expect_error('select * from public.push_subscriptions', 'signed-out requests cannot read devices');
select test.expect_error('select public.claim_due_reminders()', 'signed-out requests cannot claim reminders');

reset role;

-- The calendar, as the app would sync it. Dave is allowlisted but has no
-- projects; Carol's device is written here directly, as if she'd been
-- removed from the allowlist after turning reminders on.
insert into auth.users (id, email) values ('d0000000-0000-4000-8000-000000000004', 'dave@example.com');
insert into public.allowed_emails (email) values ('dave@example.com');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, time_zone, remind_at) values
  ('https://push.example/dave-phone', 'd0000000-0000-4000-8000-000000000004', 'key', 'secret', 'America/Recife', '08:00'),
  ('https://push.example/carol-phone', 'c0000000-0000-4000-8000-000000000003', 'key', 'secret', 'America/Recife', '08:00');

insert into public.projects (id, user_id, title, platform, color, publish_date, archived, deleted, edited_at)
select id::uuid, user_id::uuid, title, platform, 'blue', publish_date::date, archived, deleted, now()
from (values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Desk tour', 'youtube', '2026-11-20', false, false),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Packing Reel', 'instagram', '2026-11-10', false, false),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Old vlog', 'youtube', '2026-11-01', true, false),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Dropped', 'youtube', '2026-11-30', false, true),
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000002', 'Bob''s short', 'youtube', '2026-11-12', false, false)
) as p (id, user_id, title, platform, publish_date, archived, deleted);

insert into public.subtasks (id, user_id, project_id, kind, title, start_date, end_date, done, deleted, sort_order, edited_at)
select gen_random_uuid(), user_id::uuid, project_id::uuid, kind, title, start_date::date, end_date::date, done, deleted, 0, now()
from (values
  -- Desk tour: two for today, two overdue, and three that don't count.
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'task', 'Script', '2026-11-10', null, false, false),
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'task', 'Edit', '2026-11-09', '2026-11-11', false, false),
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'task', 'B-roll (done)', '2026-11-10', null, true, false),
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'task', 'A-roll (overdue)', '2026-11-09', null, false, false),
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'task', 'Research (overdue)', '2026-11-05', '2026-11-09', false, false),
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'task', 'Outline (done)', '2026-11-08', null, true, false),
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'task', 'Thumbnail (deleted)', '2026-11-10', null, false, true),
  -- Packing Reel: Publish and a clean-up task, both today.
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'publish', 'Publish', '2026-11-10', null, false, false),
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'cleanup', 'Back up footage', '2026-11-10', null, false, false),
  -- An archived project and a deleted one, which don't count.
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'task', 'Edit', '2026-11-10', null, false, false),
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'task', 'Script', '2026-11-01', null, false, false),
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004', 'task', 'Script', '2026-11-10', null, false, false),
  ('b0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000005', 'task', 'Film', '2026-11-10', null, false, false)
) as s (user_id, project_id, kind, title, start_date, end_date, done, deleted);

-- The scheduled job's check, which runs as the database owner.
select test.expect(not public.reminders_due('2026-11-10T09:00:00Z'), 'no reminder is due at 6:00 AM');
select test.expect(
  (select not public.reminder_is_due(s, '2026-11-10T10:14:00Z') and public.reminder_is_due(s, '2026-11-10T10:15:00Z')
   from public.push_subscriptions s where endpoint = 'https://push.example/alice-tablet'),
  'a reminder is due from its minute on, not before: 7:15 AM'
);
select test.expect(public.reminders_due('2026-11-10T11:00:00Z'), 'reminders are due at 8:00 AM');

-- The server function's view, with the secret key.
set role service_role;

create temp table claimed as select * from public.claim_due_reminders('2026-11-10T11:00:00Z');
select test.expect(
  (select tasks = 4 and projects = 2 and overdue = 2 from claimed where endpoint = 'https://push.example/alice-phone'),
  'Alice''s phone: 4 tasks for 2 projects today, plus 2 overdue'
);
select test.expect(
  (select tasks = 4 and overdue = 2 from claimed where endpoint = 'https://push.example/alice-tablet'),
  'a late run still sends: the tablet''s 7:15 AM reminder, 45 minutes on'
);
select test.expect(
  not exists (select 1 from claimed where endpoint = 'https://push.example/alice-laptop'),
  'but not an hour or more on: the laptop''s 6:30 AM one'
);
select test.expect(
  (select tasks = 1 and projects = 1 and overdue = 0 from claimed where endpoint = 'https://push.example/bob-phone'),
  'Bob''s phone counts only his own tasks'
);
select test.expect(
  not exists (select 1 from claimed where endpoint = 'https://push.example/dave-phone'),
  'a device with nothing today and nothing overdue gets nothing'
);
select test.expect(
  not exists (select 1 from claimed where endpoint = 'https://push.example/carol-phone'),
  'an account that isn''t on the allowlist gets nothing'
);
select test.expect((select count(*) = 3 from claimed), 'nothing else is claimed');
reset role;
select test.expect(
  (select last_sent_on = '2026-11-10' from public.push_subscriptions where endpoint = 'https://push.example/dave-phone'),
  'the empty day is still marked as sent'
);
set role service_role;

select test.expect(
  not exists (select 1 from public.claim_due_reminders('2026-11-10T11:05:00Z')),
  'at most once a day: a run five minutes later sends nothing'
);
reset role;
select test.expect(not public.reminders_due('2026-11-10T11:05:00Z'), 'and the job''s check agrees');
set role service_role;
select test.expect(
  not exists (select 1 from public.claim_due_reminders('2026-11-11T03:10:00Z')),
  'an 11:30 PM reminder never goes out after midnight'
);
select test.expect(
  (select count(*) = 1 and bool_and(endpoint = 'https://push.example/alice-late')
   from public.claim_due_reminders('2026-11-11T02:40:00Z')),
  'it goes out at 11:40 PM, within its hour'
);
select test.expect(
  (select tasks = 0 and projects = 0 and overdue = 1
   from public.claim_due_reminders('2026-11-12T11:00:00Z') where endpoint = 'https://push.example/bob-phone'),
  'a day with only overdue tasks still sends'
);

reset role;
delete from public.allowed_emails where email = 'bob@example.com';
set role service_role;

select test.expect(
  not exists (select 1 from public.claim_due_reminders('2026-11-13T11:00:00Z') where endpoint = 'https://push.example/bob-phone'),
  'removing someone from the allowlist stops their reminders'
);
select public.forget_push_subscriptions(array['https://push.example/alice-tablet']);

reset role;
select test.expect(
  not exists (select 1 from public.push_subscriptions where endpoint = 'https://push.example/alice-tablet'),
  'a device the push service says is gone is forgotten'
);

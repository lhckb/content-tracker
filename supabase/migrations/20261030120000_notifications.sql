-- Daily reminder notifications (docs/plans/notifications.md).
--
-- One row per device that has turned reminders on: its push address and the
-- two keys that encrypt messages to it, its time zone, and the time of day it
-- wants the reminder. Unlike the synced tables, these rows live only here
-- (the app's local database doesn't have them), and the app deletes them
-- outright.
--
-- Every minute, a scheduled job asks reminders_due() whether any device's
-- time has come, and if so calls the daily-reminder Edge Function. The
-- function claims the due devices with claim_due_reminders(), which marks
-- them sent and counts their tasks, sends each one its push, and removes the
-- addresses the push service says are gone with forget_push_subscriptions().
--
-- The four locks: the table has the same rules as the others (own rows, the
-- allowlist, nothing for anyone signed out). The functions are for the
-- server only: neither app users nor signed-out callers can run them.

create table public.push_subscriptions (
  endpoint     text primary key,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh       text not null,
  auth         text not null,
  time_zone    text not null,
  remind_at    time not null default '08:00' check (extract(second from remind_at) = 0),
  last_sent_on date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- A time zone Postgres doesn't know would make every claim fail, for every
-- device, so it's refused when it's saved.
create function public.check_time_zone() returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform now() at time zone new.time_zone;
  return new;
end
$$;

create trigger check_time_zone before insert or update of time_zone on public.push_subscriptions
  for each row execute function public.check_time_zone();
create trigger touch_updated_at before insert or update on public.push_subscriptions
  for each row execute function public.touch_updated_at();

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy own_push_subscriptions on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));

-- Whether a device's reminder is due at `moment`: its local time has passed
-- remind_at by less than an hour, on the same local date (so a late-evening
-- reminder never goes out after midnight); it hasn't had one that date; and
-- its account's email is still on the allowlist.
create function public.reminder_is_due(s public.push_subscriptions, moment timestamptz)
returns boolean
language sql stable set search_path = ''
as $$
  select (moment at time zone s.time_zone)::time - s.remind_at >= interval '0'
    and (moment at time zone s.time_zone)::time - s.remind_at < interval '1 hour'
    and s.last_sent_on is distinct from (moment at time zone s.time_zone)::date
    and exists (
      select 1 from auth.users u
      join public.allowed_emails a on a.email = lower(u.email)
      where u.id = s.user_id
    )
$$;

-- The scheduled job's check, every minute: is any device due?
create function public.reminders_due(moment timestamptz default now()) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.push_subscriptions s where public.reminder_is_due(s, moment))
$$;

-- The due devices, each with its counts for its own today, for the
-- daily-reminder function. They're marked sent in the same statement, so two
-- runs at once can't both send. A device with no tasks today and nothing
-- overdue is marked but not returned.
--
-- tasks: unticked subtasks whose day or range covers today (any kind:
-- regular tasks, Publish and clean-up tasks); projects: how many projects
-- those belong to; overdue: unticked subtasks whose last day is before
-- today. Archived and deleted projects don't count.
create function public.claim_due_reminders(moment timestamptz default now())
returns table (endpoint text, p256dh text, auth text, tasks integer, projects integer, overdue integer)
language sql volatile security definer set search_path = ''
as $$
  with due as (
    select s.endpoint, (moment at time zone s.time_zone)::date as today
    from public.push_subscriptions s
    where public.reminder_is_due(s, moment)
    for update skip locked
  ),
  claimed as (
    update public.push_subscriptions s
    set last_sent_on = due.today
    from due
    where s.endpoint = due.endpoint
    returning s.endpoint, s.p256dh, s.auth, s.user_id, due.today
  ),
  open_subtasks as (
    select st.user_id, st.project_id, st.start_date, coalesce(st.end_date, st.start_date) as last_day
    from public.subtasks st
    join public.projects p on p.id = st.project_id
    where not st.done and not st.deleted and not p.archived and not p.deleted
  ),
  counted as (
    select c.endpoint, c.p256dh, c.auth,
      (count(*) filter (where o.start_date <= c.today and c.today <= o.last_day))::integer as tasks,
      (count(distinct o.project_id) filter (where o.start_date <= c.today and c.today <= o.last_day))::integer as projects,
      (count(*) filter (where o.last_day < c.today))::integer as overdue
    from claimed c
    left join open_subtasks o on o.user_id = c.user_id
    group by c.endpoint, c.p256dh, c.auth
  )
  select c.endpoint, c.p256dh, c.auth, c.tasks, c.projects, c.overdue
  from counted c
  where c.tasks > 0 or c.overdue > 0
$$;

-- Addresses the push service answered "gone" for: the app was deleted, or
-- notifications were turned off in the device's settings.
create function public.forget_push_subscriptions(endpoints text[]) returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = any (endpoints)
$$;

revoke execute on function public.check_time_zone() from public, anon, authenticated;
revoke execute on function public.reminder_is_due(public.push_subscriptions, timestamptz) from public, anon, authenticated;
revoke execute on function public.reminders_due(timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_due_reminders(timestamptz) from public, anon, authenticated;
revoke execute on function public.forget_push_subscriptions(text[]) from public, anon, authenticated;
-- The daily-reminder function calls these with the project's secret key.
grant execute on function public.claim_due_reminders(timestamptz) to service_role;
grant execute on function public.forget_push_subscriptions(text[]) to service_role;

-- The every-minute job, where pg_cron and pg_net exist: they do on Supabase,
-- but not in the local Postgres of npm run test:db, which skips this part.
-- It reads the function's address and the reminder token from Vault, where
-- they're set by hand in each project (see the plan), so this file holds no
-- secrets and is the same for dev and production. The token is a narrow one
-- of its own, not the secret key: pg_net keeps a request's headers in its
-- queue table until it's sent.
do $schedule$
begin
  if (select count(*) from pg_available_extensions where name in ('pg_cron', 'pg_net')) < 2 then
    raise notice 'pg_cron or pg_net is missing, so the daily reminder job is not scheduled.';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  create extension if not exists pg_net with schema extensions;
  -- Scheduling under an existing name replaces that job.
  perform cron.schedule('daily-reminder', '* * * * *', $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'daily_reminder_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reminder-token', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_reminder_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    where public.reminders_due()
  $job$);
end
$schedule$;

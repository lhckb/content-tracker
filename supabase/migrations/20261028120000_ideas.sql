-- Ideas: video ideas kept apart from the calendar (docs/plans/ideas.md).
--
-- The same rules as projects and subtasks in 20261027120000_init.sql: only
-- allowlisted users, only their own rows, and deletes kept as tombstones so
-- they reach other devices.

create table public.ideas (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null,
  platform    text not null check (platform in ('youtube', 'instagram')),
  description text not null default '',
  -- The month to work on it, 'YYYY-MM'; null when not set.
  month       text check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  created_at  timestamptz not null,
  deleted     boolean not null default false,
  edited_at   timestamptz not null,
  updated_at  timestamptz not null default now()
);

create index ideas_pull on public.ideas (user_id, updated_at);

create trigger touch_updated_at before insert or update on public.ideas
  for each row execute function public.touch_updated_at();

alter table public.ideas enable row level security;
revoke all on public.ideas from anon, authenticated;
grant select, insert, update on public.ideas to authenticated;

create policy own_ideas on public.ideas
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));

-- sync_push gains a third list. It defaults to empty, so a device still
-- running the previous version of the app, which sends two, keeps syncing.
-- Otherwise unchanged: a record is only written if its edited_at is newer
-- than the stored one.
drop function public.sync_push(jsonb, jsonb);

create function public.sync_push(
  project_rows jsonb,
  subtask_rows jsonb,
  idea_rows jsonb default '[]'
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  insert into public.projects as p
    (id, title, platform, color, publish_date, notes, archived, deleted, edited_at)
  select id, title, platform, color, publish_date, notes, archived, deleted, edited_at
  from jsonb_to_recordset(coalesce(project_rows, '[]')) as r (
    id uuid, title text, platform text, color text, publish_date date,
    notes text, archived boolean, deleted boolean, edited_at timestamptz
  )
  on conflict (id) do update set
    title = excluded.title,
    platform = excluded.platform,
    color = excluded.color,
    publish_date = excluded.publish_date,
    notes = excluded.notes,
    archived = excluded.archived,
    deleted = excluded.deleted,
    edited_at = excluded.edited_at
  where p.edited_at < excluded.edited_at;

  insert into public.subtasks as s
    (id, project_id, kind, title, start_date, end_date, done, notes, sort_order, deleted, edited_at)
  select id, project_id, kind, title, start_date, end_date, done, notes, sort_order, deleted, edited_at
  from jsonb_to_recordset(coalesce(subtask_rows, '[]')) as r (
    id uuid, project_id uuid, kind text, title text, start_date date, end_date date,
    done boolean, notes text, sort_order double precision, deleted boolean, edited_at timestamptz
  )
  on conflict (id) do update set
    project_id = excluded.project_id,
    kind = excluded.kind,
    title = excluded.title,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    done = excluded.done,
    notes = excluded.notes,
    sort_order = excluded.sort_order,
    deleted = excluded.deleted,
    edited_at = excluded.edited_at
  where s.edited_at < excluded.edited_at;

  insert into public.ideas as i
    (id, title, platform, description, month, created_at, deleted, edited_at)
  select id, title, platform, description, month, created_at, deleted, edited_at
  from jsonb_to_recordset(coalesce(idea_rows, '[]')) as r (
    id uuid, title text, platform text, description text, month text,
    created_at timestamptz, deleted boolean, edited_at timestamptz
  )
  on conflict (id) do update set
    title = excluded.title,
    platform = excluded.platform,
    description = excluded.description,
    month = excluded.month,
    created_at = excluded.created_at,
    deleted = excluded.deleted,
    edited_at = excluded.edited_at
  where i.edited_at < excluded.edited_at;
end
$$;
revoke execute on function public.sync_push(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.sync_push(jsonb, jsonb, jsonb) to authenticated;

alter publication supabase_realtime add table public.ideas;

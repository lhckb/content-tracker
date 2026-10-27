-- Content Tracker: tables, access rules and the sync function.
--
-- This file holds two of the four locks described in
-- docs/plans/supabase-sync.md ("Governance"):
--   * the allowlist: every data rule also requires the signed-in email to be
--     in allowed_emails;
--   * row ownership: every row belongs to one user, and only that user can
--     read or change it.
-- The other two (Google's Testing mode, Supabase sign-ups switched off) are
-- project settings, not SQL.

-- Who may use the app. Only the dashboard / service role can edit this list:
-- row-level security is on and there are no policies, so app users can't
-- read or change it.
create table public.allowed_emails (
  email text primary key check (email = lower(email))
);
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;

-- Whether the signed-in user's email is on the allowlist. security definer
-- so it can read allowed_emails, which app users can't.
create function public.is_allowed() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.allowed_emails
      where email = lower(auth.jwt() ->> 'email')
    )
$$;
revoke execute on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

-- Rows mirror the app's local records (src/types.ts). Deletes are tombstones
-- (deleted = true) so they reach other devices. edited_at is when the device
-- made the change, and decides which of two edits wins; updated_at is set
-- here and is what devices pull by.
create table public.projects (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  title        text not null,
  platform     text not null check (platform in ('youtube', 'instagram')),
  color        text not null,
  publish_date date not null,
  notes        text not null default '',
  archived     boolean not null default false,
  deleted      boolean not null default false,
  edited_at    timestamptz not null,
  updated_at   timestamptz not null default now()
);

create table public.subtasks (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  kind       text not null check (kind in ('task', 'publish')),
  title      text not null,
  start_date date not null,
  end_date   date check (end_date is null or end_date >= start_date),
  done       boolean not null default false,
  notes      text not null default '',
  sort_order double precision not null,
  deleted    boolean not null default false,
  edited_at  timestamptz not null,
  updated_at timestamptz not null default now()
);

create index projects_pull on public.projects (user_id, updated_at);
create index subtasks_pull on public.subtasks (user_id, updated_at);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger touch_updated_at before insert or update on public.projects
  for each row execute function public.touch_updated_at();
create trigger touch_updated_at before insert or update on public.subtasks
  for each row execute function public.touch_updated_at();

-- Access: signed-in, allowlisted users, and only their own rows. Signed-out
-- requests (anon) get no table access at all. Rows are never hard-deleted
-- by the app, so there's no delete grant.
alter table public.projects enable row level security;
alter table public.subtasks enable row level security;
revoke all on public.projects, public.subtasks from anon, authenticated;
grant select, insert, update on public.projects, public.subtasks to authenticated;

create policy own_projects on public.projects
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed()));

create policy own_subtasks on public.subtasks
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed()))
  with check (
    user_id = (select auth.uid())
    and (select public.is_allowed())
    -- A subtask can only belong to one of the user's own projects.
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

-- Applies one device's batch of changes in a single transaction, projects
-- first so new subtasks find their project. A record is only written if its
-- edited_at is newer than the stored one, so a device that was offline for
-- days can't overwrite newer edits from another. security invoker: the
-- access rules above still apply to every row.
create function public.sync_push(project_rows jsonb, subtask_rows jsonb) returns void
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
end
$$;
revoke execute on function public.sync_push(jsonb, jsonb) from public, anon;
grant execute on function public.sync_push(jsonb, jsonb) to authenticated;

-- Live updates to other open devices (Supabase Realtime). Realtime applies
-- the same row-level security, so a device only hears about its own rows.
alter publication supabase_realtime add table public.projects, public.subtasks;

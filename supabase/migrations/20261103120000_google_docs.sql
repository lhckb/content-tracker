-- Google Docs: a project or an idea remembers the Google Doc made from it
-- (docs/plans/google-docs.md).
--
-- doc_id is the doc's Drive file id, null until one is made. The app builds
-- the link from it, so it's checked to look like one (src/lib/googleDocs.ts
-- checks the same).
--
-- sync_push keeps its signature and writes doc_id too, but only when the
-- row has one: a device still running the previous version of the app
-- sends rows without it, and its edits mustn't wipe a link. The app never
-- clears a link, it only replaces it. Otherwise unchanged from
-- 20261028120000_ideas.sql. The access rules are untouched.

alter table public.projects add column doc_id text
  check (doc_id ~ '^[A-Za-z0-9_-]{1,200}$');
alter table public.ideas add column doc_id text
  check (doc_id ~ '^[A-Za-z0-9_-]{1,200}$');

create or replace function public.sync_push(
  project_rows jsonb,
  subtask_rows jsonb,
  idea_rows jsonb default '[]'
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  insert into public.projects as p
    (id, title, platform, color, publish_date, notes, archived, doc_id, deleted, edited_at)
  select id, title, platform, color, publish_date, notes, archived, doc_id, deleted, edited_at
  from jsonb_to_recordset(coalesce(project_rows, '[]')) as r (
    id uuid, title text, platform text, color text, publish_date date,
    notes text, archived boolean, doc_id text, deleted boolean, edited_at timestamptz
  )
  on conflict (id) do update set
    title = excluded.title,
    platform = excluded.platform,
    color = excluded.color,
    publish_date = excluded.publish_date,
    notes = excluded.notes,
    archived = excluded.archived,
    doc_id = coalesce(excluded.doc_id, p.doc_id),
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
    (id, title, platform, description, month, created_at, doc_id, deleted, edited_at)
  select id, title, platform, description, month, created_at, doc_id, deleted, edited_at
  from jsonb_to_recordset(coalesce(idea_rows, '[]')) as r (
    id uuid, title text, platform text, description text, month text,
    created_at timestamptz, doc_id text, deleted boolean, edited_at timestamptz
  )
  on conflict (id) do update set
    title = excluded.title,
    platform = excluded.platform,
    description = excluded.description,
    month = excluded.month,
    created_at = excluded.created_at,
    doc_id = coalesce(excluded.doc_id, i.doc_id),
    deleted = excluded.deleted,
    edited_at = excluded.edited_at
  where i.edited_at < excluded.edited_at;
end
$$;

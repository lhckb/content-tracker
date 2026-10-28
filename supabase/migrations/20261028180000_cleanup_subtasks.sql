-- Clean-up tasks: a third kind of subtask (docs/plans/cleanup-tasks.md).
--
-- Only the check on subtasks.kind changes. The app already live never
-- writes 'cleanup', and sync_push takes kind as plain text, so neither needs
-- anything else. The access rules are untouched.
--
-- subtasks_kind_check is the name Postgres gave the unnamed check in
-- 20261027120000_init.sql (table_column_check). Dropping it by name, without
-- "if exists", makes the whole migration fail and roll back if it's wrong.
alter table public.subtasks drop constraint subtasks_kind_check;
alter table public.subtasks add constraint subtasks_kind_check
  check (kind in ('task', 'publish', 'cleanup'));

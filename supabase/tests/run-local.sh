#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres and runs the access-rule
# tests against them. Needs a Postgres server and its tools (postgres, initdb,
# pg_ctl, psql), e.g. `brew install postgresql@17`; no Docker. Set PG_BIN to
# their directory if they're not on PATH. Usage: npm run test:db
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
bin="${PG_BIN:-$(dirname "$(command -v initdb || echo /missing/initdb)")}"
if [ ! -x "$bin/postgres" ]; then
  echo "No Postgres server found in $bin." >&2
  echo "Install one (e.g. brew install postgresql@17) or set PG_BIN to its bin directory." >&2
  exit 1
fi

dir="$(mktemp -d)"
port=54329

cleanup() {
  "$bin/pg_ctl" -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$dir"
}
trap cleanup EXIT

"$bin/initdb" -D "$dir/data" -U postgres --auth=trust >/dev/null
"$bin/pg_ctl" -D "$dir/data" -o "-p $port -k $dir -c listen_addresses=" -w start >/dev/null

psql=("$bin/psql" -h "$dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${psql[@]}" -f "$here/supabase-shim.sql"
for migration in "$here"/../migrations/*.sql; do
  "${psql[@]}" -f "$migration"
done
# Show each check's "ok - ..." line, and the error that stops a failing run.
"${psql[@]}" -f "$here/policies.test.sql" 2>&1 |
  sed -n 's/^psql:.*NOTICE:  //p; s/^psql:.*ERROR:  /ERROR: /p'
echo "Database tests passed."

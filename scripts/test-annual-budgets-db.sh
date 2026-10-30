#!/usr/bin/env bash
# Isolated PostgreSQL integration tests. Never reads DATABASE_URL, .env, or auth
# credentials. A fresh local container receives synthetic fixtures only.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_container="pebble-annual-budget-test-$$-${RANDOM}"
test_logs="$(mktemp -d)"
docker_local() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
psql_local() {
  docker_local exec -i "$test_container" psql -U postgres -d annual_budget_test -v ON_ERROR_STOP=1 "$@"
}
cleanup() {
  docker_local stop --time 3 "$test_container" >/dev/null 2>&1 || true
  rm -rf "$test_logs"
}
trap cleanup EXIT
# No host ports and no production environment variables are passed through.
docker_local run --rm --detach --name "$test_container" \
  -e POSTGRES_PASSWORD=local-only-budget-tests -e POSTGRES_DB=annual_budget_test \
  postgres:17-alpine >/dev/null
for ((attempt=0; attempt<30; attempt++)); do
  if docker_local exec "$test_container" pg_isready -U postgres -d annual_budget_test >/dev/null 2>&1; then break; fi
  sleep 1
done
psql_local < "$repo_root/tests/annual-budgets/fixture.sql" > "$test_logs/setup.log"
psql_local < "$repo_root/migrations/20261030_annual_budget_plans.sql" >> "$test_logs/setup.log"
# A second application must preserve data/schema and remain safe.
psql_local < "$repo_root/migrations/20261030_annual_budget_plans.sql" >> "$test_logs/setup.log"
psql_local < "$repo_root/tests/annual-budgets/lifecycle.sql"
psql_local -c "INSERT INTO neon_auth.\"user\" VALUES ('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004'); INSERT INTO category VALUES ('u3-cat','00000000-0000-0000-0000-000000000003','Food'),('u4-cat','00000000-0000-0000-0000-000000000004','Food'); INSERT INTO budget(user_id,category,annual_amount) VALUES ('00000000-0000-0000-0000-000000000003','Food',100),('00000000-0000-0000-0000-000000000004','Food',100);" >/dev/null
# Start a competing connection only once the first has visibly acquired the
# write lock; \echo flushes a marker before pg_sleep keeps the transaction open.
wait_for_marker() {
  for ((attempt=0; attempt<100; attempt++)); do
    if rg -q 'LOCK_HELD' "$1"; then return; fi
    sleep 0.05
  done
  cat "$1" >&2
  return 1
}
psql_local > "$test_logs/edit-first.log" <<'SQL' &
BEGIN;
SELECT pebble_patch_current_annual_budgets('00000000-0000-0000-0000-000000000003','{"Food":125}','2026-10-01T00:00Z');
\echo LOCK_HELD
SELECT pg_sleep(2);
COMMIT;
SQL
edit_pid=$!
wait_for_marker "$test_logs/edit-first.log"
psql_local -c "SELECT pebble_save_annual_budget_plan('00000000-0000-0000-0000-000000000003',2027,'UTC','scheduled',NULL,'{\"u3-cat\":150}','{\"u3-cat\":100}','2026-10-01T00:00Z');" > "$test_logs/save-last.log"
wait "$edit_pid"
psql_local > "$test_logs/save-first.log" <<'SQL' &
BEGIN;
SELECT pebble_save_annual_budget_plan('00000000-0000-0000-0000-000000000004',2027,'UTC','scheduled',NULL,'{"u4-cat":150}','{"u4-cat":100}','2026-10-01T00:00Z');
\echo LOCK_HELD
SELECT pg_sleep(2);
COMMIT;
SQL
save_pid=$!
wait_for_marker "$test_logs/save-first.log"
psql_local -c "SELECT pebble_patch_current_annual_budgets('00000000-0000-0000-0000-000000000004','{\"Food\":125}','2026-10-01T00:00Z');" > "$test_logs/edit-last.log"
wait "$save_pid"
psql_local <<'SQL'
DO $$ BEGIN
  ASSERT (SELECT annual_amount FROM annual_budget_plan_item WHERE user_id='00000000-0000-0000-0000-000000000003' AND year=2026 AND category_id='u3-cat')=125;
  ASSERT (SELECT annual_amount FROM annual_budget_plan_item WHERE user_id='00000000-0000-0000-0000-000000000004' AND year=2026 AND category_id='u4-cat')=125;
  RAISE NOTICE 'PASS: concurrent current edit and first annual save preserve the edit in both lock acquisition orders';
END $$;
SQL
printf 'PASS: additive migration rerun, lifecycle, tenant isolation, and concurrency. No production service contacted.\n'

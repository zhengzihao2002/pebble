#!/usr/bin/env bash
# Disposable local PostgreSQL. Never reads DATABASE_URL or production credentials.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_container="pebble-ghost-test-$$-${RANDOM}"
docker_local() {
 env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
 docker --host=unix:///var/run/docker.sock "$@"
}
psql_local() { docker_local exec -i "$test_container" psql -U postgres -d ghost_test -v ON_ERROR_STOP=1 "$@"; }
cleanup() { docker_local stop --time 3 "$test_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker_local run --rm --detach --network none --name "$test_container" -e POSTGRES_PASSWORD=local-only-ghost-tests -e POSTGRES_DB=ghost_test postgres:17-alpine >/dev/null
for ((attempt=0; attempt<30; attempt++)); do
 if docker_local logs "$test_container" 2>&1 | rg -q 'PostgreSQL init process complete'; then
   if docker_local exec "$test_container" pg_isready -U postgres -d ghost_test >/dev/null 2>&1; then break; fi
 fi
 sleep 1
done
psql_local < "$repo_root/tests/ghost-accounts/fixture.sql" >/dev/null
psql_local < "$repo_root/migrations/20261117_ghost_accounts.sql" >/dev/null
psql_local < "$repo_root/migrations/20261117_ghost_accounts.sql" >/dev/null
psql_local < "$repo_root/tests/ghost-accounts/lifecycle.sql" >/dev/null
# A rerun must preserve the user's explicit ghost flag and all ledger rows.
psql_local < "$repo_root/migrations/20261117_ghost_accounts.sql" >/dev/null
psql_local -c "DO \$\$ BEGIN ASSERT (SELECT is_ghost FROM account WHERE id='cash'); ASSERT (SELECT count(*) FROM account)=3; END \$\$;" >/dev/null
printf 'PASS: additive migration, reruns, ledger preservation, independent status, tenant boundaries, preferred constraint and goal funding.\n'

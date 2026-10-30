#!/usr/bin/env bash
# App-to-database integration tests: rebuilds the throwaway `hrms_test` database (the only one that honours the test clock),
# applies db/migrations, loads the shared fixtures (clock fixed at Fri 16 Oct 2026 12:00 IST), then runs src/**/*.int.test.ts
# against it as the limited runtime login, exactly like production. Needs local Postgres 16.
set -euo pipefail
cd "$(dirname "$0")/.."
export PGHOST="${PGHOST:-127.0.0.1}" PGUSER="${PGUSER:-dev_admin}" PGPASSWORD="${PGPASSWORD:-dev_only_local}"

psql -d postgres -qc "drop database if exists hrms_test" -c "create database hrms_test owner $PGUSER"
for f in db/migrations/*.sql; do psql -d hrms_test -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v NOTICE || true; done
psql -d hrms_test -v ON_ERROR_STOP=1 -q -f db/tests/_fixtures.inc 2>&1 | grep -v NOTICE || true
psql -d hrms_test -qc "alter database hrms_test set app.test_now = '2026-10-16 12:00:00+05:30'" -c "alter role app_runtime with login password 'int_pw'"

export DATABASE_URL="postgres://app_runtime:int_pw@$PGHOST/hrms_test"
export DATABASE_URL_ADMIN="postgres://$PGUSER:$PGPASSWORD@$PGHOST/hrms_test"
npx vitest run --config vitest.int.config.ts "$@"

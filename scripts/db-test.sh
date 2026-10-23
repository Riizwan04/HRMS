#!/usr/bin/env bash
# Rebuilds the throwaway test database (name must be hrms_test: it enables the test clock) and runs pgTAP.
# Needs a local Postgres with pgTAP and pg_prove. Connection: PGHOST/PGUSER/PGPASSWORD (defaults below are
# the throwaway local-only dev credentials, never real ones).
set -euo pipefail
cd "$(dirname "$0")/.."
export PGHOST="${PGHOST:-127.0.0.1}" PGUSER="${PGUSER:-dev_admin}" PGPASSWORD="${PGPASSWORD:-dev_only_local}"

psql -d postgres -qc "drop database if exists hrms_test" -c "create database hrms_test owner $PGUSER"
# pgTAP first: our migrations revoke default PUBLIC execute, which would otherwise lock pgTAP's own functions.
psql -d hrms_test -v ON_ERROR_STOP=1 -qc "create extension if not exists pgtap"
for f in db/migrations/*.sql; do
  psql -d hrms_test -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v NOTICE || true
done

pg_prove -d hrms_test --ext .sql "${@:-db/tests}"

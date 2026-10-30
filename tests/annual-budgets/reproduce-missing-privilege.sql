\set ON_ERROR_STOP on
-- Simulate the original migration creating editor-owned tables without a
-- runtime-role grant. This is a synthetic local database, never production.
REVOKE ALL PRIVILEGES ON annual_budget_plan, annual_budget_plan_item FROM pebble_app;
SET ROLE pebble_app;
DO $$
BEGIN
  ASSERT current_user='pebble_app';
  BEGIN
    PERFORM year FROM annual_budget_plan LIMIT 1;
    RAISE EXCEPTION 'The original permission regression was not reproduced';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: reproduced SQLSTATE 42501 permission denied for restricted app role before repair';
  END;
END $$;
RESET ROLE;

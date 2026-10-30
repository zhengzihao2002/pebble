\set ON_ERROR_STOP on
SET ROLE pebble_app;
DO $$
DECLARE row_count integer;
BEGIN
  ASSERT current_user='pebble_app';
  ASSERT NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user);
  ASSERT has_table_privilege(current_user,'annual_budget_plan','SELECT,INSERT,UPDATE,DELETE');
  ASSERT has_table_privilege(current_user,'annual_budget_plan_item','SELECT,INSERT,UPDATE,DELETE');
  ASSERT NOT has_table_privilege(current_user,'annual_budget_plan','TRUNCATE,REFERENCES,TRIGGER');
  ASSERT NOT has_table_privilege(current_user,'annual_budget_plan_item','TRUNCATE,REFERENCES,TRIGGER');
  ASSERT has_sequence_privilege(current_user,'annual_budget_plan_revision_seq','USAGE');
  ASSERT NOT has_sequence_privilege(current_user,'annual_budget_plan_revision_seq','SELECT,UPDATE');
  ASSERT has_function_privilege(current_user,'pebble_save_annual_budget_plan(uuid,integer,text,text,integer,jsonb,jsonb,timestamptz)','EXECUTE');
  ASSERT has_function_privilege(current_user,'pebble_cancel_annual_budget_plan(uuid,integer,integer,timestamptz)','EXECUTE');
  ASSERT has_function_privilege(current_user,'pebble_patch_current_annual_budgets(uuid,jsonb,timestamptz)','EXECUTE');
  -- Exact shapes used by dashboard/getBudgets and planner reads. No owner
  -- connection may mask a missing table privilege on either path.
  SELECT count(*) INTO row_count FROM (
    SELECT year,state,time_zone,revision,updated_at,effective_at
      FROM annual_budget_plan
      WHERE user_id='00000000-0000-0000-0000-000000000001'
      ORDER BY year DESC
  ) plans;
  SELECT count(*) INTO row_count FROM (
    SELECT i.category_id,i.category_name,i.annual_amount,i.base_amount,c.name
      FROM annual_budget_plan_item i
      LEFT JOIN category c ON c.id=i.category_id AND c.user_id=i.user_id
      WHERE i.user_id='00000000-0000-0000-0000-000000000001' AND i.year=2027
  ) items;
  RAISE NOTICE 'PASS: restricted pebble_app role has narrowly scoped annual-budget privileges and dashboard/planner reads succeed';
END $$;
RESET ROLE;

-- Repair access for Pebble's existing restricted application role.
-- Grants apply ONLY to the new annual-planning objects; no data is changed.
BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.annual_budget_plan, public.annual_budget_plan_item
  TO pebble_app;
GRANT USAGE ON SEQUENCE public.annual_budget_plan_revision_seq TO pebble_app;
GRANT EXECUTE ON FUNCTION
  public.pebble_save_annual_budget_plan(uuid, integer, text, text, integer, jsonb, jsonb, timestamptz),
  public.pebble_cancel_annual_budget_plan(uuid, integer, integer, timestamptz),
  public.pebble_patch_current_annual_budgets(uuid, jsonb, timestamptz)
  TO pebble_app;
COMMIT;
-- END OF ANNUAL BUDGET PERMISSIONS REPAIR

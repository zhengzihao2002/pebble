\set ON_ERROR_STOP on
DO $$
DECLARE
  u uuid := '00000000-0000-0000-0000-000000000001';
  u2 uuid := '00000000-0000-0000-0000-000000000002';
  amounts jsonb := '{"u1-food":1500,"u1-rent":12000,"u1-extra":0}';
  base jsonb := '{"u1-food":1200,"u1-rent":12000,"u1-extra":0}';
  r jsonb; n integer; v numeric; yr integer; rev integer; stale integer;
BEGIN
  r := pebble_save_annual_budget_plan(u,2027,'America/New_York','draft',NULL,amounts,base,'2026-10-01T12:00:00Z');
  ASSERT r->>'ok'='true', r::text;
  rev := (r#>>'{plan,revision}')::integer; ASSERT rev>0;
  SELECT COUNT(*) INTO n FROM annual_budget_plan WHERE user_id=u; ASSERT n=2;
  SELECT annual_amount INTO v FROM annual_budget_plan_item WHERE user_id=u AND year=2026 AND category_id='u1-food'; ASSERT v=1200;
  ASSERT NOT EXISTS(SELECT 1 FROM annual_budget_plan WHERE user_id=u2);
  r := pebble_save_annual_budget_plan(u,2027,'America/New_York','scheduled',NULL,amounts,base,'2026-10-01T12:00:00Z');
  ASSERT r->>'reason'='conflict', r::text;
  r := pebble_save_annual_budget_plan(u,2027,'America/New_York','scheduled',rev,amounts,base,'2026-10-01T12:00:00Z');
  ASSERT r->>'ok'='true',r::text; stale:=rev;rev:=(r#>>'{plan,revision}')::integer;ASSERT rev>stale;
  SELECT year INTO yr FROM annual_budget_plan WHERE user_id=u AND state='scheduled' AND effective_at<='2027-01-01T04:59:59Z' ORDER BY year DESC LIMIT 1; ASSERT yr=2026;
  SELECT year INTO yr FROM annual_budget_plan WHERE user_id=u AND state='scheduled' AND effective_at<='2027-01-01T05:00:00Z' ORDER BY year DESC LIMIT 1; ASSERT yr=2027;
  ASSERT pebble_patch_current_annual_budgets(u,'{"Food":1300}','2026-12-01T12:00Z');
  SELECT annual_amount INTO v FROM annual_budget_plan_item WHERE user_id=u AND year=2026 AND category_id='u1-food'; ASSERT v=1300;
  SELECT annual_amount INTO v FROM annual_budget_plan_item WHERE user_id=u AND year=2027 AND category_id='u1-food'; ASSERT v=1500;
  SELECT annual_amount INTO v FROM budget WHERE user_id=u AND category='Food'; ASSERT v=1200;
  ASSERT pebble_patch_current_annual_budgets(u2,'{"Food":2500}','2026-12-01T12:00Z');
  r := pebble_save_annual_budget_plan(u,2027,'America/New_York','scheduled',stale,amounts,base,'2026-12-01T12:00Z'); ASSERT r->>'reason'='conflict';
  r := pebble_save_annual_budget_plan(u,2027,'America/New_York','scheduled',rev,amounts||'{"u2-food":100}',base,'2026-12-01T12:00Z'); ASSERT r->>'reason'='conflict';
  r := pebble_save_annual_budget_plan(u,2027,'America/New_York','scheduled',rev,amounts||'{"u1-food":-1}',base,'2026-12-01T12:00Z'); ASSERT r->>'reason'='validation';
  r := pebble_save_annual_budget_plan(u,2027,'America/New_York','scheduled',rev,amounts||'{"u1-food":1.001}',base,'2026-12-01T12:00Z'); ASSERT r->>'reason'='validation';
  r := pebble_save_annual_budget_plan(u,2027,'America/New_York','scheduled',rev,amounts,base,'2027-01-01T05:00Z'); ASSERT r->>'reason'='year';
  r := pebble_cancel_annual_budget_plan(u,2027,rev,'2027-01-01T05:00Z'); ASSERT r->>'reason'='year';
  ASSERT pebble_patch_current_annual_budgets(u,'{"Food":1600,"Extra":0}','2027-06-01T12:00Z');
  SELECT annual_amount INTO v FROM annual_budget_plan_item WHERE user_id=u AND year=2026 AND category_id='u1-food'; ASSERT v=1300;
  r := pebble_save_annual_budget_plan(u,2028,'America/New_York','scheduled',NULL,amounts,base,'2027-10-01T12:00Z'); ASSERT r->>'ok'='true',r::text; rev:=(r#>>'{plan,revision}')::integer;
  r := pebble_cancel_annual_budget_plan(u,2028,999,'2027-10-01T12:00Z'); ASSERT r->>'reason'='conflict';
  r := pebble_cancel_annual_budget_plan(u2,2028,1,'2027-10-01T12:00Z'); ASSERT r->>'reason'='conflict';
  ASSERT EXISTS(SELECT 1 FROM annual_budget_plan WHERE user_id=u AND year=2028);
  r := pebble_cancel_annual_budget_plan(u,2028,rev,'2027-10-01T12:00Z'); ASSERT r->>'ok'='true';
  ASSERT NOT EXISTS(SELECT 1 FROM annual_budget_plan_item WHERE user_id=u AND year=2028);
  -- A cancelled and recreated plan gets a new revision (no ABA stale-tab hole).
  stale:=rev;
  r := pebble_save_annual_budget_plan(u,2028,'America/New_York','scheduled',NULL,amounts,base,'2027-10-01T12:00Z');ASSERT r->>'ok'='true';rev:=(r#>>'{plan,revision}')::integer;ASSERT rev>stale;
  r := pebble_save_annual_budget_plan(u,2028,'America/New_York','scheduled',stale,amounts,base,'2027-10-01T12:00Z');ASSERT r->>'reason'='conflict';
  r := pebble_cancel_annual_budget_plan(u,2028,stale,'2027-10-01T12:00Z');ASSERT r->>'reason'='conflict';
  r := pebble_cancel_annual_budget_plan(u,2028,rev,'2027-10-01T12:00Z');ASSERT r->>'ok'='true';
  ASSERT EXISTS(SELECT 1 FROM annual_budget_plan WHERE user_id=u AND year=2027);
  -- No 2028 plan: editing carried-forward budgets snapshots 2028, preserving 2027.
  ASSERT pebble_patch_current_annual_budgets(u,'{"Food":1700}','2028-03-01T12:00Z');
  SELECT annual_amount INTO v FROM annual_budget_plan_item WHERE user_id=u AND year=2027 AND category_id='u1-food'; ASSERT v=1600;
  SELECT annual_amount INTO v FROM annual_budget_plan_item WHERE user_id=u AND year=2028 AND category_id='u1-food'; ASSERT v=1700;
  r := pebble_save_annual_budget_plan(u,2029,'America/New_York','scheduled',NULL,amounts,base,'2028-10-01T12:00Z'); ASSERT r->>'ok'='true',r::text;rev:=(r#>>'{plan,revision}')::integer;
  SELECT year INTO yr FROM annual_budget_plan WHERE user_id=u AND state='scheduled' AND effective_at<='2029-01-01T05:00Z' ORDER BY year DESC LIMIT 1; ASSERT yr=2029;
  -- A category change while planning requires review, not silent row loss.
  INSERT INTO category VALUES('u1-new',u,'New category');
  r := pebble_save_annual_budget_plan(u,2029,'America/New_York','draft',rev,amounts,base,'2028-10-01T12:00Z'); ASSERT r->>'reason'='conflict';
  UPDATE category SET name='Groceries' WHERE id='u1-food';
  ASSERT pebble_patch_current_annual_budgets(u,'{"Groceries":1800}','2028-12-01T12:00Z');
  SELECT annual_amount INTO v FROM annual_budget_plan_item WHERE user_id=u AND year=2028 AND category_id='u1-food'; ASSERT v=1800;
  DELETE FROM category WHERE id='u1-food';
  ASSERT EXISTS(SELECT 1 FROM annual_budget_plan_item WHERE user_id=u AND year=2027 AND category_id='u1-food');
  SELECT SUM(annual_amount) INTO v FROM budget WHERE user_id=u; ASSERT v=13200;
  SELECT annual_amount INTO v FROM budget WHERE user_id=u2 AND category='Food'; ASSERT v=2500;
  -- A failing write rolls back both its header and items.
  BEGIN
    PERFORM pebble_patch_current_annual_budgets(u,'{"New category":-5}','2028-12-01T12:00Z');
    RAISE EXCEPTION 'negative should fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  ASSERT NOT EXISTS(SELECT 1 FROM annual_budget_plan_item WHERE annual_amount<0);
  RAISE NOTICE 'PASS: annual plans 2027/2028/2029, frozen Jan1 timezone, carry-forward, zero amounts, revision guards, category changes, tenant isolation, cancellation, atomic rollback; legacy budgets unchanged';
END $$;

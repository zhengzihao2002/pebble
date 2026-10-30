-- Additive migration. Review and run in the Neon SQL Editor before enabling
-- annual planning. Existing budget rows and all transaction tables are untouched.
-- COPY THE WHOLE FILE, including every function body and the final COMMIT.
-- In the SQL Editor, select all SQL before running; a selected fragment fails.
BEGIN;
-- Monotonic revisions prevent a cancelled/recreated plan from accepting an old tab.
CREATE SEQUENCE IF NOT EXISTS annual_budget_plan_revision_seq AS integer;
CREATE TABLE IF NOT EXISTS annual_budget_plan (
  user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 9999),
  state text NOT NULL CHECK (state IN ('draft', 'scheduled')),
  time_zone text NOT NULL,
  effective_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT nextval('annual_budget_plan_revision_seq') CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, year)
);
CREATE INDEX IF NOT EXISTS annual_budget_plan_effective_idx
  ON annual_budget_plan (user_id, effective_at DESC) WHERE state = 'scheduled';
CREATE TABLE IF NOT EXISTS annual_budget_plan_item (
  user_id uuid NOT NULL,
  year integer NOT NULL,
  -- Deliberately not a category FK: removing a category must not erase history.
  category_id text NOT NULL,
  category_name text NOT NULL,
  annual_amount numeric(12,2) NOT NULL CHECK (annual_amount >= 0),
  base_amount numeric(12,2) NOT NULL CHECK (base_amount >= 0),
  PRIMARY KEY (user_id, year, category_id),
  FOREIGN KEY (user_id, year) REFERENCES annual_budget_plan(user_id, year) ON DELETE CASCADE
);

-- SECURITY INVOKER (the default): these do not elevate the caller's privileges.
-- Application calls always derive p_user from the authenticated session.
CREATE OR REPLACE FUNCTION pebble_save_annual_budget_plan(
  p_user uuid, p_year integer, p_zone text, p_state text, p_revision integer,
  p_amounts jsonb, p_base jsonb, p_now timestamptz DEFAULT CURRENT_TIMESTAMP
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_current integer; v_old annual_budget_plan%ROWTYPE;
  v_source integer; v_baseline integer; v_revision integer; v_updated timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pebble.user-write'), hashtext(p_user::text));
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_zone)
    OR p_state NOT IN ('draft','scheduled')
    OR jsonb_typeof(p_amounts) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_base) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('ok',false,'reason','validation');
  END IF;
  v_current := EXTRACT(YEAR FROM p_now AT TIME ZONE p_zone)::integer;
  IF p_year <> v_current + 1 OR p_year > 9999 THEN
    RETURN jsonb_build_object('ok',false,'reason','year');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_amounts) a WHERE jsonb_typeof(a.value) <> 'number')
    OR EXISTS (SELECT 1 FROM jsonb_each(p_base) a WHERE jsonb_typeof(a.value) <> 'number') THEN
    RETURN jsonb_build_object('ok',false,'reason','validation');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_amounts) a WHERE a.value::numeric < 0 OR a.value::numeric > 9999999999.99 OR round(a.value::numeric,2) <> a.value::numeric)
    OR EXISTS (SELECT 1 FROM jsonb_each_text(p_base) a WHERE a.value::numeric < 0 OR a.value::numeric > 9999999999.99 OR round(a.value::numeric,2) <> a.value::numeric) THEN
    RETURN jsonb_build_object('ok',false,'reason','validation');
  END IF;
  -- Exact category sets catch deleted/new categories while a planner tab was open.
  IF (SELECT COUNT(*) FROM category WHERE user_id=p_user) <> (SELECT COUNT(*) FROM jsonb_object_keys(p_amounts))
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_amounts) k WHERE NOT EXISTS (SELECT 1 FROM category c WHERE c.user_id=p_user AND c.id=k))
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_amounts) k) IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_base) k) THEN
    RETURN jsonb_build_object('ok',false,'reason','conflict');
  END IF;
  SELECT * INTO v_old FROM annual_budget_plan WHERE user_id=p_user AND year=p_year;
  IF (FOUND AND (p_revision IS NULL OR v_old.revision <> p_revision))
    OR (NOT FOUND AND p_revision IS NOT NULL) THEN
    RETURN jsonb_build_object('ok',false,'reason','conflict');
  END IF;
  -- Save a real current-year baseline once. No fabricated budgets for earlier years.
  SELECT year INTO v_source FROM annual_budget_plan
    WHERE user_id=p_user AND state='scheduled' AND effective_at<=p_now AND year<=v_current
    ORDER BY year DESC LIMIT 1;
  INSERT INTO annual_budget_plan(user_id,year,state,time_zone,effective_at)
    VALUES(p_user,v_current,'scheduled',p_zone,make_timestamptz(v_current,1,1,0,0,0,p_zone))
    ON CONFLICT(user_id,year) DO NOTHING RETURNING year INTO v_baseline;
  IF v_baseline IS NOT NULL THEN
    INSERT INTO annual_budget_plan_item(user_id,year,category_id,category_name,annual_amount,base_amount)
      SELECT p_user,v_current,c.id,c.name,
        CASE WHEN v_source IS NOT NULL THEN COALESCE(i.annual_amount,0) ELSE COALESCE(b.annual_amount,0) END,
        CASE WHEN v_source IS NOT NULL THEN COALESCE(i.annual_amount,0) ELSE COALESCE(b.annual_amount,0) END
      FROM category c
      LEFT JOIN annual_budget_plan_item i ON i.user_id=p_user AND i.year=v_source AND i.category_id=c.id
      LEFT JOIN budget b ON b.user_id=p_user AND b.category=c.name
      WHERE c.user_id=p_user;
  END IF;
  INSERT INTO annual_budget_plan(user_id,year,state,time_zone,effective_at)
    VALUES(p_user,p_year,p_state,p_zone,make_timestamptz(p_year,1,1,0,0,0,p_zone))
    ON CONFLICT(user_id,year) DO UPDATE SET state=EXCLUDED.state,time_zone=EXCLUDED.time_zone,
      effective_at=EXCLUDED.effective_at,revision=nextval('annual_budget_plan_revision_seq'),updated_at=p_now
    RETURNING revision,updated_at INTO v_revision,v_updated;
  DELETE FROM annual_budget_plan_item WHERE user_id=p_user AND year=p_year;
  INSERT INTO annual_budget_plan_item(user_id,year,category_id,category_name,annual_amount,base_amount)
    SELECT p_user,p_year,c.id,c.name,(p_amounts->>c.id)::numeric,(p_base->>c.id)::numeric
    FROM category c WHERE c.user_id=p_user;
  RETURN jsonb_build_object('ok',true,'plan',jsonb_build_object(
    'year',p_year,'state',p_state,'timeZone',p_zone,'revision',v_revision,
    'amounts',p_amounts,'baseAmounts',p_base,'updatedAt',v_updated));
END $$;

CREATE OR REPLACE FUNCTION pebble_cancel_annual_budget_plan(
  p_user uuid,p_year integer,p_revision integer,p_now timestamptz DEFAULT CURRENT_TIMESTAMP
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_plan annual_budget_plan%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pebble.user-write'), hashtext(p_user::text));
  SELECT * INTO v_plan FROM annual_budget_plan WHERE user_id=p_user AND year=p_year;
  IF NOT FOUND OR v_plan.revision IS DISTINCT FROM p_revision THEN
    RETURN jsonb_build_object('ok',false,'reason','conflict');
  END IF;
  IF p_year <> EXTRACT(YEAR FROM p_now AT TIME ZONE v_plan.time_zone)::integer + 1 OR v_plan.effective_at<=p_now THEN
    RETURN jsonb_build_object('ok',false,'reason','year');
  END IF;
  DELETE FROM annual_budget_plan WHERE user_id=p_user AND year=p_year;
  RETURN jsonb_build_object('ok',true,'plan',NULL);
END $$;

CREATE OR REPLACE FUNCTION pebble_patch_current_annual_budgets(
  p_user uuid,p_amounts jsonb,p_now timestamptz DEFAULT CURRENT_TIMESTAMP
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_plan annual_budget_plan%ROWTYPE; v_year integer; v_created integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pebble.user-write'), hashtext(p_user::text));
  IF jsonb_typeof(p_amounts) IS DISTINCT FROM 'object'
    OR EXISTS (SELECT 1 FROM jsonb_each(p_amounts) a WHERE jsonb_typeof(a.value)<>'number') THEN
    RAISE EXCEPTION 'Invalid budget amounts' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_amounts) a WHERE a.value::numeric<0 OR a.value::numeric>9999999999.99 OR round(a.value::numeric,2)<>a.value::numeric)
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_amounts) k WHERE NOT EXISTS (SELECT 1 FROM category WHERE user_id=p_user AND name=k)) THEN
    RAISE EXCEPTION 'Invalid budget category or amount' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_plan FROM annual_budget_plan
    WHERE user_id=p_user AND state='scheduled' AND effective_at<=p_now ORDER BY year DESC LIMIT 1;
  IF NOT FOUND THEN
    -- The old current-budget writer runs under this SAME lock. Otherwise a
    -- concurrent first annual save could snapshot amounts before this edit.
    DELETE FROM budget b USING jsonb_each_text(p_amounts) a
      WHERE b.user_id=p_user AND b.category=a.key AND a.value::numeric=0;
    INSERT INTO budget(user_id,category,annual_amount)
      SELECT p_user,a.key,a.value::numeric FROM jsonb_each_text(p_amounts) a WHERE a.value::numeric>0
      ON CONFLICT(user_id,category) DO UPDATE SET annual_amount=EXCLUDED.annual_amount,updated_at=p_now;
    RETURN true;
  END IF;
  v_year := EXTRACT(YEAR FROM p_now AT TIME ZONE v_plan.time_zone)::integer;
  INSERT INTO annual_budget_plan(user_id,year,state,time_zone,effective_at)
    VALUES(p_user,v_year,'scheduled',v_plan.time_zone,make_timestamptz(v_year,1,1,0,0,0,v_plan.time_zone))
    ON CONFLICT(user_id,year) DO NOTHING RETURNING year INTO v_created;
  IF v_created IS NOT NULL THEN
    INSERT INTO annual_budget_plan_item(user_id,year,category_id,category_name,annual_amount,base_amount)
      SELECT user_id,v_year,category_id,category_name,annual_amount,annual_amount
      FROM annual_budget_plan_item WHERE user_id=p_user AND year=v_plan.year;
  ELSIF EXISTS (SELECT 1 FROM annual_budget_plan WHERE user_id=p_user AND year=v_year AND state='draft') THEN
    -- An unscheduled draft from a past year never becomes authoritative.
    DELETE FROM annual_budget_plan_item WHERE user_id=p_user AND year=v_year;
    INSERT INTO annual_budget_plan_item(user_id,year,category_id,category_name,annual_amount,base_amount)
      SELECT user_id,v_year,category_id,category_name,annual_amount,annual_amount
      FROM annual_budget_plan_item WHERE user_id=p_user AND year=v_plan.year;
  END IF;
  INSERT INTO annual_budget_plan_item(user_id,year,category_id,category_name,annual_amount,base_amount)
    SELECT p_user,v_year,c.id,c.name,a.value::numeric,COALESCE(old.annual_amount,0)
      FROM jsonb_each_text(p_amounts) a JOIN category c ON c.user_id=p_user AND c.name=a.key
      LEFT JOIN annual_budget_plan_item old ON old.user_id=p_user AND old.year=v_year AND old.category_id=c.id
    ON CONFLICT(user_id,year,category_id) DO UPDATE SET annual_amount=EXCLUDED.annual_amount,category_name=EXCLUDED.category_name;
  UPDATE annual_budget_plan SET state='scheduled',revision=nextval('annual_budget_plan_revision_seq'),updated_at=p_now WHERE user_id=p_user AND year=v_year;
  RETURN true;
END $$;
-- The SQL Editor owner differs from the app connection role.
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
-- END OF COMPLETE ANNUAL BUDGET MIGRATION

BEGIN;

-- 1. relax last4 rule so seeded defaults can be honestly typed ------------
-- User-created bank accounts still require 4 digits; the pre-existing
-- default Checking predates that requirement and has none on record.
ALTER TABLE account DROP CONSTRAINT account_last4_check;

ALTER TABLE account ADD CONSTRAINT account_last4_check CHECK (
  (kind = 'bank' AND (is_default OR (last4 IS NOT NULL AND last4 ~ '^[0-9]{4}$')))
  OR (kind = 'cash' AND last4 IS NULL)
);

-- 2. correct the seeded Checking accounts to their true kind -------------
UPDATE account SET kind = 'bank', updated_at = now()
WHERE is_default AND name = 'Checking';

-- 3. lock account_id in as structural ------------------------------------
ALTER TABLE expense            ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE income             ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE recurring_rule     ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE balance_adjustment ALTER COLUMN account_id SET NOT NULL;

-- RESTRICT, not CASCADE: deleting an account must never silently delete
-- financial history. Closure is a status change; the app enforces the
-- zero-balance rule, and the database refuses any hard delete that would
-- orphan transactions.
ALTER TABLE expense ADD CONSTRAINT expense_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE RESTRICT;
ALTER TABLE income ADD CONSTRAINT income_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE RESTRICT;
ALTER TABLE recurring_rule ADD CONSTRAINT recurring_rule_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE RESTRICT;
ALTER TABLE balance_adjustment ADD CONSTRAINT balance_adjustment_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE RESTRICT;

-- 4. indexes for the per-account queries the balance model will run ------
CREATE INDEX expense_account_idx            ON expense (account_id);
CREATE INDEX income_account_idx             ON income (account_id);
CREATE INDEX recurring_rule_account_idx     ON recurring_rule (account_id);
CREATE INDEX balance_adjustment_account_idx ON balance_adjustment (account_id);

COMMIT;

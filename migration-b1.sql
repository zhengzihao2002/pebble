BEGIN;

-- 1. accounts table -------------------------------------------------------
CREATE TABLE account (
  id              text PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  name            text NOT NULL,
  kind            text NOT NULL,
  last4           text,
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'active',
  is_default      boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_kind_check   CHECK (kind = ANY (ARRAY['bank','cash'])),
  CONSTRAINT account_status_check CHECK (status = ANY (ARRAY['active','closed'])),
  -- last4 required for bank, forbidden for cash (Phase A, Q2)
  CONSTRAINT account_last4_check CHECK (
    (kind = 'bank' AND last4 IS NOT NULL AND last4 ~ '^[0-9]{4}$')
    OR (kind = 'cash' AND last4 IS NULL)
  )
);

CREATE INDEX account_user_idx ON account (user_id);

-- Same name reusable only once the previous one is closed (Phase A addendum 5)
CREATE UNIQUE INDEX account_user_name_active_uniq
  ON account (user_id, name) WHERE status = 'active';

-- 2. seed the two defaults per existing user ------------------------------
-- Sourced from user_account so existing opening balances carry over intact.
-- Defaults are kind='cash'-exempt from last4: Checking is seeded as 'cash'
-- kind deliberately - it has no last4 and must satisfy account_last4_check.
INSERT INTO account (id, user_id, name, kind, last4, opening_balance, is_default, sort_order)
SELECT 'acct_chk_' || ua.user_id::text, ua.user_id, 'Checking', 'cash', NULL,
       ua.checking_opening, true, 0
FROM user_account ua;

INSERT INTO account (id, user_id, name, kind, last4, opening_balance, is_default, sort_order)
SELECT 'acct_cash_' || ua.user_id::text, ua.user_id, 'Cash', 'cash', NULL,
       ua.cash_opening, true, 1
FROM user_account ua;

-- 3. nullable account_id on the four tables (catalog-only, no rewrite) ----
ALTER TABLE expense            ADD COLUMN account_id text NULL;
ALTER TABLE income             ADD COLUMN account_id text NULL;
ALTER TABLE recurring_rule     ADD COLUMN account_id text NULL;
ALTER TABLE balance_adjustment ADD COLUMN account_id text NULL;

-- 4. backfill from payment_method ----------------------------------------
UPDATE expense e SET account_id = a.id
FROM account a
WHERE a.user_id = e.user_id AND a.name = e.payment_method AND a.is_default;

UPDATE income i SET account_id = a.id
FROM account a
WHERE a.user_id = i.user_id AND a.name = i.payment_method AND a.is_default;

UPDATE recurring_rule r SET account_id = a.id
FROM account a
WHERE a.user_id = r.user_id AND a.name = r.payment_method AND a.is_default;

UPDATE balance_adjustment b SET account_id = a.id
FROM account a
WHERE a.user_id = b.user_id AND a.name = b.payment_method AND a.is_default;

-- 5. drop the CHECK constraints that forbid non-default account names -----
ALTER TABLE expense            DROP CONSTRAINT expense_payment_method_check;
ALTER TABLE income             DROP CONSTRAINT income_payment_method_check;
ALTER TABLE recurring_rule     DROP CONSTRAINT recurring_rule_payment_method_check;
ALTER TABLE balance_adjustment DROP CONSTRAINT balance_adjustment_payment_method_check;

COMMIT;

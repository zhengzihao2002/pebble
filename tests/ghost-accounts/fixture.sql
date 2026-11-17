CREATE TABLE account (
  id text PRIMARY KEY, user_id uuid NOT NULL, name text NOT NULL,
  status text NOT NULL DEFAULT 'active', is_default boolean NOT NULL DEFAULT false,
  is_preferred boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX preferred_unique ON account(user_id) WHERE is_preferred;
CREATE TABLE expense(id text PRIMARY KEY, user_id uuid NOT NULL, account_id text NOT NULL REFERENCES account(id), amount numeric(12,2));
CREATE TABLE income(id text PRIMARY KEY, user_id uuid NOT NULL, account_id text NOT NULL REFERENCES account(id), net_amount numeric(12,2));
CREATE TABLE balance_adjustment(id text PRIMARY KEY, user_id uuid NOT NULL, account_id text NOT NULL REFERENCES account(id), amount numeric(12,2));
CREATE TABLE goal(id text PRIMARY KEY, user_id uuid NOT NULL, current_amount numeric(12,2), target_amount numeric(12,2));
INSERT INTO account VALUES
 ('checking','00000000-0000-0000-0000-000000000001','Checking','active',true,true),
 ('cash','00000000-0000-0000-0000-000000000001','Cash','active',true,false),
 ('other-user','00000000-0000-0000-0000-000000000002','Checking','active',true,true);
INSERT INTO expense VALUES ('expense-1','00000000-0000-0000-0000-000000000001','checking',-20),('expense-g','00000000-0000-0000-0000-000000000001','cash',-100);
INSERT INTO income VALUES ('income-1','00000000-0000-0000-0000-000000000001','checking',100),('income-g','00000000-0000-0000-0000-000000000001','cash',1000);
INSERT INTO balance_adjustment VALUES ('adjustment-1','00000000-0000-0000-0000-000000000001','checking',10),('adjustment-g','00000000-0000-0000-0000-000000000001','cash',1000);
INSERT INTO goal VALUES ('goal-1','00000000-0000-0000-0000-000000000001',25,500);

DO $$ BEGIN
 ASSERT (SELECT count(*) FROM account)=3;
 ASSERT NOT EXISTS(SELECT 1 FROM account WHERE is_ghost), 'Existing accounts must remain regular';
 ASSERT (SELECT is_preferred FROM account WHERE id='checking');
END $$;
-- This is the same atomic update as the account-mode action: no status/default
-- changes and no ledger rewrite, even when switching a seeded account.
UPDATE account SET is_ghost=true,is_preferred=false WHERE user_id='00000000-0000-0000-0000-000000000001' AND id='checking';
DO $$ BEGIN
 ASSERT (SELECT is_ghost AND NOT is_preferred AND is_default AND status='active' FROM account WHERE id='checking');
 ASSERT NOT (SELECT is_ghost FROM account WHERE id='other-user');
 BEGIN
   UPDATE account SET is_preferred=true WHERE id='checking';
   RAISE EXCEPTION 'Ghost preference constraint was not enforced';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
UPDATE account SET is_ghost=false WHERE id='checking';
UPDATE account SET is_ghost=true WHERE id='cash';
DO $$
DECLARE balance numeric;
BEGIN
 SELECT
  (SELECT coalesce(sum(e.amount),0) FROM expense e JOIN account a ON a.id=e.account_id AND a.user_id=e.user_id WHERE e.user_id='00000000-0000-0000-0000-000000000001' AND NOT a.is_ghost)
 +(SELECT coalesce(sum(i.net_amount),0) FROM income i JOIN account a ON a.id=i.account_id AND a.user_id=i.user_id WHERE i.user_id='00000000-0000-0000-0000-000000000001' AND NOT a.is_ghost)
 +(SELECT coalesce(sum(b.amount),0) FROM balance_adjustment b JOIN account a ON a.id=b.account_id AND a.user_id=b.user_id WHERE b.user_id='00000000-0000-0000-0000-000000000001' AND NOT a.is_ghost)
 INTO balance;
 ASSERT balance=90, 'Ghost ledger must never fund shared goals';
 ASSERT balance-(SELECT sum(current_amount) FROM goal WHERE user_id='00000000-0000-0000-0000-000000000001')=65;
 ASSERT (SELECT count(*) FROM expense)=2 AND (SELECT count(*) FROM income)=2 AND (SELECT count(*) FROM balance_adjustment)=2;
END $$;

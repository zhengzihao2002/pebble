-- Apply only after the new app is deployed. Old paid purchases still post to
-- their funding account until each receipt is converted in this transaction.
BEGIN;
LOCK TABLE public.expense, public.credit_card_payment IN SHARE ROW EXCLUSIVE MODE;

-- Old receipts could be split by moving a paid expense to a different bank.
-- Preserve the amount still present on each funding account separately.
WITH candidates AS MATERIALIZED (
  SELECT e.user_id, e.id AS expense_id, original.id AS card_id, original.name AS card_name,
    e.account_id AS funding_id, e.credit_card_payoff->>'id' AS receipt,
    (e.credit_card_payoff->>'date')::date AS payment_date,
    greatest(0, (e.credit_card_payoff->>'remainingBalance')::numeric) AS remaining,
    e.amount
  FROM public.expense e
  JOIN public.account original ON original.user_id=e.user_id AND original.id=e.credit_card_payoff->>'cardId' AND original.kind='credit'
  JOIN public.account funding ON funding.user_id=e.user_id AND funding.id=e.account_id AND funding.kind IN ('bank', 'cash')
), grouped AS (
  SELECT user_id, card_id, funding_id, receipt, min(payment_date) AS payment_date, max(remaining) AS remaining,
    -sum(amount) AS amount,
    receipt || ':legacy:' || md5(concat_ws(':',user_id,card_id,funding_id)) AS payment_id
  FROM candidates
  GROUP BY user_id, card_id, funding_id, receipt
), inserted AS (
  INSERT INTO public.credit_card_payment(id,user_id,card_id,funding_account_id,payment_date,amount,remaining_balance)
    SELECT payment_id,user_id,card_id,funding_id,payment_date,amount,remaining FROM grouped
  RETURNING id,user_id,funding_account_id,card_id
)
UPDATE public.expense e
SET account_id=c.card_id, payment_method=c.card_name,
    credit_card_payoff=e.credit_card_payoff || jsonb_build_object('id', i.id, 'fundingAccountId', i.funding_account_id)
FROM candidates c
JOIN grouped g USING(user_id,card_id,funding_id,receipt)
JOIN inserted i ON i.id=g.payment_id AND i.user_id=c.user_id
WHERE e.user_id=c.user_id AND e.id=c.expense_id;
COMMIT;

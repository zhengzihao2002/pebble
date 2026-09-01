BEGIN;

-- Convert every non-zero opening_balance into a real, dated, visible
-- balance_adjustment row, then zero the column.
--
-- WHY: an opening balance moves the total with no record anywhere in the
-- transaction list. Every balance movement should have a row explaining it.
--
-- The id uses the LEGACY 'YYYYMMDD_NNNNNNNNN' format deliberately. Two id
-- formats already coexist and compareSameDayIds() handles exactly those two;
-- a third would break same-day ordering.

INSERT INTO balance_adjustment (id, user_id, account_id, description, transaction_date, payment_method, amount)
SELECT
  to_char(seed.adj_date, 'YYYYMMDD') || '_' || lpad((900000000 + row_number() OVER (ORDER BY seed.account_id))::text, 9, '0'),
  seed.user_id,
  seed.account_id,
  'Opening balance',
  seed.adj_date,
  seed.payment_method,
  seed.opening_balance
FROM (
  SELECT
    a.id   AS account_id,
    a.user_id,
    a.opening_balance,
    -- payment_method is NOT NULL with no meaningful value here; carry the
    -- account name so the legacy reconciliation trail stays readable.
    a.name AS payment_method,
    COALESCE(
      (SELECT min(d) FROM (
        SELECT min(transaction_date) AS d FROM expense            WHERE account_id = a.id
        UNION ALL
        SELECT min(transaction_date)      FROM income             WHERE account_id = a.id
        UNION ALL
        SELECT min(transaction_date)      FROM balance_adjustment WHERE account_id = a.id
      ) x) - INTERVAL '1 day',
      CURRENT_DATE
    )::date AS adj_date
  FROM account a
  WHERE a.opening_balance <> 0
) seed;

UPDATE account SET opening_balance = 0, updated_at = now() WHERE opening_balance <> 0;

COMMIT;

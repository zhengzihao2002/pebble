-- Apply before deploying independent credit card payments. Leaves old receipts untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS public.credit_card_payment (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  card_id text NOT NULL REFERENCES public.account(id) ON DELETE NO ACTION,
  funding_account_id text NOT NULL REFERENCES public.account(id) ON DELETE NO ACTION,
  payment_date date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  remaining_balance numeric(14,2) NOT NULL CHECK (remaining_balance >= 0),
  CONSTRAINT credit_card_payment_distinct_accounts_check CHECK (card_id <> funding_account_id)
);
CREATE INDEX IF NOT EXISTS credit_card_payment_user_date_idx ON public.credit_card_payment (user_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS credit_card_payment_card_idx ON public.credit_card_payment (card_id);
CREATE INDEX IF NOT EXISTS credit_card_payment_funding_idx ON public.credit_card_payment (funding_account_id);

-- Two signed postings are calculated on read. Only one payment row is stored.
CREATE OR REPLACE VIEW public.pebble_balance_posting WITH (security_invoker = true) AS
SELECT id, user_id, description, transaction_date, payment_method, account_id,
       transfer_group_id, amount, NULL::jsonb AS card_payment
FROM public.balance_adjustment
UNION ALL
SELECT p.id || ':payoff:' || side.kind, p.user_id, '', p.payment_date, a.name, a.id,
       'payoff:' || p.id, side.amount,
       jsonb_build_object('id', p.id, 'cardId', p.card_id, 'cardName', card.name,
         'fundingAccountId', p.funding_account_id, 'date', p.payment_date, 'remainingBalance', p.remaining_balance)
FROM public.credit_card_payment p
JOIN public.account card ON card.user_id = p.user_id AND card.id = p.card_id
CROSS JOIN LATERAL (VALUES ('card', p.card_id, p.amount), ('funding', p.funding_account_id, -p.amount)) side(kind, account_id, amount)
JOIN public.account a ON a.user_id = p.user_id AND a.id = side.account_id;

GRANT SELECT, INSERT, DELETE ON public.credit_card_payment TO pebble_app;
GRANT SELECT ON public.pebble_balance_posting TO pebble_app;
COMMIT;

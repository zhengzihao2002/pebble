-- Payoff receipt metadata on the existing expense. No ledger rows are added
-- or rewritten. Existing charges and previously paid expenses remain intact.
ALTER TABLE public.expense ADD COLUMN IF NOT EXISTS credit_card_payoff jsonb;

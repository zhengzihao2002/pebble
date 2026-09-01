BEGIN;

-- 1. status: 'closed' -> 'hibernated'
--
-- The semantics changed, not just the label. 'closed' meant settled at zero,
-- permanently, contributing nothing. 'hibernated' means frozen with its
-- balance intact and still counted, and it can be woken. Leaving the old
-- value in place would misdescribe the model to whoever reads it next.
ALTER TABLE account DROP CONSTRAINT account_status_check;

UPDATE account SET status = 'hibernated', updated_at = now() WHERE status = 'closed';

ALTER TABLE account ADD CONSTRAINT account_status_check
  CHECK (status = ANY (ARRAY['active', 'hibernated']));

-- 2. Name uniqueness now covers ALL accounts, not just active ones.
--
-- The partial index existed because closure was terminal: a closed account
-- could never collide with a new one of the same name. Hibernation is
-- reversible, so a hibernated 'BofA' waking alongside an active 'BofA' would
-- produce two identical, indistinguishable accounts.
--
-- Deletion frees a name properly, since it removes the row outright.
DROP INDEX account_user_name_active_uniq;

CREATE UNIQUE INDEX account_user_name_uniq ON account (user_id, name);

COMMIT;

BEGIN;

-- Pairs the two halves of a transfer. Both rows share one id, so deleting
-- either must delete both - otherwise money is created or destroyed.
--
-- NULL means an ordinary standalone adjustment. No backfill: every existing
-- row is standalone by definition.
--
-- A transfer is deliberately TWO balance_adjustment rows rather than its own
-- table: adjustments are already excluded from Reports, already render in the
-- statement, and already flow through the balance derivation. A separate
-- table would mean teaching every one of those paths a fourth record type to
-- reproduce a property this one already has.
ALTER TABLE balance_adjustment ADD COLUMN transfer_group_id text NULL;

CREATE INDEX balance_adjustment_transfer_group_idx
  ON balance_adjustment (transfer_group_id) WHERE transfer_group_id IS NOT NULL;

COMMIT;

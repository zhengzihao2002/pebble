-- Ghost mode is independent of account status. Existing accounts remain regular.
-- Additive and idempotent; the production prebuild runner executes this body
-- in a transaction with short lock and statement timeouts. No records are erased.
BEGIN;
DO $ghost_migration$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pebble.schema'), hashtext('ghost-accounts-v1'));
  -- Skip already-applied DDL entirely, so later builds need no table write lock.
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'account'::regclass AND attname = 'is_ghost' AND NOT attisdropped
  ) THEN
    ALTER TABLE account ADD COLUMN IF NOT EXISTS is_ghost boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'account'::regclass AND conname = 'account_ghost_not_preferred_check'
  ) THEN
    ALTER TABLE account ADD CONSTRAINT account_ghost_not_preferred_check
      CHECK (NOT is_ghost OR NOT is_preferred);
  END IF;
END
$ghost_migration$;
COMMIT;

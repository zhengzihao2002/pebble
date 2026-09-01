BEGIN;

-- Which account a transaction form preselects. Distinct from is_default,
-- which means "seeded and undeletable" - a structural fact, not a preference.
-- Overloading that would make user-created accounts unpreferrable.
ALTER TABLE account ADD COLUMN is_preferred boolean NOT NULL DEFAULT false;

-- At most one per user. Two preferred accounts is a meaningless state, so the
-- database refuses it rather than leaving the app to pick arbitrarily.
CREATE UNIQUE INDEX account_user_preferred_uniq
  ON account (user_id) WHERE is_preferred;

COMMIT;

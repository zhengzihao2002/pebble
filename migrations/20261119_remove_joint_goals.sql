-- Run after deploying the release that removes Joint Goals.
-- This permanently deletes shared joint-goal and contribution history.
BEGIN;
DROP TABLE IF EXISTS public.pebble_joint_contribution;
DROP TABLE IF EXISTS public.pebble_joint_goal;
COMMIT;

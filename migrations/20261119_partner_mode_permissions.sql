-- Repair privileges for Pebble's restricted production database role.
BEGIN;
GRANT USAGE ON SCHEMA public, neon_auth TO pebble_app;
GRANT SELECT (id, name) ON TABLE neon_auth."user" TO pebble_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.pebble_partner_pair, public.pebble_partner_member, public.pebble_partner_invite
  TO pebble_app;
GRANT SELECT, INSERT
  ON TABLE public.pebble_joint_goal, public.pebble_joint_contribution
  TO pebble_app;
GRANT SELECT ON TABLE public.pebble_partner_scope TO pebble_app;
COMMIT;

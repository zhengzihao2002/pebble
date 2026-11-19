-- Partner Mode and Joint Goals. Additive. Run the entire script as one query.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pebble_partner_pair (
  id uuid PRIMARY KEY,
  first_user uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  second_user uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (first_user <> second_user)
);
CREATE INDEX IF NOT EXISTS pebble_partner_pair_first_idx ON public.pebble_partner_pair (first_user);
CREATE INDEX IF NOT EXISTS pebble_partner_pair_second_idx ON public.pebble_partner_pair (second_user);

-- A primary key on user_id enforces one active partner per Pebble account.
CREATE TABLE IF NOT EXISTS public.pebble_partner_member (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  pair_id uuid NOT NULL REFERENCES public.pebble_partner_pair(id) ON DELETE CASCADE,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(permissions) = 'object'),
  shared_categories text[] NOT NULL DEFAULT '{}',
  configured_at timestamptz
);
CREATE INDEX IF NOT EXISTS pebble_partner_member_pair_idx ON public.pebble_partner_member (pair_id);

CREATE TABLE IF NOT EXISTS public.pebble_partner_invite (
  owner_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  digest text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pebble_joint_goal (
  id uuid PRIMARY KEY,
  pair_id uuid NOT NULL REFERENCES public.pebble_partner_pair(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  target_cents bigint NOT NULL CHECK (target_cents BETWEEN 1 AND 99999999999),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pebble_joint_goal_pair_idx ON public.pebble_joint_goal (pair_id);

CREATE TABLE IF NOT EXISTS public.pebble_joint_contribution (
  id uuid PRIMARY KEY,
  goal_id uuid NOT NULL REFERENCES public.pebble_joint_goal(id) ON DELETE CASCADE,
  contributor_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  cents bigint NOT NULL CHECK (cents BETWEEN 1 AND 99999999999),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pebble_joint_contribution_goal_idx ON public.pebble_joint_contribution (goal_id);

CREATE OR REPLACE VIEW public.pebble_partner_scope AS
SELECT viewer.user_id AS viewer_id, owner.user_id AS owner_id, owner.permissions, owner.shared_categories, pair.id AS pair_id
FROM public.pebble_partner_member viewer
JOIN public.pebble_partner_member owner ON owner.pair_id = viewer.pair_id AND owner.user_id <> viewer.user_id
JOIN public.pebble_partner_pair pair ON pair.id = viewer.pair_id AND pair.ended_at IS NULL
WHERE viewer.configured_at IS NOT NULL AND owner.configured_at IS NOT NULL
  AND ((viewer.user_id = pair.first_user AND owner.user_id = pair.second_user)
    OR (viewer.user_id = pair.second_user AND owner.user_id = pair.first_user));

REVOKE ALL ON public.pebble_partner_pair, public.pebble_partner_member, public.pebble_partner_invite,
  public.pebble_joint_goal, public.pebble_joint_contribution, public.pebble_partner_scope FROM PUBLIC;

DO $partner_permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pebble_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.pebble_partner_pair, public.pebble_partner_member, public.pebble_partner_invite
      TO pebble_app;
    GRANT SELECT, INSERT ON public.pebble_joint_goal, public.pebble_joint_contribution TO pebble_app;
    GRANT SELECT ON public.pebble_partner_scope TO pebble_app;
  END IF;
END
$partner_permissions$;

COMMIT;

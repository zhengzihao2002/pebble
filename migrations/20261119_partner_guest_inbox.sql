-- Additive. Run as one script before deploying the guest permissions release.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pebble_partner_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES neon_auth."user"(id) ON DELETE SET NULL,
  pair_id uuid REFERENCES public.pebble_partner_pair(id) ON DELETE SET NULL,
  operation text NOT NULL CHECK (operation IN ('add', 'edit')),
  resource text NOT NULL CHECK (resource IN ('transaction', 'goal', 'account', 'budget', 'scheduled')),
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
CREATE INDEX IF NOT EXISTS pebble_partner_inbox_owner_idx ON public.pebble_partner_inbox(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pebble_partner_inbox_expiry_idx ON public.pebble_partner_inbox(expires_at);
REVOKE ALL ON public.pebble_partner_inbox FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON public.pebble_partner_inbox TO pebble_app;

CREATE OR REPLACE FUNCTION public.pebble_record_guest_write() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $guest_inbox$
DECLARE
  guest uuid := nullif(current_setting('pebble.guest_actor', true), '')::uuid;
  event_row jsonb;
  matched_pair uuid;
  resource_kind text;
  caption text;
BEGIN
  IF guest IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) - 'updated_at' = to_jsonb(OLD) - 'updated_at' THEN
    RETURN NEW;
  END IF;
  SELECT s.pair_id INTO matched_pair FROM public.pebble_partner_scope s WHERE s.viewer_id=guest AND s.owner_id=NEW.user_id;
  IF matched_pair IS NULL THEN
    RAISE EXCEPTION 'Guest workspace access ended' USING ERRCODE='42501';
  END IF;
  event_row := to_jsonb(NEW);
  IF TG_TABLE_NAME IN ('expense', 'income', 'recurring_rule') THEN
    resource_kind := CASE WHEN TG_TABLE_NAME = 'recurring_rule' THEN 'scheduled' ELSE 'transaction' END;
    caption := split_part(event_row->>'description', chr(10), 1);
  ELSE
    resource_kind := TG_TABLE_NAME;
    caption := event_row->>'name';
  END IF;
  INSERT INTO public.pebble_partner_inbox(owner_id, guest_id, pair_id, operation, resource, label)
    VALUES (NEW.user_id,guest,matched_pair,CASE WHEN TG_OP='INSERT' THEN 'add' ELSE 'edit' END,resource_kind,left(coalesce(caption,''),300));
  RETURN NEW;
END
$guest_inbox$;

REVOKE ALL ON FUNCTION public.pebble_record_guest_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pebble_record_guest_write() TO pebble_app;
DO $guest_triggers$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['expense','income','account','goal','recurring_rule'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS pebble_partner_guest_write ON public.%I',target);
    EXECUTE format('CREATE TRIGGER pebble_partner_guest_write AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pebble_record_guest_write()',target);
  END LOOP;
END
$guest_triggers$;

COMMIT;

CREATE SCHEMA neon_auth;
CREATE TABLE neon_auth."user"(id uuid PRIMARY KEY);
CREATE TABLE category(id text PRIMARY KEY,user_id uuid NOT NULL REFERENCES neon_auth."user",name text NOT NULL,UNIQUE(user_id,name));
CREATE TABLE budget(user_id uuid NOT NULL REFERENCES neon_auth."user",category text NOT NULL,annual_amount numeric(12,2) NOT NULL,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,category));
INSERT INTO neon_auth."user" VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO category VALUES ('u1-food','00000000-0000-0000-0000-000000000001','Food'),('u1-rent','00000000-0000-0000-0000-000000000001','Rent'),('u1-extra','00000000-0000-0000-0000-000000000001','Extra'),('u2-food','00000000-0000-0000-0000-000000000002','Food');
INSERT INTO budget(user_id,category,annual_amount) VALUES ('00000000-0000-0000-0000-000000000001','Food',1200),('00000000-0000-0000-0000-000000000001','Rent',12000),('00000000-0000-0000-0000-000000000002','Food',2400);
-- Match the production split: the SQL Editor owns new tables, while the app
-- connects through a separate restricted role with existing-table privileges.
CREATE ROLE pebble_app NOLOGIN;
GRANT USAGE ON SCHEMA public, neon_auth TO pebble_app;
GRANT SELECT ON neon_auth."user" TO pebble_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON category, budget TO pebble_app;

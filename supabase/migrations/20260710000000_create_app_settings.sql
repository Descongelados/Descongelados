-- Single-row key/value store for tenant-level settings (company info, dashboard config, etc.)
CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_app_settings" ON app_settings;
CREATE POLICY "anon_select_app_settings" ON app_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_app_settings" ON app_settings;
CREATE POLICY "anon_insert_app_settings" ON app_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_app_settings" ON app_settings;
CREATE POLICY "anon_update_app_settings" ON app_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_app_settings" ON app_settings;
CREATE POLICY "anon_delete_app_settings" ON app_settings FOR DELETE TO anon, authenticated USING (true);

-- Seed default company row
INSERT INTO app_settings (key, value)
VALUES ('company', '{"name":"Mi Empresa","rfc":"","phone":"","address":"","logo":null}')
ON CONFLICT (key) DO NOTHING;

-- Seed default dashboard cash initial
INSERT INTO app_settings (key, value)
VALUES ('dashboard_cash_initial', '{"amount":0}')
ON CONFLICT (key) DO NOTHING;

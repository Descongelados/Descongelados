-- ============================================================
-- INVENTORY LOGS
-- Registra cada cambio en el inventario:
--   - creación de producto (created)
--   - edición manual (edited) con delta de stock si cambió
--   - eliminación de producto (deleted)
--   - movimiento automático vía compra (purchase)
--   - movimiento automático vía venta (sale)
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_logs (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid          REFERENCES products(id) ON DELETE SET NULL,
  product_name  text          NOT NULL,
  product_sku   text          NOT NULL,
  action        text          NOT NULL, -- 'created' | 'edited' | 'deleted' | 'purchase' | 'sale'
  stock_before  numeric(14,3),
  stock_after   numeric(14,3),
  delta         numeric(14,3) GENERATED ALWAYS AS (stock_after - stock_before) STORED,
  changed_by    text,         -- nombre del usuario que realizó el cambio
  notes         text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_action     ON inventory_logs(action);

ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inventory_logs" ON inventory_logs;
CREATE POLICY "anon_select_inventory_logs" ON inventory_logs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_inventory_logs" ON inventory_logs;
CREATE POLICY "anon_insert_inventory_logs" ON inventory_logs
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_inventory_logs" ON inventory_logs;
CREATE POLICY "anon_update_inventory_logs" ON inventory_logs
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_inventory_logs" ON inventory_logs;
CREATE POLICY "anon_delete_inventory_logs" ON inventory_logs
  FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- Índice GIN para búsqueda de texto en inventory_logs.product_name
--
-- Problema anterior: la búsqueda en el log de inventario usa
-- .ilike('product_name', '%texto%'). El patrón con wildcard al
-- inicio (%texto%) no puede usar índices B-tree y hace un
-- sequential scan de toda la tabla en cada búsqueda.
--
-- Solución: índice GIN con tsvector en español. Permite búsqueda
-- full-text eficiente independientemente del tamaño de la tabla.
--
-- También se agrega un índice B-tree en (action, created_at DESC)
-- para el filtro combinado de acción + orden cronológico que usa
-- InventoryLogTab.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_name_gin
  ON inventory_logs
  USING gin(to_tsvector('spanish', product_name));

CREATE INDEX IF NOT EXISTS idx_inventory_logs_action_date
  ON inventory_logs(action, created_at DESC);

-- ============================================================
-- BACKFILL inventory_logs
-- Genera un log histórico por cada línea de venta y compra
-- que no tenga ya un registro en inventory_logs.
-- ============================================================

-- ── 1. Ventas ────────────────────────────────────────────────
INSERT INTO inventory_logs (
  product_id,
  product_name,
  product_sku,
  action,
  stock_before,
  stock_after,
  changed_by,
  notes,
  created_at
)
SELECT
  si.product_id,
  COALESCE(p.name, 'Producto eliminado')  AS product_name,
  COALESCE(p.sku,  'N/A')                 AS product_sku,
  'sale'                                  AS action,
  0                                       AS stock_before,  -- no hay dato histórico
  0                                       AS stock_after,
  NULL                                    AS changed_by,
  CONCAT('Backfill venta ', COALESCE(s.invoice_number, s.id::text)) AS notes,
  s.sale_date::timestamptz                AS created_at
FROM sale_items si
JOIN sales      s  ON s.id  = si.sale_id
LEFT JOIN products p  ON p.id  = si.product_id
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_logs il
  WHERE il.product_id = si.product_id
    AND il.action     = 'sale'
    AND il.notes LIKE CONCAT('%', COALESCE(s.invoice_number, s.id::text), '%')
);

-- ── 2. Compras ───────────────────────────────────────────────
INSERT INTO inventory_logs (
  product_id,
  product_name,
  product_sku,
  action,
  stock_before,
  stock_after,
  changed_by,
  notes,
  created_at
)
SELECT
  pi2.product_id,
  COALESCE(p.name, 'Producto eliminado')  AS product_name,
  COALESCE(p.sku,  'N/A')                 AS product_sku,
  'purchase'                              AS action,
  0                                       AS stock_before,
  0                                       AS stock_after,
  NULL                                    AS changed_by,
  CONCAT('Backfill compra ', COALESCE(pu.invoice_number, pu.id::text)) AS notes,
  pu.purchase_date::timestamptz           AS created_at
FROM purchase_items pi2
JOIN purchases      pu ON pu.id = pi2.purchase_id
LEFT JOIN products  p  ON p.id  = pi2.product_id
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_logs il
  WHERE il.product_id = pi2.product_id
    AND il.action     = 'purchase'
    AND il.notes LIKE CONCAT('%', COALESCE(pu.invoice_number, pu.id::text), '%')
);

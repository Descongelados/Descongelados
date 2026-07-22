-- ============================================================
-- VIEW: low_stock_products
-- Productos activos cuyo stock está en o por debajo del mínimo.
-- Ordenados por mayor déficit primero (min_stock - stock DESC).
-- Evita descargar toda la tabla products al cliente solo para
-- calcular stock bajo.
-- ============================================================

CREATE OR REPLACE VIEW low_stock_products AS
SELECT id, sku, name, stock, min_stock
FROM products
WHERE is_active = true
  AND stock <= min_stock
ORDER BY (min_stock - stock) DESC;

GRANT SELECT ON low_stock_products TO anon, authenticated;

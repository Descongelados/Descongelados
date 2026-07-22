-- ============================================================
-- Índices compuestos para queries filtradas por status + fecha
--
-- Contexto:
--   Dashboard, Reports y Sales filtran:
--     sales:      .eq('status','confirmada') + .gte/.lte('sale_date')
--     purchases:  .eq('status','confirmada') + .gte/.lte('purchase_date')
--     collections:.gte/.lte('collection_date') + ocasionalmente payment_method
--
-- Los índices simples existentes (idx_sales_date, idx_purchases_date,
-- idx_collections_date) funcionan pero requieren un filter step extra
-- para descartar las filas con status != 'confirmada'.
-- Los índices compuestos permiten un index scan directo sobre ambas
-- condiciones simultáneamente.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sales_status_date
  ON sales(status, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_purchases_status_date
  ON purchases(status, purchase_date DESC);

-- collections ya tiene idx_collections_date; este compuesto cubre
-- las queries que filtran también por payment_method (Dashboard, Reports)
CREATE INDEX IF NOT EXISTS idx_collections_date_method
  ON collections(collection_date DESC, payment_method);

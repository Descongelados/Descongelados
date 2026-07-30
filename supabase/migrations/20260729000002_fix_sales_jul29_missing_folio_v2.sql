-- ============================================================
-- Asignar folio (invoice_number) a las ventas del 29 de julio
-- que quedaron sin él, en orden cronológico de creación.
--
-- Este script reemplaza la versión anterior
-- (20260729000000_fix_sales_jul29_missing_folio.sql) que fallaba
-- porque next_invoice_number() era STABLE y no toleraba folios
-- con caracteres no numéricos.
--
-- La función ya fue corregida en 20260729000001; aquí solo
-- iteramos las ventas pendientes y asignamos el folio uno a uno.
-- ============================================================

DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id
    FROM   sales
    WHERE  sale_date::date = '2026-07-29'
      AND  (invoice_number IS NULL OR invoice_number = '')
    ORDER  BY created_at
  LOOP
    UPDATE sales
    SET    invoice_number = next_invoice_number()
    WHERE  id = v_id;
  END LOOP;
END;
$$;

-- ============================================================
-- Asignar folio (invoice_number) a las ventas del 29 de julio
-- que quedaron sin él, en orden cronológico de creación.
--
-- La función next_invoice_number() es STABLE y toma el MAX
-- actual de la tabla, por eso se itera fila a fila con un DO
-- block para que cada UPDATE sea una transacción aparte y el
-- MAX se recalcule correctamente en cada vuelta.
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

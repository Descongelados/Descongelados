-- ============================================================
-- Función RPC: update_sale(p_sale_id, p_payload, p_items)
--
-- Problema anterior: la edición de una venta en Sales.tsx
-- ejecutaba 3 operaciones independientes:
--   1. UPDATE sales
--   2. DELETE sale_items
--   3. INSERT sale_items
-- Si el INSERT fallaba tras el DELETE, la venta quedaba sin
-- productos y el stock desajustado.
--
-- Solución: las 3 operaciones dentro de una función PL/pgSQL,
-- que PostgreSQL ejecuta en una sola transacción implícita.
-- Si cualquier paso falla, todo el bloque hace rollback.
-- ============================================================

CREATE OR REPLACE FUNCTION update_sale(
  p_sale_id      uuid,
  p_customer_id  uuid,
  p_invoice_number text,
  p_sale_date    timestamptz,
  p_notes        text,
  p_status       text,
  p_subtotal     numeric,
  p_tax          numeric,
  p_total        numeric,
  p_items        jsonb   -- array de {product_id, quantity, unit_price, subtotal}
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  -- 1. Actualizar cabecera de la venta
  UPDATE sales SET
    customer_id    = p_customer_id,
    invoice_number = p_invoice_number,
    sale_date      = p_sale_date,
    notes          = p_notes,
    status         = p_status,
    subtotal       = p_subtotal,
    tax            = p_tax,
    total          = p_total
  WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta % no encontrada', p_sale_id;
  END IF;

  -- 2. Eliminar items anteriores (los triggers de stock revierten el movimiento)
  DELETE FROM sale_items WHERE sale_id = p_sale_id;

  -- 3. Insertar los nuevos items (los triggers de stock aplican el nuevo movimiento)
  INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
  SELECT
    p_sale_id,
    (item->>'product_id')::uuid,
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    (item->>'subtotal')::numeric
  FROM jsonb_array_elements(p_items) AS item;
END;
$$;

GRANT EXECUTE ON FUNCTION update_sale(
  uuid, uuid, text, timestamptz, text, text, numeric, numeric, numeric, jsonb
) TO anon, authenticated;

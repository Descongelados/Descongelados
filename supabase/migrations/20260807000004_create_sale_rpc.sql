-- ============================================================
-- Función RPC: create_sale(...)
--
-- Problema anterior: la creación de una venta en Sales.tsx
-- ejecutaba 2 operaciones independientes:
--   1. INSERT sales  → devuelve el id creado
--   2. INSERT sale_items
-- Si la segunda fallaba, la venta quedaba registrada sin
-- productos y el stock no se descontaba.
--
-- Solución: ambas operaciones dentro de una función PL/pgSQL,
-- que PostgreSQL ejecuta en una sola transacción implícita.
-- Devuelve el id de la venta creada y los sale_items insertados
-- para que el cliente pueda mostrar el recibo sin queries extra.
-- ============================================================

CREATE OR REPLACE FUNCTION create_sale(
  p_customer_id    uuid,
  p_invoice_number text,
  p_sale_date      timestamptz,
  p_notes          text,
  p_status         text,
  p_subtotal       numeric,
  p_tax            numeric,
  p_total          numeric,
  p_items          jsonb   -- array de {product_id, quantity, unit_price, subtotal}
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_sale_id uuid;
  v_items   jsonb;
BEGIN
  -- 1. Insertar cabecera de la venta
  INSERT INTO sales (customer_id, invoice_number, sale_date, notes, status, subtotal, tax, total)
  VALUES (p_customer_id, p_invoice_number, p_sale_date, p_notes, p_status, p_subtotal, p_tax, p_total)
  RETURNING id INTO v_sale_id;

  -- 2. Insertar items (los triggers de stock descuentan automáticamente)
  INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
  SELECT
    v_sale_id,
    (item->>'product_id')::uuid,
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    (item->>'subtotal')::numeric
  FROM jsonb_array_elements(p_items) AS item;

  -- 3. Devolver id + items insertados para construir el recibo en el cliente
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',         si.id,
      'sale_id',    si.sale_id,
      'product_id', si.product_id,
      'quantity',   si.quantity,
      'unit_price', si.unit_price,
      'subtotal',   si.subtotal
    )
  )
  INTO v_items
  FROM sale_items si
  WHERE si.sale_id = v_sale_id;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'items',   COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_sale(
  uuid, text, timestamptz, text, text, numeric, numeric, numeric, jsonb
) TO anon, authenticated;

-- ============================================================
-- Funciones RPC: create_purchase() y update_purchase()
--
-- Problema anterior: creación y edición de compras ejecutaban
-- 4 operaciones independientes:
--   CREATE: INSERT purchases → INSERT purchase_items → INSERT supplier_payments
--   UPDATE: UPDATE purchases → DELETE purchase_items → INSERT purchase_items
--            → DELETE supplier_payments → INSERT supplier_payments
--
-- Si cualquier paso fallaba a mitad, los datos quedaban en
-- estado inconsistente (compra sin items, stock desajustado,
-- pagos duplicados, etc.)
--
-- Solución: cada operación en una función PL/pgSQL con
-- transacción implícita — si algo falla, rollback total.
-- ============================================================

-- ── create_purchase ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_purchase(
  p_supplier_id    uuid,
  p_invoice_number text,
  p_purchase_date  timestamptz,
  p_notes          text,
  p_status         text,
  p_subtotal       numeric,
  p_tax            numeric,
  p_total          numeric,
  p_items          jsonb,   -- [{product_id, quantity, unit_cost, subtotal}]
  p_payments       jsonb    -- [{supplier_id, amount, payment_method, payment_date}]
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_purchase_id uuid;
BEGIN
  -- 1. Insertar cabecera
  INSERT INTO purchases (supplier_id, invoice_number, purchase_date, notes, status, subtotal, tax, total)
  VALUES (p_supplier_id, p_invoice_number, p_purchase_date, p_notes, p_status, p_subtotal, p_tax, p_total)
  RETURNING id INTO v_purchase_id;

  -- 2. Insertar items (triggers de stock suman el inventario)
  INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal)
  SELECT
    v_purchase_id,
    (item->>'product_id')::uuid,
    (item->>'quantity')::numeric,
    (item->>'unit_cost')::numeric,
    (item->>'subtotal')::numeric
  FROM jsonb_array_elements(p_items) AS item;

  -- 3. Insertar pagos al proveedor (solo los que tienen monto > 0)
  IF jsonb_array_length(p_payments) > 0 THEN
    INSERT INTO supplier_payments (supplier_id, purchase_id, amount, payment_method, payment_date)
    SELECT
      p_supplier_id,
      v_purchase_id,
      (pay->>'amount')::numeric,
      pay->>'payment_method',
      (pay->>'payment_date')::timestamptz
    FROM jsonb_array_elements(p_payments) AS pay
    WHERE (pay->>'amount')::numeric > 0;
  END IF;

  RETURN v_purchase_id;
END;
$$;

-- ── update_purchase ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_purchase(
  p_purchase_id    uuid,
  p_supplier_id    uuid,
  p_invoice_number text,
  p_purchase_date  timestamptz,
  p_notes          text,
  p_status         text,
  p_subtotal       numeric,
  p_tax            numeric,
  p_total          numeric,
  p_items          jsonb,   -- [{product_id, quantity, unit_cost, subtotal}]
  p_payments       jsonb    -- [{supplier_id, amount, payment_method, payment_date}]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  -- 1. Actualizar cabecera
  UPDATE purchases SET
    supplier_id    = p_supplier_id,
    invoice_number = p_invoice_number,
    purchase_date  = p_purchase_date,
    notes          = p_notes,
    status         = p_status,
    subtotal       = p_subtotal,
    tax            = p_tax,
    total          = p_total
  WHERE id = p_purchase_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra % no encontrada', p_purchase_id;
  END IF;

  -- 2. Reemplazar items (DELETE dispara triggers que revierten stock,
  --    INSERT dispara triggers que aplican el nuevo stock)
  DELETE FROM purchase_items WHERE purchase_id = p_purchase_id;

  INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal)
  SELECT
    p_purchase_id,
    (item->>'product_id')::uuid,
    (item->>'quantity')::numeric,
    (item->>'unit_cost')::numeric,
    (item->>'subtotal')::numeric
  FROM jsonb_array_elements(p_items) AS item;

  -- 3. Reemplazar pagos
  DELETE FROM supplier_payments WHERE purchase_id = p_purchase_id;

  IF jsonb_array_length(p_payments) > 0 THEN
    INSERT INTO supplier_payments (supplier_id, purchase_id, amount, payment_method, payment_date)
    SELECT
      p_supplier_id,
      p_purchase_id,
      (pay->>'amount')::numeric,
      pay->>'payment_method',
      (pay->>'payment_date')::timestamptz
    FROM jsonb_array_elements(p_payments) AS pay
    WHERE (pay->>'amount')::numeric > 0;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION create_purchase(
  uuid, text, timestamptz, text, text, numeric, numeric, numeric, jsonb, jsonb
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION update_purchase(
  uuid, uuid, text, timestamptz, text, text, numeric, numeric, numeric, jsonb, jsonb
) TO anon, authenticated;

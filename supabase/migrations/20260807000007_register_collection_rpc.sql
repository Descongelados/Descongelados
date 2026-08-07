-- ============================================================
-- Función RPC: register_collection(...)
--
-- Problemas anteriores:
--   1. El pago "combinado" insertaba hasta 3 registros de forma
--      independiente — riesgo de registros parciales en timeout.
--   2. La validación del saldo se hacía en el cliente con datos
--      que podían estar desactualizados: si otro usuario registró
--      un cobro entre el load() y el save(), el saldo del cliente
--      era incorrecto y se podía exceder el total de la venta.
--
-- Solución: validar saldo y hacer todos los INSERTs en una sola
-- transacción en PostgreSQL. Si el saldo ya no alcanza o cualquier
-- INSERT falla, todo hace rollback.
--
-- Parámetros:
--   p_sale_id       uuid        — venta que se está cobrando
--   p_customer_id   uuid        — cliente
--   p_collection_date timestamptz
--   p_reference     text
--   p_notes         text
--   p_rows          jsonb       — [{amount, payment_method}]
-- ============================================================

CREATE OR REPLACE FUNCTION register_collection(
  p_sale_id         uuid,
  p_customer_id     uuid,
  p_collection_date timestamptz,
  p_reference       text,
  p_notes           text,
  p_rows            jsonb   -- [{amount: numeric, payment_method: text}]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_sale_total   numeric;
  v_already_paid numeric;
  v_balance      numeric;
  v_new_payment  numeric;
BEGIN
  -- 1. Leer total de la venta (con lock para evitar race condition)
  SELECT total INTO v_sale_total
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta % no encontrada', p_sale_id;
  END IF;

  -- 2. Calcular lo ya cobrado (excluyendo por_pagar)
  SELECT COALESCE(SUM(amount), 0) INTO v_already_paid
  FROM collections
  WHERE sale_id = p_sale_id
    AND payment_method != 'por_pagar';

  v_balance := v_sale_total - v_already_paid;

  -- 3. Calcular el nuevo cobro real (excluyendo por_pagar del total)
  SELECT COALESCE(SUM((row->>'amount')::numeric), 0) INTO v_new_payment
  FROM jsonb_array_elements(p_rows) AS row
  WHERE (row->>'payment_method') != 'por_pagar';

  -- 4. Validar que no exceda el saldo
  IF v_new_payment > v_balance + 0.01 THEN
    RAISE EXCEPTION 'El pago (%) excede el saldo pendiente (%)',
      v_new_payment, v_balance;
  END IF;

  -- 5. Insertar todos los registros de cobranza
  INSERT INTO collections (sale_id, customer_id, amount, payment_method, collection_date, reference, notes)
  SELECT
    p_sale_id,
    p_customer_id,
    (row->>'amount')::numeric,
    row->>'payment_method',
    p_collection_date,
    NULLIF(trim(p_reference), ''),
    NULLIF(trim(p_notes), '')
  FROM jsonb_array_elements(p_rows) AS row
  WHERE (row->>'amount')::numeric > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION register_collection(
  uuid, uuid, timestamptz, text, text, jsonb
) TO anon, authenticated;

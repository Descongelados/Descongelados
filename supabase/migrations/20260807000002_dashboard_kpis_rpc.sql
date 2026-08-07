-- ============================================================
-- Función RPC: dashboard_kpis(p_week_from, p_week_to)
--
-- Problema anterior: Dashboard.tsx descargaba al cliente
-- TODOS los registros históricos de ventas entregadas y compras
-- confirmadas solo para calcular sumas (por cobrar / por pagar).
-- Con el tiempo esto crece indefinidamente.
--
-- Solución: calcular todos los totales en PostgreSQL y devolver
-- un único registro JSON con los valores ya agregados.
-- El cliente solo recibe números, no filas de datos.
--
-- Parámetros:
--   p_week_from  timestamptz  — inicio de la semana (lunes 00:00 local)
--   p_week_to    timestamptz  — fin de la semana (domingo 23:59 local)
-- ============================================================

CREATE OR REPLACE FUNCTION dashboard_kpis(
  p_week_from timestamptz,
  p_week_to   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_sales          numeric := 0;
  v_total_purchases      numeric := 0;
  v_collected_cash       numeric := 0;
  v_collected_bank       numeric := 0;
  v_total_collected      numeric := 0;
  v_cash_expenses        numeric := 0;
  v_bank_expenses        numeric := 0;
  v_total_paid           numeric := 0;
  v_week_sales_collected numeric := 0;
  v_cash_sales           numeric := 0;
  v_bank_sales_collected numeric := 0;
  v_total_to_collect     numeric := 0;
  v_total_to_pay         numeric := 0;
  v_low_stock_count      integer := 0;
BEGIN
  -- ── Ventas de la semana (confirmadas) ──────────────────────
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_sales
  FROM sales
  WHERE status = 'confirmada'
    AND sale_date BETWEEN p_week_from AND p_week_to;

  -- ── Compras de la semana (confirmadas) ─────────────────────
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_purchases
  FROM purchases
  WHERE status = 'confirmada'
    AND purchase_date BETWEEN p_week_from AND p_week_to;

  -- ── Cobranzas de la semana ─────────────────────────────────
  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'efectivo'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'banco'), 0)
  INTO v_total_collected, v_collected_cash, v_collected_bank
  FROM collections
  WHERE collection_date BETWEEN p_week_from AND p_week_to;

  -- ── Pagos a proveedores de la semana ───────────────────────
  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'efectivo'), 0),
    COALESCE(SUM(amount) FILTER (WHERE payment_method = 'banco'), 0)
  INTO v_total_paid, v_cash_expenses, v_bank_expenses
  FROM supplier_payments
  WHERE payment_date BETWEEN p_week_from AND p_week_to;

  -- ── Cobros de ventas creadas esta semana ───────────────────
  SELECT
    COALESCE(SUM(col.amount), 0),
    COALESCE(SUM(col.amount) FILTER (WHERE col.payment_method = 'efectivo'), 0),
    COALESCE(SUM(col.amount) FILTER (WHERE col.payment_method = 'banco'), 0)
  INTO v_week_sales_collected, v_cash_sales, v_bank_sales_collected
  FROM collections col
  WHERE col.sale_id IN (
    SELECT id FROM sales
    WHERE status = 'confirmada'
      AND sale_date BETWEEN p_week_from AND p_week_to
  );

  -- ── Total por cobrar: ventas entregadas con saldo pendiente ─
  SELECT COALESCE(SUM(GREATEST(s.total - COALESCE(paid.total_paid, 0), 0)), 0)
  INTO v_total_to_collect
  FROM sales s
  LEFT JOIN (
    SELECT sale_id, SUM(amount) AS total_paid
    FROM collections
    WHERE payment_method != 'por_pagar'
    GROUP BY sale_id
  ) paid ON paid.sale_id = s.id
  WHERE s.status = 'confirmada'
    AND s.delivery_status = 'entregado';

  -- ── Total por pagar: compras confirmadas con saldo pendiente ─
  SELECT COALESCE(SUM(GREATEST(p.total - COALESCE(paid.total_paid, 0), 0)), 0)
  INTO v_total_to_pay
  FROM purchases p
  LEFT JOIN (
    SELECT purchase_id, SUM(amount) AS total_paid
    FROM supplier_payments
    GROUP BY purchase_id
  ) paid ON paid.purchase_id = p.id
  WHERE p.status = 'confirmada';

  -- ── Productos con stock bajo ────────────────────────────────
  SELECT COUNT(*) INTO v_low_stock_count FROM low_stock_products;

  RETURN jsonb_build_object(
    'total_sales',           v_total_sales,
    'total_purchases',       v_total_purchases,
    'total_collected',       v_total_collected,
    'collected_cash',        v_collected_cash,
    'collected_bank',        v_collected_bank,
    'week_sales_collected',  v_week_sales_collected,
    'cash_sales',            v_cash_sales,
    'bank_sales_collected',  v_bank_sales_collected,
    'total_to_collect',      v_total_to_collect,
    'total_to_pay',          v_total_to_pay,
    'cash_expenses',         v_cash_expenses,
    'bank_expenses',         v_bank_expenses,
    'low_stock_count',       v_low_stock_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION dashboard_kpis(timestamptz, timestamptz) TO anon, authenticated;

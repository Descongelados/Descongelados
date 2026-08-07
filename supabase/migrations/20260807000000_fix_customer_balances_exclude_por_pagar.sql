-- ============================================================
-- Fix: customer_balances — excluir payment_method = 'por_pagar'
--
-- Problema: la versión anterior sumaba TODOS los registros de
-- collections.amount, incluyendo los de payment_method='por_pagar'.
-- Esos registros representan deuda registrada, no cobro real,
-- por lo que el saldo mostrado en Clientes era menor al real.
--
-- Collections.tsx ya excluía 'por_pagar' al calcular el balance
-- en el cliente. Esta migración alinea la vista con esa lógica.
-- ============================================================

CREATE OR REPLACE VIEW customer_balances AS
SELECT
  c.id,
  c.name,
  c.tax_id,
  c.phone,
  c.email,
  c.city,
  c.credit_limit,
  COALESCE(s.total_purchased, 0)                                    AS total_purchased,
  COALESCE(col.total_paid, 0)                                       AS total_paid,
  COALESCE(s.total_purchased, 0) - COALESCE(col.total_paid, 0)     AS balance
FROM customers c
LEFT JOIN (
  SELECT customer_id, SUM(total) AS total_purchased
  FROM sales
  WHERE status = 'confirmada'
  GROUP BY customer_id
) s   ON s.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(amount) AS total_paid
  FROM collections
  WHERE payment_method != 'por_pagar'
  GROUP BY customer_id
) col ON col.customer_id = c.id;

GRANT SELECT ON customer_balances TO anon, authenticated;

-- ============================================================
-- Fix: agregar columna address a customer_balances y supplier_balances
--
-- Problema: el campo address no estaba en las vistas, por lo que
-- al abrir edición de un cliente o proveedor, siempre llegaba
-- vacío y al guardar sobreescribía la dirección guardada con null.
--
-- Nota: se usa DROP + CREATE en lugar de CREATE OR REPLACE porque
-- PostgreSQL no permite agregar columnas en posiciones intermedias
-- con OR REPLACE — requiere que el listado de columnas sea idéntico
-- excepto por adiciones al final.
-- ============================================================

DROP VIEW IF EXISTS customer_balances;
DROP VIEW IF EXISTS supplier_balances;

CREATE VIEW customer_balances AS
SELECT
  c.id,
  c.name,
  c.tax_id,
  c.phone,
  c.email,
  c.address,
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

CREATE VIEW supplier_balances AS
SELECT
  s.id,
  s.name,
  s.tax_id,
  s.phone,
  s.email,
  s.address,
  s.city,
  s.contact,
  COALESCE(p.total_purchased, 0)                                    AS total_purchased,
  COALESCE(sp.total_paid, 0)                                        AS total_paid,
  COALESCE(p.total_purchased, 0) - COALESCE(sp.total_paid, 0)      AS balance
FROM suppliers s
LEFT JOIN (
  SELECT supplier_id, SUM(total) AS total_purchased
  FROM purchases
  WHERE status = 'confirmada'
  GROUP BY supplier_id
) p  ON p.supplier_id = s.id
LEFT JOIN (
  SELECT supplier_id, SUM(amount) AS total_paid
  FROM supplier_payments
  GROUP BY supplier_id
) sp ON sp.supplier_id = s.id;

GRANT SELECT ON customer_balances TO anon, authenticated;
GRANT SELECT ON supplier_balances TO anon, authenticated;

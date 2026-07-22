-- ============================================================
-- Reescritura de customer_balances y supplier_balances
-- Reemplaza sub-selects correlacionados (N+1 por fila) con
-- LEFT JOIN + GROUP BY (2 scans fijos independientemente del
-- número de clientes/proveedores).
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
  GROUP BY customer_id
) col ON col.customer_id = c.id;

CREATE OR REPLACE VIEW supplier_balances AS
SELECT
  s.id,
  s.name,
  s.tax_id,
  s.phone,
  s.email,
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

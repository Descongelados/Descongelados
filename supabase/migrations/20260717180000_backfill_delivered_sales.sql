-- Fix: mark as 'entregado' all sales that already have at least one
-- collection record, so they are excluded from the Sales module and
-- only appear in Collections (Entrega & Cobranza).
UPDATE sales
SET delivery_status = 'entregado'
WHERE id IN (
  SELECT DISTINCT sale_id
  FROM collections
  WHERE sale_id IS NOT NULL
)
AND delivery_status <> 'entregado';
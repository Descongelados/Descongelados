-- ============================================================
-- Función: next_purchase_number()
-- Calcula el siguiente folio de compra consultando el máximo
-- histórico en la BD.
--
-- Formato: CMP-YYYY-NNNN  (ej: CMP-2026-0001)
-- ============================================================

CREATE OR REPLACE FUNCTION next_purchase_number()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT 'CMP-' || extract(year FROM now())::text || '-' ||
         lpad(
           COALESCE(
             MAX(
               CAST(
                 REGEXP_REPLACE(invoice_number, '[^0-9]', '', 'g')
                 AS integer
               )
             ) + 1,
             1
           )::text,
           4, '0'
         )
  FROM purchases
  WHERE invoice_number ~ ('^CMP-' || extract(year FROM now())::text || '-');
$$;

GRANT EXECUTE ON FUNCTION next_purchase_number() TO anon, authenticated;

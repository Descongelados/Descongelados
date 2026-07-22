-- ============================================================
-- Función: next_invoice_number()
-- Calcula el siguiente folio de venta consultando el máximo
-- histórico en la BD. Más seguro que calcular en el cliente
-- (que ahora solo tiene en memoria las ventas de esta semana).
--
-- Formato: VTA-YYYY-NNNN  (ej: VTA-2025-0048)
-- ============================================================

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT 'VTA-' || extract(year FROM now())::text || '-' ||
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
  FROM sales
  WHERE invoice_number ~ ('^VTA-' || extract(year FROM now())::text || '-');
$$;

GRANT EXECUTE ON FUNCTION next_invoice_number() TO anon, authenticated;

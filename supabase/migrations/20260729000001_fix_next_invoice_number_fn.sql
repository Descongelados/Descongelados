-- ============================================================
-- Corrección de next_invoice_number()
--
-- Problemas anteriores:
--   1. STABLE: PostgreSQL reutiliza el resultado dentro de la
--      misma sentencia/transacción, haciendo que al asignar
--      folios en un loop todos reciban el mismo valor.
--   2. CAST(REGEXP_REPLACE(...) AS integer): si algún folio
--      contiene caracteres Unicode que el regex [^0-9] no
--      captura (e.g. dígitos o letras de otros bloques),
--      el cast falla con "invalid input syntax for type integer".
--
-- Solución:
--   - Cambiar a VOLATILE para que recalcule el MAX en cada llamada.
--   - Extraer solo la parte secuencial (último segmento tras el
--     último guion) y usar NULLIF + regex para descartar valores
--     no puramente numéricos antes del cast.
-- ============================================================

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'VTA-' || extract(year FROM now())::text || '-' ||
         lpad(
           COALESCE(
             MAX(
               NULLIF(
                 regexp_replace(
                   split_part(invoice_number, '-', 3),  -- solo "NNNN", sin año ni prefijo
                   '[^0-9]', '', 'g'
                 ),
                 ''
               )::integer
             ) + 1,
             1
           )::text,
           4, '0'
         )
  FROM sales
  WHERE invoice_number ~ ('^VTA-' || extract(year FROM now())::text || '-')
    AND split_part(invoice_number, '-', 3) ~ '^[0-9]+$';  -- solo filas con secuencial numérico limpio
$$;

GRANT EXECUTE ON FUNCTION next_invoice_number() TO anon, authenticated;

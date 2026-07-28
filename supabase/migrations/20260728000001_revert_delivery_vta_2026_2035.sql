-- Revert delivery_status of VTA-2026-2035 (Snacks wings / Atziri) back to
-- 'pendiente' so the sale re-appears in the Collections (Cobranza) module
-- as unpaid and can be properly collected.
UPDATE sales
SET delivery_status = 'pendiente'
WHERE invoice_number = 'VTA-2026-2035';

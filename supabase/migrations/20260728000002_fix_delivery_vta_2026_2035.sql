-- VTA-2026-2035 (Snacks wings / Atziri) was incorrectly set to 'pendiente'.
-- Cobranza tab shows sales with delivery_status = 'entregado' and balance > 0,
-- so restore to 'entregado' so it appears there as unpaid.
UPDATE sales
SET delivery_status = 'entregado'
WHERE invoice_number = 'VTA-2026-2035';

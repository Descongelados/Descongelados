-- Quitar IVA a la venta VTA-2026-2041 (Juanjo Alitas, $359)
-- tax = 0, total = subtotal
UPDATE sales
SET
  tax   = 0,
  total = subtotal
WHERE invoice_number = 'VTA-2026-2041';

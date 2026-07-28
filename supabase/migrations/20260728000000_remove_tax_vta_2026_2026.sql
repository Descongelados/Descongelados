-- Remove IVA from sale VTA-2026-2026 (Juanjo Alitas, Ala Seara x5 @ $62)
-- subtotal stays at $310.00, tax → 0, total → $310.00
UPDATE sales
SET
  tax   = 0,
  total = subtotal
WHERE invoice_number = 'VTA-2026-2026';

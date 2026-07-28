-- Asignar folio a la compra del 27 de julio de Carnipollo (sin folio)
UPDATE purchases
SET invoice_number = next_purchase_number()
WHERE supplier_id = (SELECT id FROM suppliers WHERE name ILIKE '%carnipollo%' LIMIT 1)
  AND purchase_date::date = '2026-07-27'
  AND (invoice_number IS NULL OR invoice_number = '');

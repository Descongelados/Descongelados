/*
# Add delivery_status column to sales

1. Changes
- Adds `delivery_status` (text, NOT NULL, default 'pendiente') to the `sales` table.
  Values: 'pendiente' (sale confirmed, awaiting delivery) | 'entregado' (delivered to customer).
- Adds an index on `sales(delivery_status)` for filtering.
2. Notes
- Existing sales rows default to 'pendiente'.
- The old `deliveries` table is left in place (unused by the app) to avoid data loss.
- RLS already enabled on `sales`; no policy changes needed since the existing
  anon, authenticated CRUD policies already cover the new column.
*/

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pendiente';

CREATE INDEX IF NOT EXISTS idx_sales_delivery_status ON sales(delivery_status);

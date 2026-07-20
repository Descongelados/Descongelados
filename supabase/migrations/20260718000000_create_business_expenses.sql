-- ============================================================
-- BUSINESS EXPENSES
-- Registra gastos operativos del negocio que no corresponden
-- a compras de inventario (renta, luz, gasolina, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS business_expenses (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  description   text          NOT NULL,
  category      text          NOT NULL DEFAULT 'Otro',
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method text         NOT NULL DEFAULT 'efectivo', -- 'efectivo' | 'banco'
  expense_date  date          NOT NULL DEFAULT CURRENT_DATE,
  reference     text,
  notes         text,
  created_by    text,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_expenses_date       ON business_expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_business_expenses_category   ON business_expenses(category);
CREATE INDEX IF NOT EXISTS idx_business_expenses_method     ON business_expenses(payment_method);

ALTER TABLE business_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_business_expenses" ON business_expenses;
CREATE POLICY "anon_select_business_expenses" ON business_expenses
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_business_expenses" ON business_expenses;
CREATE POLICY "anon_insert_business_expenses" ON business_expenses
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_business_expenses" ON business_expenses;
CREATE POLICY "anon_update_business_expenses" ON business_expenses
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_business_expenses" ON business_expenses;
CREATE POLICY "anon_delete_business_expenses" ON business_expenses
  FOR DELETE TO anon, authenticated USING (true);

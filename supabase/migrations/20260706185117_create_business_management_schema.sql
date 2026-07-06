/*
# Business Management Schema — Compras, Ventas, Inventario, Entregas, Cobranza

## Overview
Creates the complete schema for managing purchases, sales, inventory, deliveries,
and collections. This is a single-tenant application with NO authentication — all
data is intentionally shared and the anon-key frontend must be able to read/write
every table.

## New Tables
1. products — inventory items with denormalized stock maintained by triggers
2. customers — customer master data with credit limit
3. suppliers — supplier master data
4. purchases — purchase order headers (supplier, totals, date)
5. purchase_items — purchase line items (product, qty, unit cost)
6. sales — sales invoice headers (customer, totals, date)
7. sale_items — sales line items (product, qty, unit price)
8. deliveries — delivery tracking linked to a sale, with status workflow
9. collections — customer payments (cobranza), optionally linked to a sale
10. supplier_payments — payments made to suppliers, optionally linked to a purchase

## Stock Management
- products.stock is maintained automatically by AFTER INSERT/DELETE/UPDATE triggers
  on purchase_items (increases stock) and sale_items (decreases stock).
- Deleting a purchase or sale cascades to its items, and the item triggers reverse
  the stock movement, so stock always reflects confirmed transactions.
- products.updated_at is refreshed on every stock movement.

## Views
- customer_balances — total purchased, total paid, outstanding balance per customer
- supplier_balances — total purchased, total paid, outstanding balance per supplier

## Security
- RLS enabled on every table.
- 4 policies per table (SELECT/INSERT/UPDATE/DELETE) scoped TO anon, authenticated
  with USING (true) / WITH CHECK (true) because the app has no sign-in screen and
  the data is intentionally public/shared within the single tenant.
*/

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  unit text NOT NULL DEFAULT 'unidad',
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  sale_price numeric(12,2) NOT NULL DEFAULT 0,
  stock numeric(14,3) NOT NULL DEFAULT 0,
  min_stock numeric(14,3) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tax_id text,
  phone text,
  email text,
  address text,
  city text,
  credit_limit numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tax_id text,
  phone text,
  email text,
  address text,
  city text,
  contact text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PURCHASES
-- ============================================================
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  invoice_number text,
  status text NOT NULL DEFAULT 'confirmada',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  purchase_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL,
  unit_cost numeric(12,2) NOT NULL,
  subtotal numeric(12,2) NOT NULL
);

-- ============================================================
-- SALES
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  invoice_number text,
  status text NOT NULL DEFAULT 'confirmada',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  sale_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  subtotal numeric(12,2) NOT NULL
);

-- ============================================================
-- DELIVERIES
-- ============================================================
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendiente',
  delivery_date timestamptz,
  address text,
  driver text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- COLLECTIONS (COBRANZA)
-- ============================================================
CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL DEFAULT 'efectivo',
  reference text,
  collection_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SUPPLIER PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_id uuid REFERENCES purchases(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL DEFAULT 'efectivo',
  reference text,
  payment_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_sale_id ON deliveries(sale_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_collections_customer_id ON collections(customer_id);
CREATE INDEX IF NOT EXISTS idx_collections_sale_id ON collections(sale_id);
CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(collection_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_date ON supplier_payments(payment_date);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

-- products policies
DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE TO anon, authenticated USING (true);

-- customers policies
DROP POLICY IF EXISTS "anon_select_customers" ON customers;
CREATE POLICY "anon_select_customers" ON customers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_customers" ON customers;
CREATE POLICY "anon_update_customers" ON customers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_customers" ON customers;
CREATE POLICY "anon_delete_customers" ON customers FOR DELETE TO anon, authenticated USING (true);

-- suppliers policies
DROP POLICY IF EXISTS "anon_select_suppliers" ON suppliers;
CREATE POLICY "anon_select_suppliers" ON suppliers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_suppliers" ON suppliers;
CREATE POLICY "anon_insert_suppliers" ON suppliers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_suppliers" ON suppliers;
CREATE POLICY "anon_update_suppliers" ON suppliers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_suppliers" ON suppliers;
CREATE POLICY "anon_delete_suppliers" ON suppliers FOR DELETE TO anon, authenticated USING (true);

-- purchases policies
DROP POLICY IF EXISTS "anon_select_purchases" ON purchases;
CREATE POLICY "anon_select_purchases" ON purchases FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_purchases" ON purchases;
CREATE POLICY "anon_insert_purchases" ON purchases FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_purchases" ON purchases;
CREATE POLICY "anon_update_purchases" ON purchases FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_purchases" ON purchases;
CREATE POLICY "anon_delete_purchases" ON purchases FOR DELETE TO anon, authenticated USING (true);

-- purchase_items policies
DROP POLICY IF EXISTS "anon_select_purchase_items" ON purchase_items;
CREATE POLICY "anon_select_purchase_items" ON purchase_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_purchase_items" ON purchase_items;
CREATE POLICY "anon_insert_purchase_items" ON purchase_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_purchase_items" ON purchase_items;
CREATE POLICY "anon_update_purchase_items" ON purchase_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_purchase_items" ON purchase_items;
CREATE POLICY "anon_delete_purchase_items" ON purchase_items FOR DELETE TO anon, authenticated USING (true);

-- sales policies
DROP POLICY IF EXISTS "anon_select_sales" ON sales;
CREATE POLICY "anon_select_sales" ON sales FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sales" ON sales;
CREATE POLICY "anon_insert_sales" ON sales FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_sales" ON sales;
CREATE POLICY "anon_update_sales" ON sales FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sales" ON sales;
CREATE POLICY "anon_delete_sales" ON sales FOR DELETE TO anon, authenticated USING (true);

-- sale_items policies
DROP POLICY IF EXISTS "anon_select_sale_items" ON sale_items;
CREATE POLICY "anon_select_sale_items" ON sale_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sale_items" ON sale_items;
CREATE POLICY "anon_insert_sale_items" ON sale_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_sale_items" ON sale_items;
CREATE POLICY "anon_update_sale_items" ON sale_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sale_items" ON sale_items;
CREATE POLICY "anon_delete_sale_items" ON sale_items FOR DELETE TO anon, authenticated USING (true);

-- deliveries policies
DROP POLICY IF EXISTS "anon_select_deliveries" ON deliveries;
CREATE POLICY "anon_select_deliveries" ON deliveries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_deliveries" ON deliveries;
CREATE POLICY "anon_insert_deliveries" ON deliveries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_deliveries" ON deliveries;
CREATE POLICY "anon_update_deliveries" ON deliveries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_deliveries" ON deliveries;
CREATE POLICY "anon_delete_deliveries" ON deliveries FOR DELETE TO anon, authenticated USING (true);

-- collections policies
DROP POLICY IF EXISTS "anon_select_collections" ON collections;
CREATE POLICY "anon_select_collections" ON collections FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_collections" ON collections;
CREATE POLICY "anon_insert_collections" ON collections FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_collections" ON collections;
CREATE POLICY "anon_update_collections" ON collections FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_collections" ON collections;
CREATE POLICY "anon_delete_collections" ON collections FOR DELETE TO anon, authenticated USING (true);

-- supplier_payments policies
DROP POLICY IF EXISTS "anon_select_supplier_payments" ON supplier_payments;
CREATE POLICY "anon_select_supplier_payments" ON supplier_payments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_supplier_payments" ON supplier_payments;
CREATE POLICY "anon_insert_supplier_payments" ON supplier_payments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_supplier_payments" ON supplier_payments;
CREATE POLICY "anon_update_supplier_payments" ON supplier_payments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_supplier_payments" ON supplier_payments;
CREATE POLICY "anon_delete_supplier_payments" ON supplier_payments FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- STOCK TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_stock_on_purchase_item_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE products SET stock = stock + NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE products SET stock = stock - OLD.quantity, updated_at = now() WHERE id = OLD.product_id;
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    UPDATE products SET stock = stock + (NEW.quantity - OLD.quantity), updated_at = now() WHERE id = NEW.product_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_items_stock ON purchase_items;
CREATE TRIGGER trg_purchase_items_stock
AFTER INSERT OR DELETE OR UPDATE ON purchase_items
FOR EACH ROW EXECUTE FUNCTION update_stock_on_purchase_item_change();

CREATE OR REPLACE FUNCTION update_stock_on_sale_item_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE products SET stock = stock - NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE products SET stock = stock + OLD.quantity, updated_at = now() WHERE id = OLD.product_id;
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    UPDATE products SET stock = stock - (NEW.quantity - OLD.quantity), updated_at = now() WHERE id = NEW.product_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_items_stock ON sale_items;
CREATE TRIGGER trg_sale_items_stock
AFTER INSERT OR DELETE OR UPDATE ON sale_items
FOR EACH ROW EXECUTE FUNCTION update_stock_on_sale_item_change();

-- ============================================================
-- BALANCE VIEWS
-- ============================================================
CREATE OR REPLACE VIEW customer_balances AS
SELECT
  c.id,
  c.name,
  c.tax_id,
  c.phone,
  c.email,
  c.city,
  c.credit_limit,
  COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.customer_id = c.id AND s.status = 'confirmada'), 0) AS total_purchased,
  COALESCE((SELECT SUM(col.amount) FROM collections col WHERE col.customer_id = c.id), 0) AS total_paid,
  COALESCE((SELECT SUM(s.total) FROM sales s WHERE s.customer_id = c.id AND s.status = 'confirmada'), 0)
    - COALESCE((SELECT SUM(col.amount) FROM collections col WHERE col.customer_id = c.id), 0) AS balance
FROM customers c;

CREATE OR REPLACE VIEW supplier_balances AS
SELECT
  s.id,
  s.name,
  s.tax_id,
  s.phone,
  s.email,
  s.city,
  s.contact,
  COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.supplier_id = s.id AND p.status = 'confirmada'), 0) AS total_purchased,
  COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = s.id), 0) AS total_paid,
  COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.supplier_id = s.id AND p.status = 'confirmada'), 0)
    - COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = s.id), 0) AS balance
FROM suppliers s;

-- Grant access to views
GRANT SELECT ON customer_balances TO anon, authenticated;
GRANT SELECT ON supplier_balances TO anon, authenticated;

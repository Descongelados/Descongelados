-- ============================================================
-- FIX: Eliminar triggers duplicados y reescribir funciones de
--      stock para purchase_items y sale_items de forma robusta.
--
-- Problema raíz:
--   Las migraciones anteriores usaban CREATE OR REPLACE FUNCTION
--   (que reemplaza el cuerpo) pero los triggers antiguos de
--   versiones previas del schema (20260704 y 20260706) podían
--   seguir activos en instancias que se migraron incrementalmente,
--   resultando en doble ejecución del trigger DELETE de
--   purchase_items (-quantity dos veces en lugar de una).
--
-- Solución:
--   1. Eliminar TODOS los triggers conocidos en ambas tablas.
--   2. Recrear UNA SOLA función por tabla, usando aritmética
--      relativa (stock + / stock -) para ser idempotente respecto
--      al orden de lectura.
--   3. Recrear UN SOLO trigger por tabla.
-- ============================================================

-- ── Eliminar todos los triggers conocidos en purchase_items ───
DROP TRIGGER IF EXISTS trg_purchase_items_stock   ON purchase_items;
DROP TRIGGER IF EXISTS trg_purchase_item_stock    ON purchase_items;
DROP TRIGGER IF EXISTS purchase_items_stock       ON purchase_items;

-- ── Eliminar todos los triggers conocidos en sale_items ───────
DROP TRIGGER IF EXISTS trg_sale_items_stock       ON sale_items;
DROP TRIGGER IF EXISTS trg_sale_item_stock        ON sale_items;
DROP TRIGGER IF EXISTS sale_items_stock           ON sale_items;

-- ── FUNCIÓN: movimientos de stock por COMPRAS ─────────────────
--
--   INSERT → stock sube  (se recibió mercancía)
--   DELETE → stock baja  (se revierte la recepción)
--   UPDATE → ajuste neto por diferencia de cantidad
--
CREATE OR REPLACE FUNCTION update_stock_on_purchase_item_change()
RETURNS TRIGGER AS $$
DECLARE
  v_stock_before numeric(14,3);
  v_stock_after  numeric(14,3);
  v_name         text;
  v_sku          text;
  v_folio        text;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    SELECT stock, name, sku INTO v_stock_before, v_name, v_sku
      FROM products WHERE id = NEW.product_id;
    v_stock_after := v_stock_before + NEW.quantity;
    UPDATE products SET stock = v_stock_after, updated_at = now() WHERE id = NEW.product_id;

    SELECT invoice_number INTO v_folio FROM purchases WHERE id = NEW.purchase_id;
    INSERT INTO inventory_logs(product_id, product_name, product_sku, action, stock_before, stock_after, notes)
      VALUES (NEW.product_id, v_name, v_sku, 'purchase', v_stock_before, v_stock_after,
              'Compra ' || COALESCE(v_folio, NEW.purchase_id::text));
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    SELECT stock, name, sku INTO v_stock_before, v_name, v_sku
      FROM products WHERE id = OLD.product_id;
    v_stock_after := v_stock_before - OLD.quantity;
    UPDATE products SET stock = v_stock_after, updated_at = now() WHERE id = OLD.product_id;

    SELECT invoice_number INTO v_folio FROM purchases WHERE id = OLD.purchase_id;
    INSERT INTO inventory_logs(product_id, product_name, product_sku, action, stock_before, stock_after, notes)
      VALUES (OLD.product_id, v_name, v_sku, 'purchase', v_stock_before, v_stock_after,
              'Eliminación compra ' || COALESCE(v_folio, OLD.purchase_id::text));
    RETURN OLD;

  ELSIF (TG_OP = 'UPDATE') THEN
    SELECT stock, name, sku INTO v_stock_before, v_name, v_sku
      FROM products WHERE id = NEW.product_id;
    v_stock_after := v_stock_before + (NEW.quantity - OLD.quantity);
    UPDATE products SET stock = v_stock_after, updated_at = now() WHERE id = NEW.product_id;

    SELECT invoice_number INTO v_folio FROM purchases WHERE id = NEW.purchase_id;
    INSERT INTO inventory_logs(product_id, product_name, product_sku, action, stock_before, stock_after, notes)
      VALUES (NEW.product_id, v_name, v_sku, 'purchase', v_stock_before, v_stock_after,
              'Edición compra ' || COALESCE(v_folio, NEW.purchase_id::text));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_items_stock
AFTER INSERT OR DELETE OR UPDATE ON purchase_items
FOR EACH ROW EXECUTE FUNCTION update_stock_on_purchase_item_change();

-- ── FUNCIÓN: movimientos de stock por VENTAS ──────────────────
--
--   INSERT → stock baja  (se vendió mercancía)
--   DELETE → stock sube  (se revierte la venta)
--   UPDATE → ajuste neto por diferencia de cantidad
--
CREATE OR REPLACE FUNCTION update_stock_on_sale_item_change()
RETURNS TRIGGER AS $$
DECLARE
  v_stock_before numeric(14,3);
  v_stock_after  numeric(14,3);
  v_name         text;
  v_sku          text;
  v_folio        text;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    SELECT stock, name, sku INTO v_stock_before, v_name, v_sku
      FROM products WHERE id = NEW.product_id;
    v_stock_after := v_stock_before - NEW.quantity;
    UPDATE products SET stock = v_stock_after, updated_at = now() WHERE id = NEW.product_id;

    SELECT invoice_number INTO v_folio FROM sales WHERE id = NEW.sale_id;
    INSERT INTO inventory_logs(product_id, product_name, product_sku, action, stock_before, stock_after, notes)
      VALUES (NEW.product_id, v_name, v_sku, 'sale', v_stock_before, v_stock_after,
              'Venta ' || COALESCE(v_folio, NEW.sale_id::text));
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    SELECT stock, name, sku INTO v_stock_before, v_name, v_sku
      FROM products WHERE id = OLD.product_id;
    v_stock_after := v_stock_before + OLD.quantity;
    UPDATE products SET stock = v_stock_after, updated_at = now() WHERE id = OLD.product_id;

    SELECT invoice_number INTO v_folio FROM sales WHERE id = OLD.sale_id;
    INSERT INTO inventory_logs(product_id, product_name, product_sku, action, stock_before, stock_after, notes)
      VALUES (OLD.product_id, v_name, v_sku, 'sale', v_stock_before, v_stock_after,
              'Eliminación venta ' || COALESCE(v_folio, OLD.sale_id::text));
    RETURN OLD;

  ELSIF (TG_OP = 'UPDATE') THEN
    SELECT stock, name, sku INTO v_stock_before, v_name, v_sku
      FROM products WHERE id = NEW.product_id;
    v_stock_after := v_stock_before - (NEW.quantity - OLD.quantity);
    UPDATE products SET stock = v_stock_after, updated_at = now() WHERE id = NEW.product_id;

    SELECT invoice_number INTO v_folio FROM sales WHERE id = NEW.sale_id;
    INSERT INTO inventory_logs(product_id, product_name, product_sku, action, stock_before, stock_after, notes)
      VALUES (NEW.product_id, v_name, v_sku, 'sale', v_stock_before, v_stock_after,
              'Edición venta ' || COALESCE(v_folio, NEW.sale_id::text));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sale_items_stock
AFTER INSERT OR DELETE OR UPDATE ON sale_items
FOR EACH ROW EXECUTE FUNCTION update_stock_on_sale_item_change();

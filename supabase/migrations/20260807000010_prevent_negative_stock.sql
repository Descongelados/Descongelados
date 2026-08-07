-- ============================================================
-- Trigger: prevenir stock negativo en sale_items
--
-- Problema anterior: la validación de stock suficiente se hacía
-- solo en el cliente (Sales.tsx). Si dos vendedores creaban una
-- venta del mismo producto simultáneamente, ambos pasaban la
-- validación y el stock podía quedar negativo.
--
-- Solución: trigger BEFORE INSERT OR UPDATE en sale_items que
-- verifica que el stock restante no sea negativo ANTES de aplicar
-- el movimiento. Si no hay stock suficiente, lanza una excepción
-- que hace rollback de toda la transacción (incluyendo la RPC
-- create_sale / update_sale).
--
-- El trigger existente (trg_sale_items_stock) es AFTER y actualiza
-- stock + logs. Este nuevo trigger es BEFORE y solo valida.
-- ============================================================

CREATE OR REPLACE FUNCTION check_sale_item_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_stock    numeric(14,3);
  v_name     text;
  v_required numeric(14,3);
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_required := NEW.quantity;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Solo la diferencia adicional importa
    v_required := NEW.quantity - OLD.quantity;
  ELSE
    RETURN OLD;
  END IF;

  -- Solo validar si se requiere stock adicional
  IF v_required <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT stock, name INTO v_stock, v_name
  FROM products
  WHERE id = NEW.product_id
  FOR UPDATE;  -- lock para evitar race condition

  IF v_stock < v_required THEN
    RAISE EXCEPTION 'Stock insuficiente para "%" (disponible: %, requerido: %)',
      v_name, v_stock, v_required
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_items_check_stock ON sale_items;
CREATE TRIGGER trg_sale_items_check_stock
BEFORE INSERT OR UPDATE ON sale_items
FOR EACH ROW EXECUTE FUNCTION check_sale_item_stock();

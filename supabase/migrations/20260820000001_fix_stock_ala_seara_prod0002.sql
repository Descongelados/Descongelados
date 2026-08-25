-- ============================================================
-- FIX: Corregir stock real del producto Ala Seara (SKU PROD-0002)
--
-- Causa del error:
--   Al eliminar la compra CMP-2026-2026, el trigger de DELETE en
--   purchase_items se ejecutó DOS VECES (doble trigger activo),
--   restando 30,000 dos veces en lugar de una.
--
-- Secuencia real de movimientos:
--   Stock antes de venta:          47,000
--   Venta VTA-2026-2098  -10,000 → 37,000  ✅
--   Compra CMP-2026-2026 +30,000 → 67,000  ✅
--   Eliminar compra      -60,000 →  7,000  ❌  (debería ser 37,000)
--
-- Este script corrige el stock a su valor real: 37,000
-- y registra el ajuste en inventory_logs.
-- ============================================================

DO $$
DECLARE
  v_product_id   uuid;
  v_stock_actual numeric(14,3);
  v_stock_correcto numeric(14,3) := 37.000;
  v_name         text;
  v_sku          text;
BEGIN
  -- Buscar el producto por SKU
  SELECT id, stock, name, sku
    INTO v_product_id, v_stock_actual, v_name, v_sku
    FROM products
   WHERE sku = 'PROD-0002';

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Producto PROD-0002 no encontrado';
  END IF;

  IF v_stock_actual = v_stock_correcto THEN
    RAISE NOTICE 'Stock de PROD-0002 ya es correcto (%). No se requiere ajuste.', v_stock_actual;
    RETURN;
  END IF;

  -- Corregir el stock
  UPDATE products
     SET stock      = v_stock_correcto,
         updated_at = now()
   WHERE id = v_product_id;

  -- Registrar el ajuste en inventory_logs
  INSERT INTO inventory_logs (
    product_id, product_name, product_sku,
    action, stock_before, stock_after, notes
  ) VALUES (
    v_product_id, v_name, v_sku,
    'edited',
    v_stock_actual,
    v_stock_correcto,
    'Ajuste corrección bug: doble ejecución de trigger DELETE en purchase_items al eliminar CMP-2026-2026. Stock real recalculado manualmente.'
  );

  RAISE NOTICE 'Stock de % corregido: % → %', v_sku, v_stock_actual, v_stock_correcto;
END;
$$;

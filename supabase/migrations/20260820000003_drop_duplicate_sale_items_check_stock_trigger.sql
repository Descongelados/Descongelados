-- Eliminar trigger duplicado detectado en sale_items.
-- trg_sale_items_check_stock estaba activo para INSERT y UPDATE
-- además del trigger oficial trg_sale_items_stock, causando
-- potencial doble ejecución en ventas.

DROP TRIGGER IF EXISTS trg_sale_items_check_stock ON sale_items;

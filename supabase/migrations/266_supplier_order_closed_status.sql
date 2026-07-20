-- 266: Estado 'closed' (Zanjado) para pedidos a proveedor.
-- Cierra un pedido recibido parcialmente cuando el proveedor confirma que no
-- servirá el resto. No toca stock: lo recibido se queda, lo pendiente no entra.
-- Las cantidades pedida/recibida se conservan como registro del nivel de servicio.

ALTER TYPE supplier_order_status ADD VALUE IF NOT EXISTS 'closed';

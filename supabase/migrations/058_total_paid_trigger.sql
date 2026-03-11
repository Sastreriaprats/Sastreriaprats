-- Trigger: actualizar total_paid en tailoring_orders al insertar/actualizar/eliminar pagos
CREATE OR REPLACE FUNCTION update_order_total_paid()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tailoring_orders
  SET total_paid = (
    SELECT COALESCE(SUM(amount), 0)
    FROM tailoring_order_payments
    WHERE tailoring_order_id = COALESCE(NEW.tailoring_order_id, OLD.tailoring_order_id)
  )
  WHERE id = COALESCE(NEW.tailoring_order_id, OLD.tailoring_order_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_order_total_paid ON tailoring_order_payments;
CREATE TRIGGER trg_update_order_total_paid
AFTER INSERT OR UPDATE OR DELETE ON tailoring_order_payments
FOR EACH ROW EXECUTE FUNCTION update_order_total_paid();

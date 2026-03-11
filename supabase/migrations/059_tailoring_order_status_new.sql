-- Nuevos valores en tailoring_order_status
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'in_workshop';
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'pending_first_fitting';
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'note_sent_factory';
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'fabric_ordered_supplier';
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'fabric_at_factory';
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'shipping_to_store';
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'delivered_to_store';
ALTER TYPE tailoring_order_status ADD VALUE IF NOT EXISTS 'order_requested';

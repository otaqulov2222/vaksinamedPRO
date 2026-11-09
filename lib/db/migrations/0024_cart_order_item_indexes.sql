-- Hot-path indexes for cart serialization and order list batching.
CREATE INDEX IF NOT EXISTS cart_items_cart_id_idx ON cart_items (cart_id);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS products_analog_group_idx ON products (analog_group);

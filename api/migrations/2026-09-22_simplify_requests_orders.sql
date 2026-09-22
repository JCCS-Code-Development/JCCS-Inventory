-- Simplifies registering a request/order so the inventory crew isn't
-- blocked waiting on full catalog matching or paperwork every time:
--
-- 1. order_items.item_id becomes nullable, plus a new free-text `description`
--    column — a line can now be registered before it's matched to a real
--    catalog item (same pattern order_discrepancy_items already used). The
--    "Item Setup" stage is where it later gets matched to (or used to
--    create) a real catalog item, same gate as before against receiving.
-- 2. orders.order_date — the date the order was actually placed/purchased,
--    distinct from expected_date (arrival estimate) and created_at (when it
--    was registered here). Registering an order now only requires the
--    attachment, order_number, and this date; everything else (vendor, line
--    items, invoice/receipt numbers, etc.) is optional and can be filled in
--    later.
--
-- Deploy copies files only (see .cpanel.yml) — it does not run schema.sql
-- again — so run this by hand against the live `jccs_inventory` database
-- once after deploying the code that expects these columns.
--
-- Safe to run once; re-running fails with "Duplicate column name" (harmless).

ALTER TABLE `order_items`
  MODIFY COLUMN `item_id` INT UNSIGNED NULL,
  ADD COLUMN `description` VARCHAR(500) NULL AFTER `item_id`;

ALTER TABLE `orders`
  ADD COLUMN `order_date` DATE NULL AFTER `attachment_path`;

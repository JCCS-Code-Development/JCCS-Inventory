-- Adds an "item setup" stage between placing an order and receiving it.
--
-- A newly created order now starts as `awaiting_item_setup` instead of
-- `placed`. An Inventory Lead works through each line on the Orders page's
-- "Item Setup" tab, confirming the linked catalog item is properly named
-- (name + SKU + category) and isn't a duplicate of something already in
-- inventory. Once every line is confirmed the order flips to `placed` and
-- becomes visible to the Receiving tab (which only lists
-- placed/partially_received orders), so nothing can be received against an
-- order whose items aren't sorted out yet.
--
-- item_confirmed_at IS NULL  => that line still needs setup.
-- Existing rows keep their current status, so only orders created after this
-- migration go through the new gate.
--
-- Deploy copies files only (see .cpanel.yml) — it does not run schema.sql
-- again — so run this by hand against the live `jccs_inventory` database
-- once after deploying the code that expects these columns.
--
-- Safe to run once; re-running the ADD COLUMN part fails with "Duplicate
-- column name" (harmless). The MODIFY COLUMN is idempotent.

ALTER TABLE `orders`
  MODIFY COLUMN `status`
    ENUM('awaiting_item_setup','placed','partially_received','received','cancelled')
    NOT NULL DEFAULT 'awaiting_item_setup';

ALTER TABLE `order_items`
  ADD COLUMN `item_confirmed_at` TIMESTAMP    NULL DEFAULT NULL AFTER `unit_cost`,
  ADD COLUMN `item_confirmed_by` INT UNSIGNED NULL             AFTER `item_confirmed_at`,
  ADD CONSTRAINT `fk_oi_confirmed_by`
    FOREIGN KEY (`item_confirmed_by`) REFERENCES `inventory_user_roles` (`fieldclock_user_id`) ON DELETE SET NULL;

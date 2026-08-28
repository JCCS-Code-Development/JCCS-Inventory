-- Ties each order request to a real vendor and a real catalog item, set by
-- the Inventory Lead during review. Replaces the old "free-text vendor_hint +
-- no item, match a catalog item later" flow: from now on review pins down
-- vendor + product link + catalog item, and only then is a request "ready to
-- order". This is what lets the Orders "Ready to Order" queue group by vendor,
-- and what lets an order built from requests carry real line items straight
-- into Receiving (which matches on item_id).
--
-- vendor_hint stays as harmless free-text context; vendor_id is the real link.
--
-- Deploy copies files only (see .cpanel.yml) — it does not run schema.sql
-- again — so run this by hand against the live `jccs_inventory` database
-- once after deploying the code that expects these columns.
--
-- Safe to run once; re-running will fail with "Duplicate column name" (harmless).

ALTER TABLE `order_requests`
  ADD COLUMN `vendor_id` INT UNSIGNED NULL AFTER `vendor_hint`,
  ADD COLUMN `item_id`   INT UNSIGNED NULL AFTER `vendor_id`,
  ADD KEY `idx_requests_vendor` (`vendor_id`),
  ADD KEY `idx_requests_item`   (`item_id`),
  ADD CONSTRAINT `fk_request_vendor` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_request_item`   FOREIGN KEY (`item_id`)   REFERENCES `items` (`id`)   ON DELETE SET NULL;

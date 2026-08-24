-- Adds the Inventory Lead's review fields to existing order_requests tickets:
-- which project the request is for, and a link to the specific product
-- agreed on during the in-person review. Deploy copies files only (see
-- .cpanel.yml) — it does not run schema.sql again — so run this by hand
-- against the live `jccs_inventory` database once after deploying the code
-- that expects these columns.
--
-- Safe to run once; re-running will fail with "Duplicate column name" (harmless).

ALTER TABLE `order_requests`
  ADD COLUMN `project_id`   INT UNSIGNED NULL AFTER `location_id`,
  ADD COLUMN `product_link` VARCHAR(500) NULL AFTER `project_id`,
  ADD KEY `idx_requests_project` (`project_id`),
  ADD CONSTRAINT `fk_request_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL;

-- Adds a plain-language "what job this is for" note to order_requests,
-- independent of project_id/the Estimate # itself — lets the Inventory Lead
-- write down the job now even without a confirmed 4-digit number, and go
-- back to fix project_id/the Estimate # later. No other schema change is
-- needed for full ticket editing (description/qty/unit/vendor hint/
-- location/notes) — those columns already exist, only api/requests/item.php
-- changed to allow editing them.
--
-- Deploy copies files only (see .cpanel.yml) — it does not run schema.sql
-- again — so run this by hand against the live `jccs_inventory` database
-- once after deploying the code that expects this column.
--
-- Safe to run once; re-running will fail with "Duplicate column name" (harmless).

ALTER TABLE `order_requests`
  ADD COLUMN `project_note` VARCHAR(255) NULL AFTER `project_id`;

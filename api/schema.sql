-- JCCS Inventory — separate database from FieldClock.
-- Auth is not stored here: users authenticate against FieldClock's existing
-- login, and this API validates the resulting JWT with a shared JWT_SECRET
-- (see config/config.php). inventory_user_roles is the only "user" table —
-- it maps a FieldClock user id to an Inventory-specific role.
--
-- Three roles:
--   user       — check availability, take/drop off stock (project tag optional)
--   specialist — all of the above, plus receive/count, register new products,
--                view (not create/delete) orders, project cost registry
--   admin      — total control: manage users, locations, vendors, projects,
--                create/delete orders, everything specialist can do

CREATE TABLE `inventory_user_roles` (
  `fieldclock_user_id` INT UNSIGNED NOT NULL,
  `name`               VARCHAR(100) NOT NULL,
  `role`               ENUM('admin','specialist','user') NOT NULL DEFAULT 'user',
  `is_active`          TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fieldclock_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `locations` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(150) NOT NULL,
  `address`    VARCHAR(255) NULL,
  `is_active`  TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `categories` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_category_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Specific material within a category (e.g. category "Flooring" → materials
-- "Vinyl", "Hardwood", "Tile"). Quick-added from the Items form the same way
-- categories are, but always scoped to a category.
CREATE TABLE `materials` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` INT UNSIGNED NOT NULL,
  `name`        VARCHAR(100) NOT NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_material_per_category` (`category_id`, `name`),
  CONSTRAINT `fk_material_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `vendors` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(150) NOT NULL,
  `contact_name` VARCHAR(150) NULL,
  `email`        VARCHAR(180) NULL,
  `phone`        VARCHAR(20)  NULL,
  `address`      VARCHAR(255) NULL,
  `notes`        TEXT         NULL,
  `is_active`    TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Projects/jobs stock gets charged against, for the labor-cost registry.
-- Identified by a 4-digit Estimate # (project_number) — that's what gets
-- typed in on Items/Take-Drop-off, and it's unique so a number always
-- resolves to exactly one project. Full management (name, client, status)
-- is admin-only; any role can conjure a bare-bones project into existence
-- just by typing a number that doesn't exist yet (see projects/resolve.php).
-- `status` is a lifecycle label (active work vs. wrapped up) — separate from
-- `is_active`, which just controls whether it still shows up in pickers.
-- Cost history stays visible in Reports regardless of either flag.
CREATE TABLE `projects` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`            VARCHAR(150) NOT NULL,
  `project_number`  VARCHAR(4)   NOT NULL, -- exactly 4 digits — the Estimate #
  `client_name`     VARCHAR(150) NULL,
  `client_address`  VARCHAR(255) NULL,
  `status`          ENUM('active','completed') NOT NULL DEFAULT 'active',
  `is_active`       TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_number` (`project_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `items` (
  `id`                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `sku`                 VARCHAR(60)   NOT NULL,
  `name`                VARCHAR(200)  NOT NULL,
  `category_id`         INT UNSIGNED  NULL,
  `material_id`         INT UNSIGNED  NULL,
  `unit_of_measure`     VARCHAR(30)   NOT NULL DEFAULT 'each',
  `vendor_id`           INT UNSIGNED  NULL,
  `vendor_item_number`  VARCHAR(100)  NULL, -- the vendor/manufacturer's own catalog or part number, not your SKU
  `dimensions`          VARCHAR(100)  NULL, -- freeform: "48in x 96in x 0.5in", "1 gal", "Size L" — varies too much by item type for a rigid structure
  `unit_cost`           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `reorder_point`       INT UNSIGNED  NOT NULL DEFAULT 0,
  `lead_time_days`      INT UNSIGNED  NULL, -- typical shipping time from this vendor for this item; drives the reorder-planning report
  `image_path`          VARCHAR(255)  NULL, -- relative path under api/uploads/items/, e.g. "items/14.jpg" — set via items/image.php
  -- Convenience default only — pre-fills the project field at checkout, does
  -- not restrict or dedicate the item's stock to that project.
  `default_project_id` INT UNSIGNED NULL,
  `notes`           TEXT          NULL,
  `is_active`       TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_item_sku` (`sku`),
  CONSTRAINT `fk_item_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_item_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_item_vendor`   FOREIGN KEY (`vendor_id`)   REFERENCES `vendors` (`id`)   ON DELETE SET NULL,
  CONSTRAINT `fk_item_project`  FOREIGN KEY (`default_project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A single item can have more than one barcode on file — vendors commonly
-- print a different barcode on a single unit vs. a box vs. a pallet of the
-- same product. Whichever one gets scanned, it should resolve back to the
-- same item. `label` is optional freeform context ("Box", "Pallet", "Case").
CREATE TABLE `item_barcodes` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `item_id`    INT UNSIGNED NOT NULL,
  `barcode`    VARCHAR(64)  NOT NULL,
  `label`      VARCHAR(50)  NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_barcode` (`barcode`),
  KEY `idx_item_barcodes_item` (`item_id`),
  CONSTRAINT `fk_item_barcode_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Current on-hand quantity per item per location. Rows are created lazily —
-- the first stock-affecting transaction for an (item, location) pair inserts it.
CREATE TABLE `item_stock` (
  `item_id`     INT UNSIGNED   NOT NULL,
  `location_id` INT UNSIGNED   NOT NULL,
  `qty_on_hand` DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  `updated_at`  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`item_id`, `location_id`),
  CONSTRAINT `fk_stock_item`     FOREIGN KEY (`item_id`)     REFERENCES `items` (`id`)     ON DELETE CASCADE,
  CONSTRAINT `fk_stock_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Purchase orders. Admin creates/deletes; specialist views status/details and
-- fulfills them via stock_transactions (type='receive', order_id set), which
-- increments order_items.qty_received.
CREATE TABLE `orders` (
  `id`                       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `order_number`             VARCHAR(60)   NULL,
  `vendor_id`                INT UNSIGNED  NULL,
  `status`                   ENUM('placed','partially_received','received','cancelled') NOT NULL DEFAULT 'placed',
  -- 'online' = placed with a vendor, arrives later (expected_date/invoice_number apply).
  -- 'dropoff' = already bought in person and being logged/stored now (purchased_by/
  -- receipt_number/destination_location_id apply). Same orders/order_items records
  -- either way — only which fields are expected differs, enforced in the API layer.
  `order_type`               ENUM('online','dropoff') NOT NULL DEFAULT 'online',
  `invoice_number`           VARCHAR(60)   NULL,
  `receipt_number`           VARCHAR(60)   NULL,
  `purchased_by_user_id`     INT UNSIGNED  NULL, -- who physically bought it (dropoff flow) — an inventory_user_roles account
  `destination_location_id`  INT UNSIGNED  NULL, -- which warehouse it's being stored at
  `attachment_path`          VARCHAR(255)  NULL, -- the scanned receipt photo or invoice PDF, kept as the permanent record
  `expected_date`            DATE          NULL,
  `notes`                    TEXT          NULL,
  `placed_by`                INT UNSIGNED  NOT NULL,
  `created_at`               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_order_vendor`      FOREIGN KEY (`vendor_id`)               REFERENCES `vendors` (`id`)              ON DELETE SET NULL,
  CONSTRAINT `fk_order_purchaser`   FOREIGN KEY (`purchased_by_user_id`)    REFERENCES `inventory_user_roles` (`fieldclock_user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_order_destination` FOREIGN KEY (`destination_location_id`) REFERENCES `locations` (`id`)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `order_items` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `order_id`     INT UNSIGNED  NOT NULL,
  `item_id`      INT UNSIGNED  NOT NULL,
  `qty_ordered`  DECIMAL(12,2) NOT NULL,
  `qty_received` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `unit_cost`    DECIMAL(10,2) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order` (`order_id`),
  CONSTRAINT `fk_oi_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oi_item`  FOREIGN KEY (`item_id`)  REFERENCES `items` (`id`)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Filed when the in-person delivery check (the Receiving checklist) turns up
-- something short or extra against an order. One report per checklist
-- submission, bundling every discrepancy found in that truck/delivery —
-- the compiled "Discrepancies" view groups these by vendor so an Inventory
-- Lead or admin can chase a refund/credit. vendor_id is copied from the
-- order at report time so grouping/filtering doesn't need a join through
-- orders (and survives the order's own vendor_id changing later).
CREATE TABLE `order_discrepancy_reports` (
  `id`                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `order_id`          INT UNSIGNED  NOT NULL,
  `vendor_id`         INT UNSIGNED  NULL,
  `status`            ENUM('open','resolved') NOT NULL DEFAULT 'open',
  `resolution_notes`  TEXT          NULL,
  `resolved_by`       INT UNSIGNED  NULL,
  `resolved_at`       TIMESTAMP     NULL,
  `reported_by`       INT UNSIGNED  NOT NULL,
  `notes`             TEXT          NULL,
  `created_at`        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_discrepancy_vendor` (`vendor_id`),
  KEY `idx_discrepancy_status` (`status`),
  CONSTRAINT `fk_discrepancy_order`  FOREIGN KEY (`order_id`)  REFERENCES `orders` (`id`)  ON DELETE CASCADE,
  CONSTRAINT `fk_discrepancy_vendor` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per short/extra line within a report. item_id is NULL for an
-- "extra" item that isn't in the catalog at all (vendor sent something
-- unrecognized) — description carries the free-text identification instead.
CREATE TABLE `order_discrepancy_items` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `report_id`    INT UNSIGNED  NOT NULL,
  `item_id`      INT UNSIGNED  NULL,
  `type`         ENUM('missing','extra') NOT NULL,
  `qty`          DECIMAL(12,2) NOT NULL,
  `description`  VARCHAR(255)  NULL,
  PRIMARY KEY (`id`),
  KEY `idx_discrepancy_items_report` (`report_id`),
  CONSTRAINT `fk_discrepancy_item_report` FOREIGN KEY (`report_id`) REFERENCES `order_discrepancy_reports` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_discrepancy_item_item`   FOREIGN KEY (`item_id`)   REFERENCES `items` (`id`)                    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The "I need something ordered" ticket. Created by an Inventory Lead / admin
-- only (basic workers don't file these any more). Starts as plain free text
-- (description + optional qty/unit) and the Lead pins the rest down during
-- review: which vendor to buy from, the specific product page, the catalog
-- item it maps to, and optionally which job it's for. order_id is set once
-- the request has been rolled into a real order, closing the loop.
--
-- vendor_id/item_id/product_link are the review fields — a request is only
-- "ready to order" once vendor + product_link + item_id are all set. Setting
-- the catalog item at review (not later) is what keeps Receiving working:
-- an order built from requests carries real order_items, matched on item_id.
-- vendor_hint is kept as harmless free-text context; vendor_id is the real
-- link. Enforced server-side (see api/requests/index.php, item.php).
CREATE TABLE `order_requests` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `requested_by`     INT UNSIGNED  NOT NULL,
  `description`      VARCHAR(500)  NOT NULL,
  `qty_requested`    DECIMAL(12,2) NULL,
  `unit_of_measure`  VARCHAR(30)   NULL,
  `vendor_hint`      VARCHAR(150)  NULL, -- "usually get these from Grainger" — free-text context, superseded by vendor_id at review
  `vendor_id`        INT UNSIGNED  NULL, -- real vendor to buy from — set at review time
  `item_id`          INT UNSIGNED  NULL, -- catalog item this maps to — set at review time, carried onto the order line
  `location_id`      INT UNSIGNED  NULL, -- where it's needed, if known
  `project_id`       INT UNSIGNED  NULL, -- job this is charged/tied to — set at review time
  -- Plain-language "what job this is for", independent of project_id/the
  -- Estimate # itself. Lets the Lead pin down *which* job right away even
  -- when they don't have (or aren't sure of) the actual 4-digit number yet
  -- — they can type a project number now as a placeholder and come back to
  -- correct project_id/the Estimate # later without losing track of what
  -- this ticket was actually for.
  `project_note`     VARCHAR(255)  NULL,
  `product_link`     VARCHAR(500)  NULL, -- URL to the specific product, agreed on during the review
  `notes`            TEXT          NULL,
  `status`           ENUM('open','ordered','declined') NOT NULL DEFAULT 'open',
  `order_id`         INT UNSIGNED  NULL,
  `decline_reason`   VARCHAR(300)  NULL,
  `resolved_by`      INT UNSIGNED  NULL,
  `resolved_at`      TIMESTAMP     NULL,
  `created_at`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_requests_requested_by` (`requested_by`),
  KEY `idx_requests_status` (`status`),
  KEY `idx_requests_project` (`project_id`),
  KEY `idx_requests_vendor` (`vendor_id`),
  KEY `idx_requests_item` (`item_id`),
  CONSTRAINT `fk_request_user`     FOREIGN KEY (`requested_by`) REFERENCES `inventory_user_roles` (`fieldclock_user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_request_location` FOREIGN KEY (`location_id`)  REFERENCES `locations` (`id`)                            ON DELETE SET NULL,
  CONSTRAINT `fk_request_project`  FOREIGN KEY (`project_id`)   REFERENCES `projects` (`id`)                             ON DELETE SET NULL,
  CONSTRAINT `fk_request_vendor`   FOREIGN KEY (`vendor_id`)    REFERENCES `vendors` (`id`)                              ON DELETE SET NULL,
  CONSTRAINT `fk_request_item`     FOREIGN KEY (`item_id`)      REFERENCES `items` (`id`)                                ON DELETE SET NULL,
  CONSTRAINT `fk_request_order`    FOREIGN KEY (`order_id`)     REFERENCES `orders` (`id`)                               ON DELETE SET NULL,
  CONSTRAINT `fk_request_resolver` FOREIGN KEY (`resolved_by`)  REFERENCES `inventory_user_roles` (`fieldclock_user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Full audit trail behind every quantity change. 'receive' and
-- 'count_adjustment' are specialist/admin only; 'checkout'/'checkin' are
-- open to all three roles. project_id + taken_by_name apply to
-- checkout/checkin (who took it and what job it's charged to); order_id
-- links a receive back to the PO it's fulfilling.
CREATE TABLE `stock_transactions` (
  `id`                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `item_id`             INT UNSIGNED  NOT NULL,
  `location_id`         INT UNSIGNED  NOT NULL,
  `type`                ENUM('receive','count_adjustment','checkout','checkin') NOT NULL,
  `qty_delta`           DECIMAL(12,2) NOT NULL,
  `qty_after`           DECIMAL(12,2) NOT NULL,
  `vendor_id`           INT UNSIGNED  NULL,
  `unit_cost`           DECIMAL(10,2) NULL,
  `reference`           VARCHAR(100)  NULL,
  `notes`               TEXT          NULL,
  `order_id`            INT UNSIGNED  NULL,
  `project_id`          INT UNSIGNED  NULL,
  `taken_by_name`       VARCHAR(150)  NULL,
  `fieldclock_user_id`  INT UNSIGNED  NOT NULL,
  `created_at`          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_txn_item_location` (`item_id`, `location_id`),
  KEY `idx_txn_created_at` (`created_at`),
  KEY `idx_txn_project` (`project_id`),
  CONSTRAINT `fk_txn_item`     FOREIGN KEY (`item_id`)     REFERENCES `items` (`id`)     ON DELETE CASCADE,
  CONSTRAINT `fk_txn_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_txn_vendor`   FOREIGN KEY (`vendor_id`)   REFERENCES `vendors` (`id`)   ON DELETE SET NULL,
  CONSTRAINT `fk_txn_order`    FOREIGN KEY (`order_id`)    REFERENCES `orders` (`id`)    ON DELETE SET NULL,
  CONSTRAINT `fk_txn_project`  FOREIGN KEY (`project_id`)  REFERENCES `projects` (`id`)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed data
INSERT INTO `locations` (`name`, `address`) VALUES
  ('1200 Woodruff Rd.', '1200 Woodruff Rd.'),
  ('109 E Miller', '109 E Miller');

-- Starter material-type categories — this is the mechanism for "what kind of
-- material is this" (paint vs. flooring vs. electrical, etc.), not barcodes.
-- Admins/leads can add more any time from the Items page.
INSERT INTO `categories` (`name`) VALUES
  ('Paint & Coatings'),
  ('Flooring'),
  ('Electrical'),
  ('Plumbing'),
  ('Millwork'),
  ('Fasteners & Hardware'),
  ('Concrete'),
  ('Office Materials'),
  ('Tools & Equipment'),
  ('Solid Surface Countertops');

-- A starter material breakdown for a few categories, so the Material dropdown
-- isn't empty on day one. Admins/leads can add more from the Items page.
INSERT INTO `materials` (`category_id`, `name`)
SELECT id, m.name FROM categories, (
  SELECT 'Flooring' AS category, 'Vinyl' AS name UNION ALL
  SELECT 'Flooring', 'Hardwood' UNION ALL
  SELECT 'Flooring', 'Tile' UNION ALL
  SELECT 'Flooring', 'Carpet' UNION ALL
  SELECT 'Paint & Coatings', 'Latex' UNION ALL
  SELECT 'Paint & Coatings', 'Oil-Based' UNION ALL
  SELECT 'Paint & Coatings', 'Primer' UNION ALL
  SELECT 'Fasteners & Hardware', 'Steel' UNION ALL
  SELECT 'Fasteners & Hardware', 'Stainless Steel' UNION ALL
  SELECT 'Millwork', 'Poplar' UNION ALL
  SELECT 'Millwork', 'Pine' UNION ALL
  SELECT 'Millwork', 'Oak' UNION ALL
  SELECT 'Millwork', 'MDF'
) m WHERE categories.name = m.category;

-- Adds the task-management system: recurring task templates, tasks
-- (recurring/event/improvement/manual), their checklists/attachments/history,
-- tool checkout tracking, and manager-configurable notification rules.
--
-- Purely additive: two new nullable/defaulted columns on `items`
-- (is_trackable_asset, expiration_date) that no existing query selects, plus
-- brand-new tables. Nothing existing changes shape or behavior.
--
-- Deploy copies files only (see .cpanel.yml) — it does not run schema.sql
-- again — so run this by hand against the live `jccs_inventory` database
-- once after deploying the code that expects these tables/columns.
--
-- After running this, an admin should also add a cPanel Cron Jobs entry to
-- run api/cron/generate-tasks.php on a schedule (daily is fine to start) —
-- that part can't be done from a SQL migration.
--
-- Safe to run once; re-running the ALTER TABLE / CREATE TABLE statements
-- fails with "Duplicate column name" / "Table already exists" (harmless).

ALTER TABLE `items`
  ADD COLUMN `is_trackable_asset` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`,
  ADD COLUMN `expiration_date`    DATE NULL AFTER `is_trackable_asset`;

CREATE TABLE `task_templates` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`               VARCHAR(200) NOT NULL,
  `instructions`        TEXT NULL,
  `category`            ENUM('recurring','improvement') NOT NULL,
  `frequency`           ENUM('daily','weekly','monthly','quarterly') NULL,
  `day_of_week`         TINYINT UNSIGNED NULL,
  `day_of_month`        TINYINT UNSIGNED NULL,
  `default_priority`    ENUM('low','normal','high') NOT NULL DEFAULT 'normal',
  `default_assignee`    INT UNSIGNED NULL,
  `default_location_id` INT UNSIGNED NULL,
  `requires_approval`   TINYINT(1) NOT NULL DEFAULT 0,
  `requires_photo`      TINYINT(1) NOT NULL DEFAULT 0,
  `requires_note`       TINYINT(1) NOT NULL DEFAULT 0,
  `requires_qty`        TINYINT(1) NOT NULL DEFAULT 0,
  `is_active`           TINYINT(1) NOT NULL DEFAULT 1,
  `last_generated_on`   DATE NULL,
  `created_by`          INT UNSIGNED NOT NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_tt_assignee` FOREIGN KEY (`default_assignee`)    REFERENCES `inventory_user_roles` (`fieldclock_user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tt_location` FOREIGN KEY (`default_location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tt_creator`  FOREIGN KEY (`created_by`)          REFERENCES `inventory_user_roles` (`fieldclock_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `task_template_checklist` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `template_id` INT UNSIGNED NOT NULL,
  `label`       VARCHAR(255) NOT NULL,
  `sort_order`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_ttc_template` (`template_id`),
  CONSTRAINT `fk_ttc_template` FOREIGN KEY (`template_id`) REFERENCES `task_templates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `tasks` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source`            ENUM('recurring','event','improvement','manual') NOT NULL,
  `template_id`       INT UNSIGNED NULL,
  `trigger_key`       VARCHAR(50) NULL,
  `trigger_ref_id`    INT UNSIGNED NULL,
  `title`             VARCHAR(200) NOT NULL,
  `instructions`      TEXT NULL,
  `category`          VARCHAR(50) NULL,
  `priority`          ENUM('low','normal','high') NOT NULL DEFAULT 'normal',
  `status`            ENUM('to_do','in_progress','waiting_approval','waiting_delivery','blocked','completed','canceled') NOT NULL DEFAULT 'to_do',
  `status_note`       TEXT NULL,
  `follow_up_at`      DATE NULL,
  `assigned_to`       INT UNSIGNED NULL,
  `location_id`       INT UNSIGNED NULL,
  `item_id`           INT UNSIGNED NULL,
  `project_id`        INT UNSIGNED NULL,
  `linked_order_id`   INT UNSIGNED NULL,
  `requires_approval` TINYINT(1) NOT NULL DEFAULT 0,
  `requires_photo`    TINYINT(1) NOT NULL DEFAULT 0,
  `requires_note`     TINYINT(1) NOT NULL DEFAULT 0,
  `requires_qty`      TINYINT(1) NOT NULL DEFAULT 0,
  `completion_notes`  TEXT NULL,
  `completed_qty`     DECIMAL(12,2) NULL,
  `due_at`            DATETIME NULL,
  `created_by`        INT UNSIGNED NOT NULL,
  `completed_by`      INT UNSIGNED NULL,
  `completed_at`      TIMESTAMP NULL,
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tasks_assignee` (`assigned_to`),
  KEY `idx_tasks_status` (`status`),
  KEY `idx_tasks_due` (`due_at`),
  KEY `idx_tasks_trigger` (`trigger_key`, `trigger_ref_id`),
  CONSTRAINT `fk_task_template`   FOREIGN KEY (`template_id`)     REFERENCES `task_templates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_task_assignee`   FOREIGN KEY (`assigned_to`)     REFERENCES `inventory_user_roles` (`fieldclock_user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_task_location`   FOREIGN KEY (`location_id`)     REFERENCES `locations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_task_item`       FOREIGN KEY (`item_id`)         REFERENCES `items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_task_project`    FOREIGN KEY (`project_id`)      REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_task_order`      FOREIGN KEY (`linked_order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_task_creator`    FOREIGN KEY (`created_by`)      REFERENCES `inventory_user_roles` (`fieldclock_user_id`),
  CONSTRAINT `fk_task_completer`  FOREIGN KEY (`completed_by`)    REFERENCES `inventory_user_roles` (`fieldclock_user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `task_checklist_items` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id`    INT UNSIGNED NOT NULL,
  `label`      VARCHAR(255) NOT NULL,
  `is_checked` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_tci_task` (`task_id`),
  CONSTRAINT `fk_tci_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `task_attachments` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id`     INT UNSIGNED NOT NULL,
  `file_path`   VARCHAR(255) NOT NULL,
  `uploaded_by` INT UNSIGNED NOT NULL,
  `uploaded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ta_task` (`task_id`),
  CONSTRAINT `fk_ta_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ta_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `inventory_user_roles` (`fieldclock_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `task_history` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id`    INT UNSIGNED NOT NULL,
  `actor_id`   INT UNSIGNED NOT NULL,
  `action`     VARCHAR(40) NOT NULL,
  `from_value` VARCHAR(255) NULL,
  `to_value`   VARCHAR(255) NULL,
  `note`       TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_th_task` (`task_id`),
  CONSTRAINT `fk_th_task`  FOREIGN KEY (`task_id`)  REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_th_actor` FOREIGN KEY (`actor_id`) REFERENCES `inventory_user_roles` (`fieldclock_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `tool_checkouts` (
  `id`                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `item_id`                  INT UNSIGNED NOT NULL,
  `assigned_to`              INT UNSIGNED NOT NULL,
  `checked_out_by`           INT UNSIGNED NOT NULL,
  `checked_out_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `due_back_at`              DATE NULL,
  `returned_at`              TIMESTAMP NULL,
  `returned_condition_notes` TEXT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tc_item` (`item_id`),
  KEY `idx_tc_assignee` (`assigned_to`),
  CONSTRAINT `fk_tc_item`         FOREIGN KEY (`item_id`)        REFERENCES `items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tc_assignee`     FOREIGN KEY (`assigned_to`)    REFERENCES `inventory_user_roles` (`fieldclock_user_id`),
  CONSTRAINT `fk_tc_checkedoutby` FOREIGN KEY (`checked_out_by`) REFERENCES `inventory_user_roles` (`fieldclock_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `notification_rules` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `condition_key`     ENUM('task_due_today','task_overdue','low_stock','tool_overdue','pending_approval','delivery_not_arrived') NOT NULL,
  `is_enabled`        TINYINT(1) NOT NULL DEFAULT 1,
  `recipient_role`    ENUM('admin','specialist') NULL,
  `recipient_user_id` INT UNSIGNED NULL,
  `updated_by`        INT UNSIGNED NOT NULL,
  `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_nr_recipient` FOREIGN KEY (`recipient_user_id`) REFERENCES `inventory_user_roles` (`fieldclock_user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_nr_updater`   FOREIGN KEY (`updated_by`)        REFERENCES `inventory_user_roles` (`fieldclock_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `notification_log` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rule_id`       INT UNSIGNED NULL,
  `condition_key` VARCHAR(50) NOT NULL,
  `ref_id`        INT UNSIGNED NULL,
  `recipient`     VARCHAR(180) NOT NULL,
  `sent_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_nl_dedupe` (`condition_key`, `ref_id`, `sent_at`),
  CONSTRAINT `fk_nl_rule` FOREIGN KEY (`rule_id`) REFERENCES `notification_rules` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

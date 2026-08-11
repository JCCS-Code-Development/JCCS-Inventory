<?php
// ─────────────────────────────────────────────────
// JCCS Inventory — server configuration TEMPLATE
// Copy this to config.php on the server (never commit config.php itself —
// it's gitignored, same as FieldClock's). Protect with .htaccess: Deny from all
// ─────────────────────────────────────────────────

// Database — this is Inventory's OWN separate database, not FieldClock's.
define('DB_HOST', 'localhost');
define('DB_NAME', 'jccs_inventory');
define('DB_USER', 'inventory_user');
define('DB_PASS', 'CHANGE_ME');

// JWT — MUST be copied verbatim from FieldClock's production config.php
// (api/config/config.php, JWT_SECRET constant) so a token issued by
// FieldClock's login validates here too. Do not generate a new one.
define('JWT_SECRET', 'COPY_FROM_FIELDCLOCK_CONFIG_PHP');

// App
define('FRONTEND_ORIGIN', 'https://inventory.jccs-services.com');

// The API's own public base URL — used to build absolute URLs for uploaded
// item photos (api/uploads/items/...). No trailing slash.
define('APP_URL', 'https://inventory.jccs-services.com/api');

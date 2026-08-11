<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// requireAuth() already does the FieldClock-JWT-verify + inventory_user_roles
// lookup this endpoint exists to expose to the frontend right after login.
$auth = requireAuth();
echo json_encode(['user_id' => $auth['user_id'], 'name' => $auth['name'], 'role' => $auth['role']]);

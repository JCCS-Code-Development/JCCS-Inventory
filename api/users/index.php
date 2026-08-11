<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

const VALID_ROLES = ['admin', 'specialist', 'user'];

if ($method === 'GET') {
    // Read-only list is also needed by the Orders drop-off flow (picking who
    // physically bought something), not just user management — open it to
    // specialists too. Managing roles (POST/PUT/DELETE) stays admin-only.
    requireSpecialistOrAdmin($auth);
    $stmt = $pdo->query('SELECT * FROM inventory_user_roles ORDER BY name');
    echo json_encode(['users' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    requireInventoryAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['fieldclock_user_id', 'name', 'role']);

    $fcId = (int)$body['fieldclock_user_id'];
    $role = $body['role'];
    if (!in_array($role, VALID_ROLES, true)) {
        http_response_code(422); exit(json_encode(['error' => 'Role must be admin, specialist, or user']));
    }

    $dupe = $pdo->prepare('SELECT fieldclock_user_id FROM inventory_user_roles WHERE fieldclock_user_id = ?');
    $dupe->execute([$fcId]);
    if ($dupe->fetch()) { http_response_code(422); exit(json_encode(['error' => 'That FieldClock user is already provisioned'])); }

    $pdo->prepare('INSERT INTO inventory_user_roles (fieldclock_user_id, name, role) VALUES (?, ?, ?)')
        ->execute([$fcId, sanitizeString($body['name']), $role]);
    echo json_encode(['message' => 'User provisioned']);

} else { http_response_code(405); }

<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
requireInventoryAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
// This table's primary key is the FieldClock user id itself, not a local autoincrement id.
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

if ($method === 'PUT') {
    $body = jsonBody();
    $sets = []; $params = [];

    if (array_key_exists('name', $body) && $body['name'] !== '') {
        $sets[] = 'name = ?'; $params[] = sanitizeString($body['name']);
    }
    if (array_key_exists('role', $body)) {
        if (!in_array($body['role'], ['admin', 'specialist', 'user'], true)) {
            http_response_code(422); exit(json_encode(['error' => 'Role must be admin, specialist, or user']));
        }
        if ($id === $auth['user_id'] && $body['role'] !== 'admin') {
            http_response_code(422); exit(json_encode(['error' => "You can't demote your own account"]));
        }
        $sets[] = 'role = ?'; $params[] = $body['role'];
    }
    if (array_key_exists('is_active', $body)) {
        if ($id === $auth['user_id'] && !$body['is_active']) {
            http_response_code(422); exit(json_encode(['error' => "You can't deactivate your own account"]));
        }
        $sets[] = 'is_active = ?'; $params[] = (int)$body['is_active'];
    }
    if (!$sets) { echo json_encode(['message' => 'Nothing to update']); exit; }
    $params[] = $id;
    $pdo->prepare('UPDATE inventory_user_roles SET ' . implode(', ', $sets) . ' WHERE fieldclock_user_id = ?')->execute($params);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    if ($id === $auth['user_id']) {
        http_response_code(422); exit(json_encode(['error' => "You can't deactivate your own account"]));
    }
    $pdo->prepare('UPDATE inventory_user_roles SET is_active = 0 WHERE fieldclock_user_id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deactivated']);

} else { http_response_code(405); }

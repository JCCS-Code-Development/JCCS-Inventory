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
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

if ($method === 'PUT') {
    $body    = jsonBody();
    $allowed = ['name', 'address'];
    $sets = []; $params = [];
    foreach ($allowed as $f) {
        if (!array_key_exists($f, $body)) continue;
        $sets[]   = "$f = ?";
        $params[] = $body[$f] !== '' && $body[$f] !== null ? sanitizeString((string)$body[$f]) : null;
    }
    if (!$sets) { echo json_encode(['message' => 'Nothing to update']); exit; }
    $params[] = $id;
    $pdo->prepare('UPDATE locations SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    $pdo->prepare('UPDATE locations SET is_active = 0 WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deactivated']);

} else { http_response_code(405); }

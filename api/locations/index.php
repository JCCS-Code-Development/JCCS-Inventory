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
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $active = isset($_GET['active']) ? (int)$_GET['active'] : null;
    if ($active !== null) {
        $stmt = $pdo->prepare('SELECT * FROM locations WHERE is_active = ? ORDER BY name');
        $stmt->execute([$active]);
    } else {
        $stmt = $pdo->query('SELECT * FROM locations ORDER BY name');
    }
    echo json_encode(['locations' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    requireInventoryAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['name']);

    $pdo->prepare('INSERT INTO locations (name, address) VALUES (?, ?)')->execute([
        sanitizeString($body['name']),
        !empty($body['address']) ? sanitizeString($body['address']) : null,
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Location created']);

} else { http_response_code(405); }

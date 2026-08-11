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
    $active = isset($_GET['active']) ? (int)$_GET['active'] : 1;
    $stmt   = $pdo->prepare('SELECT * FROM vendors WHERE is_active = ? ORDER BY name');
    $stmt->execute([$active]);
    echo json_encode(['vendors' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    requireInventoryAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['name']);

    $pdo->prepare(
        'INSERT INTO vendors (name, contact_name, email, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([
        sanitizeString($body['name']),
        !empty($body['contact_name']) ? sanitizeString($body['contact_name']) : null,
        !empty($body['email'])        ? sanitizeString($body['email'])        : null,
        !empty($body['phone'])        ? sanitizeString($body['phone'])        : null,
        !empty($body['address'])      ? sanitizeString($body['address'])      : null,
        !empty($body['notes'])        ? sanitizeString($body['notes'])        : null,
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Vendor created']);

} else { http_response_code(405); }

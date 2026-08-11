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
    $stmt = $pdo->query('SELECT * FROM categories ORDER BY name');
    echo json_encode(['categories' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    // Any authenticated user can add a category on the fly while creating an
    // item — categories aren't sensitive, unlike vendors/locations/items.
    $body = jsonBody();
    requireFields($body, ['name']);
    $name = sanitizeString($body['name']);

    $stmt = $pdo->prepare('SELECT * FROM categories WHERE name = ?');
    $stmt->execute([$name]);
    $existing = $stmt->fetch();
    if ($existing) { echo json_encode(['category' => $existing]); exit; }

    $pdo->prepare('INSERT INTO categories (name) VALUES (?)')->execute([$name]);
    $id = (int)$pdo->lastInsertId();
    echo json_encode(['category' => ['id' => $id, 'name' => $name]]);

} else { http_response_code(405); }

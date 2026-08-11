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
    // Always scoped to a category — Material is a sub-choice under Category,
    // not a standalone list.
    $categoryId = isset($_GET['category_id']) ? (int)$_GET['category_id'] : 0;
    if (!$categoryId) { echo json_encode(['materials' => []]); exit; }
    $stmt = $pdo->prepare('SELECT * FROM materials WHERE category_id = ? ORDER BY name');
    $stmt->execute([$categoryId]);
    echo json_encode(['materials' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    // Any authenticated user can add a material on the fly while registering
    // an item — same reasoning as categories: not sensitive data.
    $body = jsonBody();
    requireFields($body, ['category_id', 'name']);
    $categoryId = (int)$body['category_id'];
    $name       = sanitizeString($body['name']);

    $stmt = $pdo->prepare('SELECT * FROM materials WHERE category_id = ? AND name = ?');
    $stmt->execute([$categoryId, $name]);
    $existing = $stmt->fetch();
    if ($existing) { echo json_encode(['material' => $existing]); exit; }

    $pdo->prepare('INSERT INTO materials (category_id, name) VALUES (?, ?)')->execute([$categoryId, $name]);
    $id = (int)$pdo->lastInsertId();
    echo json_encode(['material' => ['id' => $id, 'category_id' => $categoryId, 'name' => $name]]);

} else { http_response_code(405); }

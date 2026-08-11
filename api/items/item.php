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
requireSpecialistOrAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

if ($method === 'PUT') {
    $body = jsonBody();

    if (isset($body['sku'])) {
        $dupe = $pdo->prepare('SELECT id FROM items WHERE sku = ? AND id != ?');
        $dupe->execute([sanitizeString($body['sku']), $id]);
        if ($dupe->fetch()) { http_response_code(422); exit(json_encode(['error' => 'That SKU already exists'])); }
    }

    // Barcodes live in item_barcodes now (an item can have several) — see
    // items/barcodes.php for adding/removing them.
    $stringFields = ['sku', 'name', 'unit_of_measure', 'notes', 'vendor_item_number', 'dimensions'];
    $intFields    = ['category_id', 'material_id', 'vendor_id', 'reorder_point', 'default_project_id', 'lead_time_days'];
    $sets = []; $params = [];
    foreach ($stringFields as $f) {
        if (!array_key_exists($f, $body)) continue;
        $sets[]   = "$f = ?";
        $params[] = $body[$f] !== '' && $body[$f] !== null ? sanitizeString((string)$body[$f]) : null;
    }
    foreach ($intFields as $f) {
        if (!array_key_exists($f, $body)) continue;
        $sets[]   = "$f = ?";
        $params[] = $body[$f] !== '' && $body[$f] !== null ? (int)$body[$f] : null;
    }
    if (array_key_exists('unit_cost', $body)) {
        $sets[]   = 'unit_cost = ?';
        $params[] = (float)$body['unit_cost'];
    }
    if (!$sets) { echo json_encode(['message' => 'Nothing to update']); exit; }
    $params[] = $id;
    $pdo->prepare('UPDATE items SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    $pdo->prepare('UPDATE items SET is_active = 0 WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Deactivated']);

} else { http_response_code(405); }

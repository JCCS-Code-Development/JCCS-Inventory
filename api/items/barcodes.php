<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Manages the list of barcodes on one item — a product commonly has more
// than one printed on it (unit vs. box vs. pallet), and any of them should
// resolve back to this same item when scanned.
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $itemId = isset($_GET['item_id']) ? (int)$_GET['item_id'] : 0;
    if (!$itemId) { http_response_code(422); exit(json_encode(['error' => 'Missing item_id'])); }
    $stmt = $pdo->prepare('SELECT * FROM item_barcodes WHERE item_id = ? ORDER BY created_at');
    $stmt->execute([$itemId]);
    echo json_encode(['barcodes' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['item_id', 'barcode']);
    $itemId  = (int)$body['item_id'];
    $barcode = sanitizeString($body['barcode']);

    $item = $pdo->prepare('SELECT id FROM items WHERE id = ?');
    $item->execute([$itemId]);
    if (!$item->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Item not found'])); }

    $dupe = $pdo->prepare('SELECT i.id, i.name FROM item_barcodes b JOIN items i ON i.id = b.item_id WHERE b.barcode = ?');
    $dupe->execute([$barcode]);
    if ($existing = $dupe->fetch()) {
        $message = (int)$existing['id'] === $itemId
            ? 'That barcode is already on this item'
            : "That barcode is already registered to \"{$existing['name']}\"";
        http_response_code(422); exit(json_encode(['error' => $message]));
    }

    $pdo->prepare('INSERT INTO item_barcodes (item_id, barcode, label) VALUES (?, ?, ?)')
        ->execute([$itemId, $barcode, !empty($body['label']) ? sanitizeString($body['label']) : null]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Barcode added']);

} elseif ($method === 'DELETE') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }
    $pdo->prepare('DELETE FROM item_barcodes WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Removed']);

} else { http_response_code(405); }

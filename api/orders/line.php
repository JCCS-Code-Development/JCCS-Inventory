<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Repoint an order line to a different catalog item — used on the "Item
// Setup" tab when a Lead spots that the review-time item is really a
// duplicate of one already in inventory. Only allowed before receiving has
// started (order still 'awaiting_item_setup').
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['order_item_id', 'item_id']);
$lineId = (int)$body['order_item_id'];
$itemId = (int)$body['item_id'];

$pdo = getPDO();

$line = $pdo->prepare(
    'SELECT oi.id, oi.order_id, oi.item_id AS old_item_id, o.status AS order_status
     FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = ?'
);
$line->execute([$lineId]);
$row = $line->fetch();
if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Order line not found'])); }
if ($row['order_status'] !== 'awaiting_item_setup') {
    http_response_code(422); exit(json_encode(['error' => 'This order is past item setup']));
}

$chk = $pdo->prepare('SELECT 1 FROM items WHERE id = ?');
$chk->execute([$itemId]);
if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown item'])); }

$pdo->prepare('UPDATE order_items SET item_id = ?, item_confirmed_at = NULL, item_confirmed_by = NULL WHERE id = ?')
    ->execute([$itemId, $lineId]);

echo json_encode(['message' => 'Line updated', 'old_item_id' => (int)$row['old_item_id']]);

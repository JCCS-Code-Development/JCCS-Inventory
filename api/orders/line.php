<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// PATCH: repoint an order line to a different catalog item — used on the
// "Item Setup" tab when a Lead spots that the review-time item is really a
// duplicate of one already in inventory, or to attach a real catalog item to
// a line that was registered as free text. Only allowed before receiving has
// started (order still 'awaiting_item_setup').
//
// POST: add a new line to an order after it's already been registered —
// orders can now be created with zero lines (just the attachment, order
// number, and order date), with items filled in afterward at whatever pace
// the Lead can manage.
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $body    = jsonBody();
    requireFields($body, ['order_id', 'qty_ordered']);
    $orderId = (int)$body['order_id'];
    $itemId  = !empty($body['item_id']) ? (int)$body['item_id'] : null;
    $description = !$itemId && !empty($body['description']) ? sanitizeString($body['description']) : null;
    if (!$itemId && !$description) { http_response_code(422); exit(json_encode(['error' => 'Line needs either item_id or a description'])); }

    $chk = $pdo->prepare('SELECT status FROM orders WHERE id = ?');
    $chk->execute([$orderId]);
    $order = $chk->fetch();
    if (!$order) { http_response_code(404); exit(json_encode(['error' => 'Order not found'])); }
    if (!in_array($order['status'], ['awaiting_item_setup', 'placed'], true)) {
        http_response_code(422); exit(json_encode(['error' => 'This order is already being received'])); }

    if ($itemId) {
        $ichk = $pdo->prepare('SELECT 1 FROM items WHERE id = ?');
        $ichk->execute([$itemId]);
        if (!$ichk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown item'])); }
    }

    $pdo->prepare('INSERT INTO order_items (order_id, item_id, description, qty_ordered, unit_cost) VALUES (?, ?, ?, ?, ?)')
        ->execute([
            $orderId, $itemId, $description, (float)$body['qty_ordered'],
            isset($body['unit_cost']) && $body['unit_cost'] !== '' ? (float)$body['unit_cost'] : null,
        ]);

    // A line added after every existing line was already confirmed re-opens
    // item setup — the new one needs the same vetting the others got.
    $pdo->prepare("UPDATE orders SET status = 'awaiting_item_setup' WHERE id = ? AND status = 'placed'")->execute([$orderId]);

    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Line added']);

} elseif ($method === 'PATCH') {
    $body = jsonBody();
    requireFields($body, ['order_item_id', 'item_id']);
    $lineId = (int)$body['order_item_id'];
    $itemId = (int)$body['item_id'];

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

} else { http_response_code(405); }

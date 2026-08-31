<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// The "Item Setup" stage between placing an order and receiving it. A Lead
// vets each line's catalog item (name + SKU + category, not a duplicate) and
// confirms it here. When every line of an order is confirmed the order flips
// from 'awaiting_item_setup' to 'placed' and becomes visible to Receiving.
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['order_item_id']);
$lineId = (int)$body['order_item_id'];
$undo   = !empty($body['undo']);

$pdo = getPDO();

$line = $pdo->prepare(
    "SELECT oi.id, oi.order_id, oi.item_confirmed_at,
            o.status AS order_status,
            i.name AS item_name, i.sku AS item_sku, i.category_id
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN items i  ON i.id = oi.item_id
     WHERE oi.id = ?"
);
$line->execute([$lineId]);
$row = $line->fetch();
if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Order line not found'])); }

$orderId = (int)$row['order_id'];

if ($undo) {
    // Only valid while nothing has been received against the order yet.
    if (!in_array($row['order_status'], ['awaiting_item_setup', 'placed'], true)) {
        http_response_code(422); exit(json_encode(['error' => 'This order is already being received — item setup is locked']));
    }
    $recv = $pdo->prepare('SELECT COALESCE(SUM(qty_received), 0) FROM order_items WHERE order_id = ?');
    $recv->execute([$orderId]);
    if ((float)$recv->fetchColumn() > 0) {
        http_response_code(422); exit(json_encode(['error' => 'This order is already being received — item setup is locked']));
    }
    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE order_items SET item_confirmed_at = NULL, item_confirmed_by = NULL WHERE id = ?')->execute([$lineId]);
        $pdo->prepare("UPDATE orders SET status = 'awaiting_item_setup' WHERE id = ? AND status = 'placed'")->execute([$orderId]);
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
} else {
    if ($row['order_status'] !== 'awaiting_item_setup') {
        http_response_code(422); exit(json_encode(['error' => 'This order is past item setup']));
    }
    if (trim((string)$row['item_name']) === '' || trim((string)$row['item_sku']) === '' || $row['category_id'] === null) {
        http_response_code(422);
        exit(json_encode(['error' => 'Finish naming this item first — it needs a name, a SKU, and a category']));
    }
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'UPDATE order_items SET item_confirmed_at = NOW(), item_confirmed_by = ? WHERE id = ?'
        )->execute([$auth['user_id'], $lineId]);

        // Promote the order once every line is confirmed.
        $counts = $pdo->prepare(
            'SELECT COUNT(*) AS total, SUM(item_confirmed_at IS NOT NULL) AS confirmed
             FROM order_items WHERE order_id = ?'
        );
        $counts->execute([$orderId]);
        $c = $counts->fetch();
        if ((int)$c['total'] > 0 && (int)$c['confirmed'] === (int)$c['total']) {
            $pdo->prepare("UPDATE orders SET status = 'placed' WHERE id = ? AND status = 'awaiting_item_setup'")->execute([$orderId]);
        }
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
}

$out = $pdo->prepare(
    "SELECT o.status AS order_status,
            COUNT(oi.id) AS line_count,
            COALESCE(SUM(oi.item_confirmed_at IS NOT NULL), 0) AS lines_confirmed
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = ? GROUP BY o.id"
);
$out->execute([$orderId]);
echo json_encode($out->fetch());

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
requireSpecialistOrAdmin($auth); // receiving from trucks is the specialist's job
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['item_id', 'location_id', 'qty']);

$itemId     = (int)$body['item_id'];
$locationId = (int)$body['location_id'];
$qty        = (float)$body['qty'];
$orderId    = !empty($body['order_id']) ? (int)$body['order_id'] : null;
if ($qty <= 0) { http_response_code(422); exit(json_encode(['error' => 'Quantity must be greater than zero'])); }

$pdo = getPDO();

// Physical receiving only happens at the Woodruff Rd. warehouse (the actual
// receiving dock) — stock reaches the other location via Take/Drop-off, not
// a second receiving point. Enforced here too, not just hidden in the UI.
$loc = $pdo->prepare('SELECT name FROM locations WHERE id = ?');
$loc->execute([$locationId]);
$locName = $loc->fetchColumn();
if ($locName === false) { http_response_code(422); exit(json_encode(['error' => 'Unknown location'])); }
if (!str_contains(strtolower($locName), 'woodruff')) {
    http_response_code(422);
    exit(json_encode(['error' => 'Receiving is only logged at the Woodruff Rd. warehouse']));
}

$pdo->beginTransaction();
try {
    $pdo->prepare(
        'INSERT INTO item_stock (item_id, location_id, qty_on_hand) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE qty_on_hand = qty_on_hand + VALUES(qty_on_hand)'
    )->execute([$itemId, $locationId, $qty]);

    $stmt = $pdo->prepare('SELECT qty_on_hand FROM item_stock WHERE item_id = ? AND location_id = ?');
    $stmt->execute([$itemId, $locationId]);
    $qtyAfter = (float)$stmt->fetchColumn();

    $pdo->prepare(
        'INSERT INTO stock_transactions
            (item_id, location_id, type, qty_delta, qty_after, vendor_id, unit_cost, reference, notes, order_id, fieldclock_user_id)
         VALUES (?, ?, \'receive\', ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $itemId, $locationId, $qty, $qtyAfter,
        !empty($body['vendor_id']) ? (int)$body['vendor_id'] : null,
        isset($body['unit_cost']) && $body['unit_cost'] !== null ? (float)$body['unit_cost'] : null,
        !empty($body['reference']) ? sanitizeString($body['reference']) : null,
        !empty($body['notes']) ? sanitizeString($body['notes']) : null,
        $orderId,
        $auth['user_id'],
    ]);

    // Fulfilling against a specific order — bump qty_received and roll the
    // order's status up to partially_received/received accordingly.
    if ($orderId) {
        $pdo->prepare(
            'UPDATE order_items SET qty_received = qty_received + ? WHERE order_id = ? AND item_id = ?'
        )->execute([$qty, $orderId, $itemId]);

        $lines = $pdo->prepare('SELECT qty_ordered, qty_received FROM order_items WHERE order_id = ?');
        $lines->execute([$orderId]);
        $rows = $lines->fetchAll();
        $allReceived = $rows && array_reduce($rows, fn($c, $r) => $c && $r['qty_received'] >= $r['qty_ordered'], true);
        $anyReceived = array_reduce($rows, fn($c, $r) => $c || $r['qty_received'] > 0, false);
        $status = $allReceived ? 'received' : ($anyReceived ? 'partially_received' : 'placed');
        $pdo->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$status, $orderId]);
    }

    $pdo->commit();
    echo json_encode(['message' => 'Stock received', 'qty_after' => $qtyAfter]);
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}

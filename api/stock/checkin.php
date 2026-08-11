<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth(); // all three roles can drop stock back off
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['item_id', 'location_id', 'qty']);

$itemId     = (int)$body['item_id'];
$locationId = (int)$body['location_id'];
$qty        = (float)$body['qty'];
if ($qty <= 0) { http_response_code(422); exit(json_encode(['error' => 'Quantity must be greater than zero'])); }

$pdo = getPDO();
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
            (item_id, location_id, type, qty_delta, qty_after, notes, project_id, taken_by_name, fieldclock_user_id)
         VALUES (?, ?, \'checkin\', ?, ?, ?, ?, ?, ?)'
    )->execute([
        $itemId, $locationId, $qty, $qtyAfter,
        !empty($body['notes']) ? sanitizeString($body['notes']) : null,
        !empty($body['project_id']) ? (int)$body['project_id'] : null,
        !empty($body['taken_by_name']) ? sanitizeString($body['taken_by_name']) : $auth['name'],
        $auth['user_id'],
    ]);

    $pdo->commit();
    echo json_encode(['message' => 'Dropped off', 'qty_after' => $qtyAfter]);
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}

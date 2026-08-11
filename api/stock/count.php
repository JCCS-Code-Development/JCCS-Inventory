<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Physical count reconciliation — what's actually on the shelf is ground
// truth, so this SETS item_stock.qty_on_hand to the counted value (unlike
// receive.php, which adds to it). Only writes a stock_transactions row when
// the count actually differs from what the system expected — a clean match
// needs no audit entry, it just confirms what was already there. Counting
// can happen at any location (unlike receiving, which is Woodruff-only).
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['item_id', 'location_id', 'counted_qty']);

$itemId     = (int)$body['item_id'];
$locationId = (int)$body['location_id'];
$counted    = (float)$body['counted_qty'];
if ($counted < 0) { http_response_code(422); exit(json_encode(['error' => 'Counted quantity cannot be negative'])); }

$pdo = getPDO();
$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('SELECT qty_on_hand FROM item_stock WHERE item_id = ? AND location_id = ?');
    $stmt->execute([$itemId, $locationId]);
    $before = $stmt->fetchColumn();
    $before = $before === false ? 0.0 : (float)$before;
    $delta  = $counted - $before;

    $pdo->prepare(
        'INSERT INTO item_stock (item_id, location_id, qty_on_hand) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE qty_on_hand = VALUES(qty_on_hand)'
    )->execute([$itemId, $locationId, $counted]);

    if (abs($delta) > 0.001) { // float-safe "not zero"
        $pdo->prepare(
            'INSERT INTO stock_transactions
                (item_id, location_id, type, qty_delta, qty_after, reference, notes, fieldclock_user_id)
             VALUES (?, ?, \'count_adjustment\', ?, ?, ?, ?, ?)'
        )->execute([
            $itemId, $locationId, $delta, $counted,
            'Physical count',
            !empty($body['notes']) ? sanitizeString($body['notes']) : null,
            $auth['user_id'],
        ]);
    }

    $pdo->commit();
    echo json_encode(['message' => 'Count saved', 'qty_after' => $counted, 'delta' => $delta]);
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}

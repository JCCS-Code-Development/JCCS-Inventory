<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// A partially received order can get permanently stuck short of its full
// quantity — the vendor is out of stock, issues a credit instead of
// shipping the rest, whatever — with nothing left to actually receive.
// There's no separate "settled short" status; this just marks it 'received'
// like any other completed order (the per-line qty_ordered/qty_received gap
// is still right there in the order's own item table for the record, so
// nothing about the shortfall is lost, it's just no longer sitting open).
// Same authority as resolving a discrepancy — any Lead can wrap this up,
// not admin-only.
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$pdo  = getPDO();
$stmt = $pdo->prepare(
    "SELECT o.status,
            EXISTS(
                SELECT 1 FROM order_discrepancy_reports dr
                WHERE dr.order_id = o.id AND dr.status = 'open'
            ) AS has_open_discrepancy
     FROM orders o WHERE o.id = ?"
);
$stmt->execute([$id]);
$order = $stmt->fetch();
if (!$order) { http_response_code(404); exit(json_encode(['error' => 'Order not found'])); }

if ($order['status'] !== 'partially_received') {
    http_response_code(422);
    exit(json_encode(['error' => 'Only a partially received order can be closed out this way']));
}
if ($order['has_open_discrepancy']) {
    http_response_code(422);
    exit(json_encode(['error' => 'Resolve the open discrepancy on this order first']));
}

$pdo->prepare("UPDATE orders SET status = 'received' WHERE id = ?")->execute([$id]);
echo json_encode(['message' => 'Order closed']);

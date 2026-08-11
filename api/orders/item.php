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

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        "SELECT o.*, v.name AS vendor_name, r.name AS placed_by_name,
                pu.name AS purchased_by_name, dl.name AS destination_location_name,
                EXISTS(
                    SELECT 1 FROM order_discrepancy_reports dr
                    WHERE dr.order_id = o.id AND dr.status = 'open'
                ) AS has_open_discrepancy
         FROM orders o
         LEFT JOIN vendors v ON v.id = o.vendor_id
         LEFT JOIN inventory_user_roles r  ON r.fieldclock_user_id = o.placed_by
         LEFT JOIN inventory_user_roles pu ON pu.fieldclock_user_id = o.purchased_by_user_id
         LEFT JOIN locations dl ON dl.id = o.destination_location_id
         WHERE o.id = ?"
    );
    $stmt->execute([$id]);
    $order = $stmt->fetch();
    if (!$order) { http_response_code(404); exit(json_encode(['error' => 'Not found'])); }
    $order['attachment_url'] = !empty($order['attachment_path']) ? APP_URL . '/uploads/' . $order['attachment_path'] : null;

    $lines = $pdo->prepare(
        "SELECT oi.*, i.sku, i.name AS item_name, i.unit_of_measure
         FROM order_items oi JOIN items i ON i.id = oi.item_id
         WHERE oi.order_id = ? ORDER BY i.name"
    );
    $lines->execute([$id]);
    $order['items'] = $lines->fetchAll();
    echo json_encode($order);

} elseif ($method === 'PUT') {
    requireInventoryAdmin($auth);
    $body = jsonBody();
    $allowed = [
        'order_number', 'vendor_id', 'expected_date', 'notes', 'status',
        'order_type', 'invoice_number', 'receipt_number', 'purchased_by_user_id', 'destination_location_id',
    ];
    if (isset($body['status']) && !in_array($body['status'], ['placed', 'partially_received', 'received', 'cancelled'], true)) {
        http_response_code(422); exit(json_encode(['error' => 'Invalid status']));
    }
    if (isset($body['order_type']) && !in_array($body['order_type'], ['online', 'dropoff'], true)) {
        http_response_code(422); exit(json_encode(['error' => 'Invalid order type']));
    }
    $intFields = ['vendor_id', 'purchased_by_user_id', 'destination_location_id'];
    $sets = []; $params = [];
    foreach ($allowed as $f) {
        if (!array_key_exists($f, $body)) continue;
        $sets[]   = "$f = ?";
        $params[] = $body[$f] !== '' && $body[$f] !== null
            ? (in_array($f, $intFields, true) ? (int)$body[$f] : ($f === 'status' || $f === 'order_type' ? $body[$f] : sanitizeString((string)$body[$f])))
            : null;
    }
    if (!$sets) { echo json_encode(['message' => 'Nothing to update']); exit; }
    $params[] = $id;
    $pdo->prepare('UPDATE orders SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    requireInventoryAdmin($auth);
    // order_items cascade-delete; past stock_transactions.order_id just goes NULL (no data loss).
    // Drop the attachment file too, if any, so we don't leak orphaned uploads.
    $stmt = $pdo->prepare('SELECT attachment_path FROM orders WHERE id = ?');
    $stmt->execute([$id]);
    if ($row = $stmt->fetch()) {
        if (!empty($row['attachment_path'])) {
            $path = __DIR__ . '/../uploads/' . $row['attachment_path'];
            if (is_file($path)) { @unlink($path); }
        }
    }
    $pdo->prepare('DELETE FROM orders WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Order deleted']);

} else { http_response_code(405); }

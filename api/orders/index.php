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
requireSpecialistOrAdmin($auth); // basic users have no order visibility
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function withAttachmentUrl(array $row): array {
    $row['attachment_url'] = !empty($row['attachment_path']) ? APP_URL . '/uploads/' . $row['attachment_path'] : null;
    return $row;
}

if ($method === 'GET') {
    $where  = [];
    $params = [];
    if (!empty($_GET['status'])) { $where[] = 'o.status = ?'; $params[] = $_GET['status']; }
    $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $stmt = $pdo->prepare(
        "SELECT o.*, v.name AS vendor_name, r.name AS placed_by_name,
                pu.name AS purchased_by_name, dl.name AS destination_location_name,
                COUNT(oi.id) AS line_count,
                COALESCE(SUM(oi.item_confirmed_at IS NOT NULL), 0) AS lines_confirmed,
                COALESCE(SUM(oi.qty_ordered), 0) AS qty_ordered_total,
                COALESCE(SUM(oi.qty_received), 0) AS qty_received_total,
                EXISTS(
                    SELECT 1 FROM order_discrepancy_reports dr
                    WHERE dr.order_id = o.id AND dr.status = 'open'
                ) AS has_open_discrepancy
         FROM orders o
         LEFT JOIN vendors v ON v.id = o.vendor_id
         LEFT JOIN inventory_user_roles r  ON r.fieldclock_user_id = o.placed_by
         LEFT JOIN inventory_user_roles pu ON pu.fieldclock_user_id = o.purchased_by_user_id
         LEFT JOIN locations dl ON dl.id = o.destination_location_id
         LEFT JOIN order_items oi ON oi.order_id = o.id
         $whereSql
         GROUP BY o.id
         ORDER BY o.created_at DESC"
    );
    $stmt->execute($params);
    echo json_encode(['orders' => array_map('withAttachmentUrl', $stmt->fetchAll())]);

} elseif ($method === 'POST') {
    // Registering orders — online or a drop-off of something already bought
    // — is the Inventory Lead's job too, same as registering products.
    //
    // Kept deliberately minimal so registering an order never has to wait on
    // catalog work or paperwork: only the proof (photo/PDF, attached
    // separately right after this call), the order_number, and order_date
    // are required. Vendor, line items, invoice/receipt numbers, etc. are
    // all optional and can be filled in later — line items in particular go
    // through the Item Setup stage before the order can be received.
    requireSpecialistOrAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['order_number', 'order_date']);
    $items = is_array($body['items'] ?? null) ? $body['items'] : [];

    $orderType = in_array($body['order_type'] ?? 'online', ['online', 'dropoff'], true) ? $body['order_type'] : 'online';

    $purchasedBy = !empty($body['purchased_by_user_id']) ? (int)$body['purchased_by_user_id'] : null;
    $destination = !empty($body['destination_location_id']) ? (int)$body['destination_location_id'] : null;
    $vendorId    = !empty($body['vendor_id']) ? (int)$body['vendor_id'] : null;

    // Optionally built from a batch of "Ready to Order" request tickets. They
    // must all still be open and all share one vendor (the app confines the
    // selection to a single vendor group) — that shared vendor is the order's
    // vendor. Each one gets marked 'ordered' and linked to this order inside
    // the same transaction below.
    $requestIds = [];
    $sourceRequests = [];
    if (!empty($body['request_ids']) && is_array($body['request_ids'])) {
        $requestIds = array_values(array_unique(array_map('intval', $body['request_ids'])));
        $requestIds = array_filter($requestIds, fn($x) => $x > 0);
    }
    if ($requestIds) {
        $ph   = implode(',', array_fill(0, count($requestIds), '?'));
        $rqStmt = $pdo->prepare("SELECT id, status, vendor_id FROM order_requests WHERE id IN ($ph)");
        $rqStmt->execute(array_values($requestIds));
        $sourceRequests = $rqStmt->fetchAll();

        if (count($sourceRequests) !== count($requestIds)) {
            http_response_code(422); exit(json_encode(['error' => 'One or more requests no longer exist']));
        }
        foreach ($sourceRequests as $r) {
            if ($r['status'] !== 'open') {
                http_response_code(422); exit(json_encode(['error' => 'One or more requests have already been resolved']));
            }
        }
        $reqVendors = array_values(array_unique(array_map(fn($r) => (int)$r['vendor_id'], $sourceRequests)));
        if (count($reqVendors) !== 1 || $reqVendors[0] === 0) {
            http_response_code(422); exit(json_encode(['error' => 'All selected requests must be from the same vendor']));
        }
        if ($vendorId && $vendorId !== $reqVendors[0]) {
            http_response_code(422); exit(json_encode(['error' => 'Order vendor does not match the selected requests']));
        }
        $vendorId = $reqVendors[0];
    }

    if ($purchasedBy) {
        $chk = $pdo->prepare('SELECT 1 FROM inventory_user_roles WHERE fieldclock_user_id = ?');
        $chk->execute([$purchasedBy]);
        if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown purchaser'])); }
    }
    if ($destination) {
        $chk = $pdo->prepare('SELECT 1 FROM locations WHERE id = ?');
        $chk->execute([$destination]);
        if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown destination location'])); }
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$body['order_date'])) {
        http_response_code(422); exit(json_encode(['error' => 'order_date must be a valid date']));
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO orders
                (order_number, vendor_id, order_type, invoice_number, receipt_number,
                 purchased_by_user_id, destination_location_id, order_date, expected_date, notes, placed_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            sanitizeString($body['order_number']),
            $vendorId,
            $orderType,
            !empty($body['invoice_number']) ? sanitizeString($body['invoice_number']) : null,
            !empty($body['receipt_number']) ? sanitizeString($body['receipt_number']) : null,
            $purchasedBy,
            $destination,
            $body['order_date'],
            !empty($body['expected_date']) ? $body['expected_date'] : null,
            !empty($body['notes']) ? sanitizeString($body['notes']) : null,
            $auth['user_id'],
        ]);
        $orderId = (int)$pdo->lastInsertId();

        // Each line is either a real catalog item or, if it hasn't been
        // matched to one yet, just a free-text description — the Item Setup
        // stage is where that gets resolved before the order can be received.
        $lineStmt = $pdo->prepare('INSERT INTO order_items (order_id, item_id, description, qty_ordered, unit_cost) VALUES (?, ?, ?, ?, ?)');
        foreach ($items as $line) {
            $itemId      = !empty($line['item_id']) ? (int)$line['item_id'] : null;
            $description = !$itemId && !empty($line['description']) ? sanitizeString($line['description']) : null;
            if ((!$itemId && !$description) || empty($line['qty_ordered'])) continue;
            $lineStmt->execute([
                $orderId, $itemId, $description, (float)$line['qty_ordered'],
                isset($line['unit_cost']) && $line['unit_cost'] !== '' ? (float)$line['unit_cost'] : null,
            ]);
        }

        // Close the loop on every source request in the same transaction — a
        // half-linked batch (order saved but some tickets left open) is worse
        // than the whole thing rolling back.
        if ($requestIds) {
            $resolveStmt = $pdo->prepare(
                "UPDATE order_requests
                 SET status = 'ordered', order_id = ?, resolved_by = ?, resolved_at = NOW()
                 WHERE id = ? AND status = 'open'"
            );
            foreach ($requestIds as $rid) {
                $resolveStmt->execute([$orderId, $auth['user_id'], $rid]);
                if ($resolveStmt->rowCount() !== 1) {
                    throw new RuntimeException('Request ' . $rid . ' could not be linked');
                }
            }
        }

        $pdo->commit();
        echo json_encode(['id' => $orderId, 'message' => 'Order placed']);
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

} else { http_response_code(405); }

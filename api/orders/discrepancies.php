<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Filed from the Receiving checklist when a delivery comes up short or with
// extra, unordered items. Compiled here (grouped by vendor client-side) so
// an Inventory Lead or admin can chase a refund/credit from the supplier.
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $where  = [];
    $params = [];
    if (!empty($_GET['status'])) { $where[] = 'r.status = ?'; $params[] = $_GET['status']; }
    $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $stmt = $pdo->prepare(
        "SELECT r.*, v.name AS vendor_name, o.order_number, o.order_type,
                rb.name AS reported_by_name, res.name AS resolved_by_name
         FROM order_discrepancy_reports r
         LEFT JOIN vendors v ON v.id = r.vendor_id
         JOIN orders o ON o.id = r.order_id
         LEFT JOIN inventory_user_roles rb  ON rb.fieldclock_user_id  = r.reported_by
         LEFT JOIN inventory_user_roles res ON res.fieldclock_user_id = r.resolved_by
         $whereSql
         ORDER BY r.created_at DESC"
    );
    $stmt->execute($params);
    $reports = $stmt->fetchAll();

    if ($reports) {
        $ids = array_column($reports, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $itemsStmt = $pdo->prepare(
            "SELECT di.*, i.sku, i.name AS item_name, i.unit_of_measure
             FROM order_discrepancy_items di
             LEFT JOIN items i ON i.id = di.item_id
             WHERE di.report_id IN ($placeholders)
             ORDER BY di.id"
        );
        $itemsStmt->execute($ids);
        $itemsByReport = [];
        foreach ($itemsStmt->fetchAll() as $line) { $itemsByReport[$line['report_id']][] = $line; }
        foreach ($reports as &$r) { $r['items'] = $itemsByReport[$r['id']] ?? []; }
        unset($r);
    }

    echo json_encode(['reports' => $reports]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['order_id', 'items']);
    $orderId = (int)$body['order_id'];
    $lines   = $body['items'];
    if (!is_array($lines) || !$lines) { http_response_code(422); exit(json_encode(['error' => 'Report needs at least one missing or extra item'])); }

    $ord = $pdo->prepare('SELECT vendor_id FROM orders WHERE id = ?');
    $ord->execute([$orderId]);
    $order = $ord->fetch();
    if (!$order) { http_response_code(404); exit(json_encode(['error' => 'Order not found'])); }

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO order_discrepancy_reports (order_id, vendor_id, reported_by, notes) VALUES (?, ?, ?, ?)'
        )->execute([
            $orderId, $order['vendor_id'], $auth['user_id'],
            !empty($body['notes']) ? sanitizeString($body['notes']) : null,
        ]);
        $reportId = (int)$pdo->lastInsertId();

        $lineStmt = $pdo->prepare(
            'INSERT INTO order_discrepancy_items (report_id, item_id, type, qty, description) VALUES (?, ?, ?, ?, ?)'
        );
        $inserted = 0;
        foreach ($lines as $line) {
            $type = $line['type'] ?? '';
            if (!in_array($type, ['missing', 'extra'], true)) continue;
            $qty = isset($line['qty']) ? (float)$line['qty'] : 0;
            if ($qty <= 0) continue;
            $itemId = !empty($line['item_id']) ? (int)$line['item_id'] : null;
            $desc   = !empty($line['description']) ? sanitizeString($line['description']) : null;
            if ($type === 'missing' && !$itemId) continue; // a shortage always refers to a known ordered item
            if (!$itemId && !$desc) continue; // an unlisted extra needs at least a description
            $lineStmt->execute([$reportId, $itemId, $type, $qty, $desc]);
            $inserted++;
        }
        if (!$inserted) { $pdo->rollBack(); http_response_code(422); exit(json_encode(['error' => 'No valid missing/extra lines in that report'])); }

        $pdo->commit();
        echo json_encode(['id' => $reportId, 'message' => 'Discrepancy report filed']);
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

} else { http_response_code(405); }

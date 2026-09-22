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
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

const ITEM_SELECT = '
    SELECT i.*, c.name AS category_name, m.name AS material_name,
           v.name AS vendor_name, p.name AS default_project_name, p.project_number AS default_project_number,
           COALESCE((SELECT SUM(s.qty_on_hand) FROM item_stock s WHERE s.item_id = i.id), 0) AS total_qty
    FROM items i
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN materials m  ON m.id = i.material_id
    LEFT JOIN vendors v    ON v.id = i.vendor_id
    LEFT JOIN projects p   ON p.id = i.default_project_id
';

function withImageUrl(array $row): array {
    $row['image_url'] = !empty($row['image_path']) ? APP_URL . '/uploads/' . $row['image_path'] : null;
    return $row;
}

if ($method === 'GET') {
    $active = isset($_GET['active']) ? (int)$_GET['active'] : null;
    if ($active !== null) {
        $stmt = $pdo->prepare(ITEM_SELECT . ' WHERE i.is_active = ? ORDER BY i.name');
        $stmt->execute([$active]);
    } else {
        $stmt = $pdo->query(ITEM_SELECT . ' ORDER BY i.name');
    }
    $rows = array_map('withImageUrl', $stmt->fetchAll());
    if ($auth['role'] === 'user') { $rows = array_map('stripCostFields', $rows); }
    echo json_encode(['items' => $rows]);

} elseif ($method === 'POST') {
    // Registering new products is the specialist's job (per spec), not admin-exclusive.
    requireSpecialistOrAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['sku', 'name']);

    $sku = sanitizeString($body['sku']);
    $dupe = $pdo->prepare('SELECT id FROM items WHERE sku = ?');
    $dupe->execute([$sku]);
    if ($dupe->fetch()) { http_response_code(422); exit(json_encode(['error' => 'That SKU already exists'])); }

    // A single barcode can be captured at registration (whatever's scanned
    // in hand — box, pallet, whatever). More can be added later from Edit,
    // since the same product often arrives under a different barcode too.
    $barcode = !empty($body['barcode']) ? sanitizeString($body['barcode']) : null;
    if ($barcode) {
        $dupeBc = $pdo->prepare('SELECT i.id, i.name FROM item_barcodes b JOIN items i ON i.id = b.item_id WHERE b.barcode = ?');
        $dupeBc->execute([$barcode]);
        if ($existing = $dupeBc->fetch()) {
            http_response_code(422);
            exit(json_encode(['error' => "That barcode is already registered to \"{$existing['name']}\""]));
        }
    }

    // Optional one-step "register + stock it" — if both are given, the first
    // receipt is logged the same way stock/receive.php would log it.
    $initialQty      = isset($body['initial_qty']) ? (float)$body['initial_qty'] : 0;
    $initialLocation = !empty($body['initial_location_id']) ? (int)$body['initial_location_id'] : null;
    if ($initialQty < 0) { http_response_code(422); exit(json_encode(['error' => 'Initial quantity cannot be negative'])); }
    if ($initialQty > 0 && !$initialLocation) { http_response_code(422); exit(json_encode(['error' => 'Choose a location for the initial stock'])); }

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO items (sku, name, category_id, material_id, unit_of_measure, vendor_id, vendor_item_number, dimensions, unit_cost, reorder_point, lead_time_days, default_project_id, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $sku,
            sanitizeString($body['name']),
            !empty($body['category_id']) ? (int)$body['category_id'] : null,
            !empty($body['material_id']) ? (int)$body['material_id'] : null,
            !empty($body['unit_of_measure']) ? sanitizeString($body['unit_of_measure']) : 'each',
            !empty($body['vendor_id']) ? (int)$body['vendor_id'] : null,
            !empty($body['vendor_item_number']) ? sanitizeString($body['vendor_item_number']) : null,
            !empty($body['dimensions']) ? sanitizeString($body['dimensions']) : null,
            isset($body['unit_cost']) ? (float)$body['unit_cost'] : 0,
            isset($body['reorder_point']) ? (int)$body['reorder_point'] : 0,
            !empty($body['lead_time_days']) ? (int)$body['lead_time_days'] : null,
            !empty($body['default_project_id']) ? (int)$body['default_project_id'] : null,
            !empty($body['notes']) ? sanitizeString($body['notes']) : null,
        ]);
        $itemId = (int)$pdo->lastInsertId();

        if ($barcode) {
            $pdo->prepare('INSERT INTO item_barcodes (item_id, barcode, label) VALUES (?, ?, ?)')
                ->execute([$itemId, $barcode, !empty($body['barcode_label']) ? sanitizeString($body['barcode_label']) : null]);
        }

        if ($initialQty > 0) {
            $pdo->prepare(
                'INSERT INTO item_stock (item_id, location_id, qty_on_hand) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE qty_on_hand = qty_on_hand + VALUES(qty_on_hand)'
            )->execute([$itemId, $initialLocation, $initialQty]);

            $pdo->prepare(
                'INSERT INTO stock_transactions
                    (item_id, location_id, type, qty_delta, qty_after, vendor_id, unit_cost, reference, notes, fieldclock_user_id)
                 VALUES (?, ?, \'receive\', ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $itemId, $initialLocation, $initialQty, $initialQty,
                !empty($body['vendor_id']) ? (int)$body['vendor_id'] : null,
                isset($body['unit_cost']) ? (float)$body['unit_cost'] : null,
                'Initial stock',
                'Logged automatically when the product was registered',
                $auth['user_id'],
            ]);
        }

        $pdo->commit();
        echo json_encode(['id' => $itemId, 'message' => 'Item created']);
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

} else { http_response_code(405); }

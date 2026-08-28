<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// "I need something ordered" tickets. These are an Inventory Lead / admin
// tool now — basic workers don't file them — so the whole resource is
// specialist/admin only, both the shared queue and creating one.
$auth   = requireAuth();
requireSpecialistOrAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

// A request is "ready to order" once review has pinned down all three of:
// vendor to buy from, the specific product page, and the catalog item it
// maps to. Kept as one string so the Orders "Ready to Order" queue and the
// CSV export stay in lockstep.
const READY_TO_ORDER_SQL = "r.vendor_id IS NOT NULL AND r.product_link IS NOT NULL AND r.item_id IS NOT NULL";

if ($method === 'GET') {
    $where  = [];
    $params = [];

    if (!empty($_GET['status'])) { $where[] = 'r.status = ?'; $params[] = $_GET['status']; }
    if (!empty($_GET['reviewed'])) { $where[] = '(' . READY_TO_ORDER_SQL . ')'; }
    $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $stmt = $pdo->prepare(
        "SELECT r.*, req.name AS requested_by_name, res.name AS resolved_by_name,
                l.name AS location_name, o.order_number,
                p.project_number, p.name AS project_name,
                ven.name AS vendor_name,
                it.sku AS item_sku, it.name AS item_name
         FROM order_requests r
         LEFT JOIN inventory_user_roles req ON req.fieldclock_user_id = r.requested_by
         LEFT JOIN inventory_user_roles res ON res.fieldclock_user_id = r.resolved_by
         LEFT JOIN locations l ON l.id = r.location_id
         LEFT JOIN orders o    ON o.id = r.order_id
         LEFT JOIN projects p  ON p.id = r.project_id
         LEFT JOIN vendors ven ON ven.id = r.vendor_id
         LEFT JOIN items it    ON it.id = r.item_id
         $whereSql
         ORDER BY r.created_at ASC"
    );
    $stmt->execute($params);
    echo json_encode(['requests' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['description']);

    // Every request is for the same warehouse in practice, so this isn't a
    // per-ticket choice any more — always resolve to "1200 Woodruff Rd."
    // rather than asking. Falls back to NULL (unlabeled) if that location
    // ever gets renamed/removed, rather than failing ticket creation over it.
    $locStmt = $pdo->prepare("SELECT id FROM locations WHERE name = '1200 Woodruff Rd.' LIMIT 1");
    $locStmt->execute();
    $locationId = $locStmt->fetchColumn() ?: null;

    // Review fields — vendor, catalog item, project, product link. All
    // optional at creation time (a request can be filed rough and reviewed
    // later), but a request isn't "ready to order" until vendor + item +
    // product link are all filled in.
    $vendorId = null;
    if (!empty($body['vendor_id'])) {
        $vendorId = (int)$body['vendor_id'];
        $chk = $pdo->prepare('SELECT 1 FROM vendors WHERE id = ?');
        $chk->execute([$vendorId]);
        if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown vendor'])); }
    }

    $itemId = null;
    if (!empty($body['item_id'])) {
        $itemId = (int)$body['item_id'];
        $chk = $pdo->prepare('SELECT 1 FROM items WHERE id = ?');
        $chk->execute([$itemId]);
        if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown item'])); }
    }

    $projectId = null;
    if (!empty($body['project_id'])) {
        $projectId = (int)$body['project_id'];
        $chk = $pdo->prepare('SELECT 1 FROM projects WHERE id = ?');
        $chk->execute([$projectId]);
        if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown project'])); }
    }

    $productLink = null;
    if (!empty($body['product_link'])) {
        $productLink = trim((string)$body['product_link']);
        if (!preg_match('#^https?://#i', $productLink)) {
            http_response_code(422); exit(json_encode(['error' => 'Product link must be a valid URL']));
        }
    }

    $projectNote = !empty($body['project_note']) ? sanitizeString($body['project_note']) : null;

    $stmt = $pdo->prepare(
        'INSERT INTO order_requests
            (requested_by, description, qty_requested, unit_of_measure, vendor_hint, vendor_id, item_id, location_id, project_id, project_note, product_link, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $auth['user_id'],
        sanitizeString($body['description']),
        isset($body['qty_requested']) && $body['qty_requested'] !== '' ? (float)$body['qty_requested'] : null,
        !empty($body['unit_of_measure']) ? sanitizeString($body['unit_of_measure']) : null,
        !empty($body['vendor_hint']) ? sanitizeString($body['vendor_hint']) : null,
        $vendorId,
        $itemId,
        $locationId,
        $projectId,
        $projectNote,
        $productLink,
        !empty($body['notes']) ? sanitizeString($body['notes']) : null,
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Request submitted']);

} else { http_response_code(405); }

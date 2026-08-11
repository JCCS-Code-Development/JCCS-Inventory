<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// "I need something ordered" tickets from anyone on the team. A basic user
// only ever sees their own — the shared queue (everyone's tickets, so the
// Inventory Lead isn't relying on their own memory to track them) is
// specialist/admin only.
$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $where  = [];
    $params = [];

    if (!in_array($auth['role'], ['specialist', 'admin'], true)) {
        $where[]  = 'r.requested_by = ?';
        $params[] = $auth['user_id'];
    }
    if (!empty($_GET['status'])) { $where[] = 'r.status = ?'; $params[] = $_GET['status']; }
    $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $stmt = $pdo->prepare(
        "SELECT r.*, req.name AS requested_by_name, res.name AS resolved_by_name,
                l.name AS location_name, o.order_number
         FROM order_requests r
         LEFT JOIN inventory_user_roles req ON req.fieldclock_user_id = r.requested_by
         LEFT JOIN inventory_user_roles res ON res.fieldclock_user_id = r.resolved_by
         LEFT JOIN locations l ON l.id = r.location_id
         LEFT JOIN orders o    ON o.id = r.order_id
         $whereSql
         ORDER BY r.created_at ASC"
    );
    $stmt->execute($params);
    echo json_encode(['requests' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    // Anyone provisioned for Inventory can file one — this is exactly the
    // path meant to replace "just go tell the Inventory Lead and hope they
    // remember."
    $body = jsonBody();
    requireFields($body, ['description']);

    $locationId = !empty($body['location_id']) ? (int)$body['location_id'] : null;
    if ($locationId) {
        $chk = $pdo->prepare('SELECT 1 FROM locations WHERE id = ?');
        $chk->execute([$locationId]);
        if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown location'])); }
    }

    $stmt = $pdo->prepare(
        'INSERT INTO order_requests
            (requested_by, description, qty_requested, unit_of_measure, vendor_hint, location_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $auth['user_id'],
        sanitizeString($body['description']),
        isset($body['qty_requested']) && $body['qty_requested'] !== '' ? (float)$body['qty_requested'] : null,
        !empty($body['unit_of_measure']) ? sanitizeString($body['unit_of_measure']) : null,
        !empty($body['vendor_hint']) ? sanitizeString($body['vendor_hint']) : null,
        $locationId,
        !empty($body['notes']) ? sanitizeString($body['notes']) : null,
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Request submitted']);

} else { http_response_code(405); }

<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Items flagged is_trackable_asset, with whichever checkout is currently
// open (if any). Same visibility rule as tasks: a basic user only ever sees
// their own current checkout, not the whole fleet — the manager view (Items
// page "Tools" tab) is where the full roster lives.
$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET') { http_response_code(405); exit; }

$isManager = in_array($auth['role'], ['specialist', 'admin'], true);

$stmt = $pdo->prepare(
    "SELECT i.id AS item_id, i.sku, i.name, i.image_path,
            tc.id AS checkout_id, tc.assigned_to, a.name AS assigned_to_name,
            tc.checked_out_at, tc.due_back_at, tc.checked_out_by, cb.name AS checked_out_by_name
     FROM items i
     LEFT JOIN tool_checkouts tc ON tc.item_id = i.id AND tc.returned_at IS NULL
     LEFT JOIN inventory_user_roles a  ON a.fieldclock_user_id = tc.assigned_to
     LEFT JOIN inventory_user_roles cb ON cb.fieldclock_user_id = tc.checked_out_by
     WHERE i.is_trackable_asset = 1 AND i.is_active = 1
     ORDER BY i.name"
);
$stmt->execute();
$rows = $stmt->fetchAll();

if (!$isManager) {
    $rows = array_values(array_filter($rows, fn($r) => $r['assigned_to'] === null || (int)$r['assigned_to'] === $auth['user_id']));
}
foreach ($rows as &$r) {
    $r['image_url'] = !empty($r['image_path']) ? APP_URL . '/uploads/' . $r['image_path'] : null;
    unset($r['image_path']);
    $r['is_overdue'] = $r['due_back_at'] !== null && $r['due_back_at'] < date('Y-m-d') && $r['checkout_id'] !== null;
}
echo json_encode(['tools' => $rows]);

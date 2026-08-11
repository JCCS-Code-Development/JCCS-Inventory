<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Everything with a reorder point set is treated as "regularly ordered" and
// worth tracking here. There's no usage-velocity data to forecast exactly
// when stock runs out, so this surfaces the two things a human needs to make
// that call themselves: how close to the reorder point it is right now, and
// how long shipping normally takes once an order goes in.
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$sql = "
    SELECT i.id AS item_id, i.sku, i.name, i.unit_of_measure, i.reorder_point, i.lead_time_days,
           v.id AS vendor_id, v.name AS vendor_name,
           COALESCE((SELECT SUM(s.qty_on_hand) FROM item_stock s WHERE s.item_id = i.id), 0) AS total_qty
    FROM items i
    LEFT JOIN vendors v ON v.id = i.vendor_id
    WHERE i.is_active = 1 AND i.reorder_point > 0
    ORDER BY (total_qty <= i.reorder_point) DESC, i.lead_time_days IS NULL, i.lead_time_days DESC, i.name
";

$pdo  = getPDO();
$rows = $pdo->query($sql)->fetchAll();
foreach ($rows as &$r) {
    $r['status'] = $r['total_qty'] <= $r['reorder_point'] ? 'low' : 'ok';
}
unset($r);

echo json_encode(['items' => $rows]);

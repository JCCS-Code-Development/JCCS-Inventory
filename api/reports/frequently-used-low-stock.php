<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Below reorder point AND actually taken out often (a 'checkout' stock
// transaction — see api/stock/checkout.php) in the last 60 days. Narrows the
// full Low Stock list down to the handful worth restocking first, since not
// everything sitting below its reorder point is something crews reach for
// often.
$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

const FREQUENTLY_USED_LOW_STOCK_SQL = "
    SELECT i.id AS item_id, i.sku, i.name, i.unit_of_measure, i.unit_cost, i.reorder_point,
           COALESCE(s.total_qty, 0) AS qty_on_hand,
           COALESCE(u.usage_count, 0) AS usage_count
    FROM items i
    LEFT JOIN (
        SELECT item_id, SUM(qty_on_hand) AS total_qty FROM item_stock GROUP BY item_id
    ) s ON s.item_id = i.id
    JOIN (
        SELECT item_id, COUNT(*) AS usage_count
        FROM stock_transactions
        WHERE type = 'checkout' AND created_at >= (NOW() - INTERVAL 60 DAY)
        GROUP BY item_id
    ) u ON u.item_id = i.id
    WHERE i.is_active = 1
      AND i.reorder_point > 0
      AND COALESCE(s.total_qty, 0) < i.reorder_point
    ORDER BY u.usage_count DESC, qty_on_hand ASC
    LIMIT 10
";

$pdo  = getPDO();
$rows = $pdo->query(FREQUENTLY_USED_LOW_STOCK_SQL)->fetchAll();
if ($auth['role'] === 'user') { $rows = array_map('stripCostFields', $rows); }
echo json_encode(['items' => $rows]);

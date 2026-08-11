<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

// Every active item × active location combo, so items with no stock yet still show as 0.
const STOCK_REPORT_SQL = "
    SELECT i.id AS item_id, i.sku, i.name, i.unit_of_measure, i.unit_cost, i.reorder_point,
           l.id AS location_id, l.name AS location_name,
           COALESCE(s.qty_on_hand, 0) AS qty_on_hand
    FROM items i
    CROSS JOIN locations l
    LEFT JOIN item_stock s ON s.item_id = i.id AND s.location_id = l.id
    WHERE i.is_active = 1 AND l.is_active = 1
    ORDER BY l.name, i.name
";

$pdo  = getPDO();
$rows = $pdo->query(STOCK_REPORT_SQL)->fetchAll();
if ($auth['role'] === 'user') { $rows = array_map('stripCostFields', $rows); }
echo json_encode(['items' => $rows]);

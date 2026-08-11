<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo $e->getMessage(); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

header('Access-Control-Allow-Origin: ' . FRONTEND_ORIGIN);
header('Access-Control-Allow-Headers: Content-Type, Authorization');
$auth = requireAuth();
requireSpecialistOrAdmin($auth); // CSV dumps raw cost columns, no per-row stripping
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$pdo  = getPDO();
$rows = $pdo->query("
    SELECT i.sku, i.name, l.name AS location_name, COALESCE(s.qty_on_hand, 0) AS qty_on_hand,
           i.unit_of_measure, i.reorder_point, i.unit_cost, v.name AS vendor_name
    FROM items i
    CROSS JOIN locations l
    LEFT JOIN item_stock s ON s.item_id = i.id AND s.location_id = l.id
    LEFT JOIN vendors v ON v.id = i.vendor_id
    WHERE i.is_active = 1 AND l.is_active = 1
      AND i.reorder_point > 0
      AND COALESCE(s.qty_on_hand, 0) < i.reorder_point
    ORDER BY l.name, i.name
")->fetchAll();

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="low-stock-report.csv"');

// PHP 8.4+ requires $escape explicitly (its default is changing) — pass it on
// every call so this doesn't depend on which PHP version the server runs.
$out = fopen('php://output', 'w');
fputcsv($out, ['SKU', 'Name', 'Location', 'Qty On Hand', 'Unit', 'Reorder Point', 'Unit Cost', 'Vendor'], ',', '"', '\\');
foreach ($rows as $r) {
    fputcsv($out, [
        $r['sku'], $r['name'], $r['location_name'], $r['qty_on_hand'], $r['unit_of_measure'],
        $r['reorder_point'], $r['unit_cost'], $r['vendor_name'] ?? '',
    ], ',', '"', '\\');
}
fclose($out);

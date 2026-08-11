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
requireSpecialistOrAdmin($auth);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$pdo  = getPDO();
$rows = $pdo->query("
    SELECT p.name AS project_name, i.sku, i.name AS item_name, i.unit_of_measure, i.unit_cost,
           -SUM(t.qty_delta) AS net_qty_used
    FROM stock_transactions t
    JOIN projects p ON p.id = t.project_id
    JOIN items i    ON i.id = t.item_id
    WHERE t.type IN ('checkout', 'checkin') AND t.project_id IS NOT NULL
    GROUP BY p.id, i.id
    HAVING net_qty_used != 0
    ORDER BY p.name, i.name
")->fetchAll();

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="project-usage-report.csv"');

$out = fopen('php://output', 'w');
fputcsv($out, ['Project', 'SKU', 'Item', 'Qty Used', 'Unit', 'Unit Cost', 'Total Cost'], ',', '"', '\\');
foreach ($rows as $r) {
    fputcsv($out, [
        $r['project_name'], $r['sku'], $r['item_name'], $r['net_qty_used'], $r['unit_of_measure'],
        $r['unit_cost'], round($r['net_qty_used'] * $r['unit_cost'], 2),
    ], ',', '"', '\\');
}
fclose($out);

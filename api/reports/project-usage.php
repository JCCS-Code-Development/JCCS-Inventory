<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

$auth = requireAuth();
requireSpecialistOrAdmin($auth); // this is the labor-cost registry, not for basic users
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

// Net quantity charged to each project per item: checkouts subtract, checkins
// (returns) add back. Costed at the item's *current* unit_cost — transactions
// don't snapshot cost at the time, so this reflects today's pricing.
$sql = "
    SELECT p.id AS project_id, p.name AS project_name,
           i.id AS item_id, i.sku, i.name AS item_name, i.unit_of_measure, i.unit_cost,
           -SUM(t.qty_delta) AS net_qty_used
    FROM stock_transactions t
    JOIN projects p ON p.id = t.project_id
    JOIN items i    ON i.id = t.item_id
    WHERE t.type IN ('checkout', 'checkin') AND t.project_id IS NOT NULL
    GROUP BY p.id, i.id
    HAVING net_qty_used != 0
    ORDER BY p.name, i.name
";

$pdo  = getPDO();
$rows = $pdo->query($sql)->fetchAll();
foreach ($rows as &$r) { $r['total_cost'] = round($r['net_qty_used'] * $r['unit_cost'], 2); }
unset($r);

$totals = [];
foreach ($rows as $r) {
    $pid = $r['project_id'];
    if (!isset($totals[$pid])) $totals[$pid] = ['project_id' => $pid, 'project_name' => $r['project_name'], 'total_cost' => 0];
    $totals[$pid]['total_cost'] += $r['total_cost'];
}
foreach ($totals as &$t) { $t['total_cost'] = round($t['total_cost'], 2); }
unset($t);

echo json_encode(['lines' => $rows, 'totals' => array_values($totals)]);

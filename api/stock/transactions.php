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
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$where  = [];
$params = [];
if (!empty($_GET['item_id']))     { $where[] = 't.item_id = ?';     $params[] = (int)$_GET['item_id']; }
if (!empty($_GET['location_id'])) { $where[] = 't.location_id = ?'; $params[] = (int)$_GET['location_id']; }
if (!empty($_GET['type']) && in_array($_GET['type'], ['receive', 'count_adjustment', 'checkout', 'checkin'], true)) {
    $where[] = 't.type = ?'; $params[] = $_GET['type'];
}
if (!empty($_GET['project_id'])) { $where[] = 't.project_id = ?'; $params[] = (int)$_GET['project_id']; }
$whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

$limit = isset($_GET['limit']) ? min((int)$_GET['limit'], 200) : 50;

$pdo  = getPDO();
$stmt = $pdo->prepare(
    "SELECT t.*, i.sku, i.name AS item_name, i.unit_of_measure, l.name AS location_name,
            r.name AS user_name, p.name AS project_name
     FROM stock_transactions t
     JOIN items i ON i.id = t.item_id
     JOIN locations l ON l.id = t.location_id
     LEFT JOIN inventory_user_roles r ON r.fieldclock_user_id = t.fieldclock_user_id
     LEFT JOIN projects p ON p.id = t.project_id
     $whereSql
     ORDER BY t.created_at DESC
     LIMIT $limit"
);
$stmt->execute($params);
$rows = $stmt->fetchAll();
if ($auth['role'] === 'user') { $rows = array_map('stripCostFields', $rows); }
echo json_encode(['transactions' => $rows]);

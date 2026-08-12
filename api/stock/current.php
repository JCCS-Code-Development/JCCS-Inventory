<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Open to all three roles: backs "check availability" and the item picker
// on the Take/Drop-off page. No cost data here either way.
$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$locationId = isset($_GET['location_id']) ? (int)$_GET['location_id'] : 0;
if (!$locationId) { http_response_code(422); exit(json_encode(['error' => 'Missing location_id'])); }

$pdo  = getPDO();
$stmt = $pdo->prepare(
    'SELECT i.id AS item_id, i.sku, i.name, i.unit_of_measure, i.reorder_point, i.image_path,
            i.default_project_id, p.project_number AS default_project_number,
            i.category_id, c.name AS category_name,
            COALESCE(s.qty_on_hand, 0) AS qty_on_hand
     FROM items i
     LEFT JOIN item_stock s ON s.item_id = i.id AND s.location_id = ?
     LEFT JOIN projects p ON p.id = i.default_project_id
     LEFT JOIN categories c ON c.id = i.category_id
     WHERE i.is_active = 1
     ORDER BY i.name'
);
$stmt->execute([$locationId]);
$rows = $stmt->fetchAll();
foreach ($rows as &$r) { $r['image_url'] = !empty($r['image_path']) ? APP_URL . '/uploads/' . $r['image_path'] : null; }
unset($r);
echo json_encode(['items' => $rows]);

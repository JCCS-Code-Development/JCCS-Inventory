<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Scan-to-select: any authenticated role can look an item up by the barcode
// captured when it was registered (used by Take/Drop-off and Receiving).
$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$barcode = trim($_GET['barcode'] ?? '');
if (!$barcode) { http_response_code(422); exit(json_encode(['error' => 'Missing barcode'])); }

$pdo  = getPDO();
$stmt = $pdo->prepare(
    'SELECT i.*, c.name AS category_name, m.name AS material_name,
            v.name AS vendor_name, p.name AS default_project_name, p.project_number AS default_project_number,
            COALESCE((SELECT SUM(s.qty_on_hand) FROM item_stock s WHERE s.item_id = i.id), 0) AS total_qty
     FROM items i
     JOIN item_barcodes b ON b.item_id = i.id
     LEFT JOIN categories c ON c.id = i.category_id
     LEFT JOIN materials m  ON m.id = i.material_id
     LEFT JOIN vendors v    ON v.id = i.vendor_id
     LEFT JOIN projects p   ON p.id = i.default_project_id
     WHERE b.barcode = ? AND i.is_active = 1'
);
$stmt->execute([$barcode]);
$item = $stmt->fetch();

if (!$item) { http_response_code(404); exit(json_encode(['error' => 'No item registered with that barcode'])); }
$item['image_url'] = !empty($item['image_path']) ? APP_URL . '/uploads/' . $item['image_path'] : null;
if ($auth['role'] === 'user') { $item = stripCostFields($item); }
echo json_encode($item);

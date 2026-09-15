<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Assigning a trackable tool to someone — registering the checkout is the
// Inventory Lead's job (same authority as receiving/registering products),
// same as api/items/index.php's own requireSpecialistOrAdmin.
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['item_id', 'assigned_to']);
$itemId = (int)$body['item_id'];
$assignedTo = (int)$body['assigned_to'];

$pdo = getPDO();

$item = $pdo->prepare('SELECT is_trackable_asset FROM items WHERE id = ?');
$item->execute([$itemId]);
$row = $item->fetch();
if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Item not found'])); }
if (!$row['is_trackable_asset']) { http_response_code(422); exit(json_encode(['error' => 'This item is not a trackable tool'])); }

$open = $pdo->prepare('SELECT 1 FROM tool_checkouts WHERE item_id = ? AND returned_at IS NULL');
$open->execute([$itemId]);
if ($open->fetch()) { http_response_code(422); exit(json_encode(['error' => 'This tool is already checked out'])); }

$who = $pdo->prepare('SELECT 1 FROM inventory_user_roles WHERE fieldclock_user_id = ? AND is_active = 1');
$who->execute([$assignedTo]);
if (!$who->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown employee'])); }

$pdo->prepare(
    'INSERT INTO tool_checkouts (item_id, assigned_to, checked_out_by, due_back_at) VALUES (?, ?, ?, ?)'
)->execute([$itemId, $assignedTo, $auth['user_id'], !empty($body['due_back_at']) ? $body['due_back_at'] : null]);

echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Tool checked out']);

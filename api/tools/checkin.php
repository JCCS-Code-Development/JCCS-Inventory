<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Returning a tool — the person holding it can return it themselves
// (condition notes are their own report of how it came back), or a Lead/
// admin can close it out on their behalf.
$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['checkout_id']);
$checkoutId = (int)$body['checkout_id'];

$pdo = getPDO();
$stmt = $pdo->prepare('SELECT assigned_to, returned_at FROM tool_checkouts WHERE id = ?');
$stmt->execute([$checkoutId]);
$row = $stmt->fetch();
if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Checkout not found'])); }
if ($row['returned_at'] !== null) { http_response_code(422); exit(json_encode(['error' => 'Already returned'])); }

$isManager = in_array($auth['role'], ['specialist', 'admin'], true);
if (!$isManager && (int)$row['assigned_to'] !== $auth['user_id']) {
    http_response_code(403); exit(json_encode(['error' => 'Forbidden']));
}

$pdo->prepare(
    'UPDATE tool_checkouts SET returned_at = NOW(), returned_condition_notes = ? WHERE id = ?'
)->execute([!empty($body['condition_notes']) ? sanitizeString($body['condition_notes']) : null, $checkoutId]);

echo json_encode(['message' => 'Tool returned']);

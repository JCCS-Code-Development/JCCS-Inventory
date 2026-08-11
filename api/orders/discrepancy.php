<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Resolving a discrepancy (the refund/credit got sorted out with the vendor)
// is any Inventory Lead's job, not admin-exclusive — whoever follows up with
// the supplier closes it out.
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

if ($method === 'PUT') {
    $body   = jsonBody();
    $status = $body['status'] ?? null;
    if (!in_array($status, ['open', 'resolved'], true)) {
        http_response_code(422); exit(json_encode(['error' => 'Status must be open or resolved']));
    }

    if ($status === 'resolved') {
        $pdo->prepare(
            'UPDATE order_discrepancy_reports SET status = ?, resolution_notes = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?'
        )->execute([
            'resolved',
            !empty($body['resolution_notes']) ? sanitizeString($body['resolution_notes']) : null,
            $auth['user_id'],
            $id,
        ]);
    } else {
        $pdo->prepare(
            'UPDATE order_discrepancy_reports SET status = ?, resolved_by = NULL, resolved_at = NULL WHERE id = ?'
        )->execute(['open', $id]);
    }
    echo json_encode(['message' => 'Updated']);

} else { http_response_code(405); }

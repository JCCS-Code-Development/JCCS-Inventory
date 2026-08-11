<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$id     = (int)($_GET['id'] ?? 0);
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$stmt = $pdo->prepare('SELECT * FROM order_requests WHERE id = ?');
$stmt->execute([$id]);
$request = $stmt->fetch();
if (!$request) { http_response_code(404); exit(json_encode(['error' => 'Request not found'])); }

if ($method === 'PATCH') {
    // Acting on a ticket — linking it to the order that covers it, or
    // turning it down — is the Inventory Lead's call, not the requester's.
    requireSpecialistOrAdmin($auth);
    $body = jsonBody();
    $status = $body['status'] ?? null;
    if (!in_array($status, ['ordered', 'declined'], true)) {
        http_response_code(422); exit(json_encode(['error' => "status must be 'ordered' or 'declined'"]));
    }

    $orderId = null;
    if ($status === 'ordered') {
        if (empty($body['order_id'])) { http_response_code(422); exit(json_encode(['error' => 'order_id is required to mark a request as ordered'])); }
        $orderId = (int)$body['order_id'];
        $chk = $pdo->prepare('SELECT 1 FROM orders WHERE id = ?');
        $chk->execute([$orderId]);
        if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown order'])); }
    }

    $pdo->prepare(
        'UPDATE order_requests
         SET status = ?, order_id = ?, decline_reason = ?, resolved_by = ?, resolved_at = NOW()
         WHERE id = ?'
    )->execute([
        $status,
        $orderId,
        $status === 'declined' && !empty($body['decline_reason']) ? sanitizeString($body['decline_reason']) : null,
        $auth['user_id'],
        $id,
    ]);
    echo json_encode(['message' => 'Request updated']);

} elseif ($method === 'DELETE') {
    // A requester can withdraw their own ticket while it's still open (they
    // realized they don't need it, or worded it wrong and want to
    // resubmit). Once the Lead has acted on it, only the Lead can remove it.
    $isOwner = $request['requested_by'] === $auth['user_id'];
    $isLead  = in_array($auth['role'], ['specialist', 'admin'], true);
    if ($isOwner && $request['status'] !== 'open' && !$isLead) {
        http_response_code(403); exit(json_encode(['error' => 'This request has already been resolved']));
    }
    if (!$isOwner && !$isLead) { http_response_code(403); exit(json_encode(['error' => 'Forbidden'])); }

    $pdo->prepare('DELETE FROM order_requests WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Request removed']);

} else { http_response_code(405); }

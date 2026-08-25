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
    // Acting on a ticket at all — editing any of its fields, linking it to
    // the order that covers it, or turning it down — is the Inventory
    // Lead's call, not the requester's.
    requireSpecialistOrAdmin($auth);
    $body = jsonBody();

    // Every plain ticket field is editable independent of a status change —
    // the Lead correcting a typo, adding an amount that was left blank,
    // pinning down the job/product during review, all the same mechanism.
    // Only touch what's actually present in the body, so a plain
    // status-resolve call below doesn't clobber edits made elsewhere.
    $fieldSets   = [];
    $fieldParams = [];

    if (array_key_exists('description', $body)) {
        if (trim((string)$body['description']) === '') {
            http_response_code(422); exit(json_encode(['error' => 'Description is required']));
        }
        $fieldSets[] = 'description = ?';
        $fieldParams[] = sanitizeString($body['description']);
    }
    if (array_key_exists('qty_requested', $body)) {
        $fieldSets[] = 'qty_requested = ?';
        $fieldParams[] = $body['qty_requested'] !== '' && $body['qty_requested'] !== null ? (float)$body['qty_requested'] : null;
    }
    if (array_key_exists('unit_of_measure', $body)) {
        $fieldSets[] = 'unit_of_measure = ?';
        $fieldParams[] = !empty($body['unit_of_measure']) ? sanitizeString($body['unit_of_measure']) : null;
    }
    if (array_key_exists('vendor_hint', $body)) {
        $fieldSets[] = 'vendor_hint = ?';
        $fieldParams[] = !empty($body['vendor_hint']) ? sanitizeString($body['vendor_hint']) : null;
    }
    if (array_key_exists('notes', $body)) {
        $fieldSets[] = 'notes = ?';
        $fieldParams[] = !empty($body['notes']) ? sanitizeString($body['notes']) : null;
    }
    if (array_key_exists('project_note', $body)) {
        $fieldSets[] = 'project_note = ?';
        $fieldParams[] = !empty($body['project_note']) ? sanitizeString($body['project_note']) : null;
    }
    if (array_key_exists('location_id', $body)) {
        $locationId = !empty($body['location_id']) ? (int)$body['location_id'] : null;
        if ($locationId) {
            $chk = $pdo->prepare('SELECT 1 FROM locations WHERE id = ?');
            $chk->execute([$locationId]);
            if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown location'])); }
        }
        $fieldSets[] = 'location_id = ?';
        $fieldParams[] = $locationId;
    }
    if (array_key_exists('project_id', $body)) {
        $projectId = !empty($body['project_id']) ? (int)$body['project_id'] : null;
        if ($projectId) {
            $chk = $pdo->prepare('SELECT 1 FROM projects WHERE id = ?');
            $chk->execute([$projectId]);
            if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown project'])); }
        }
        $fieldSets[] = 'project_id = ?';
        $fieldParams[] = $projectId;
    }
    if (array_key_exists('product_link', $body)) {
        $productLink = trim((string)($body['product_link'] ?? ''));
        if ($productLink !== '' && !preg_match('#^https?://#i', $productLink)) {
            http_response_code(422); exit(json_encode(['error' => 'Product link must be a valid URL']));
        }
        $fieldSets[] = 'product_link = ?';
        $fieldParams[] = $productLink !== '' ? $productLink : null;
    }

    if (!array_key_exists('status', $body) || $body['status'] === null || $body['status'] === '') {
        // Plain field edit — no status change.
        if (!$fieldSets) { http_response_code(422); exit(json_encode(['error' => 'Nothing to update'])); }
        $fieldParams[] = $id;
        $pdo->prepare('UPDATE order_requests SET ' . implode(', ', $fieldSets) . ' WHERE id = ?')->execute($fieldParams);
        echo json_encode(['message' => 'Request updated']);
        exit;
    }

    $status = $body['status'];
    if (!in_array($status, ['ordered', 'declined', 'open'], true)) {
        http_response_code(422); exit(json_encode(['error' => "status must be 'ordered', 'declined', or 'open'"]));
    }

    // 'open' here means "undo decline" — the only way back to open once a
    // ticket's been acted on. Not offered from 'ordered' (that has a real
    // order attached to it; walking that back is a bigger deal than a
    // decline, and isn't what this undo is for).
    if ($status === 'open' && $request['status'] !== 'declined') {
        http_response_code(422); exit(json_encode(['error' => 'Only a declined request can be reopened']));
    }

    $orderId = null;
    if ($status === 'ordered') {
        if (empty($body['order_id'])) { http_response_code(422); exit(json_encode(['error' => 'order_id is required to mark a request as ordered'])); }
        $orderId = (int)$body['order_id'];
        $chk = $pdo->prepare('SELECT 1 FROM orders WHERE id = ?');
        $chk->execute([$orderId]);
        if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown order'])); }
    }

    $fieldSets[] = 'status = ?';         $fieldParams[] = $status;
    $fieldSets[] = 'order_id = ?';       $fieldParams[] = $orderId;
    $fieldSets[] = 'decline_reason = ?'; $fieldParams[] = $status === 'declined' && !empty($body['decline_reason']) ? sanitizeString($body['decline_reason']) : null;
    $fieldSets[] = 'resolved_by = ?';    $fieldParams[] = $status === 'open' ? null : $auth['user_id'];
    $fieldSets[] = 'resolved_at = ?';    $fieldParams[] = $status === 'open' ? null : date('Y-m-d H:i:s');
    $fieldParams[] = $id;

    $pdo->prepare('UPDATE order_requests SET ' . implode(', ', $fieldSets) . ' WHERE id = ?')->execute($fieldParams);
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

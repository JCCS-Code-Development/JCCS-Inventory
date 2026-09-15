<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Which conditions email a manager, and who — read by
// api/cron/generate-tasks.php's notification step (see the mailer follow-on
// phase noted in the migration/plan). Manager-configurable, per condition.
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

const CONDITIONS = ['task_due_today', 'task_overdue', 'low_stock', 'tool_overdue', 'pending_approval', 'delivery_not_arrived'];

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        "SELECT nr.*, u.name AS recipient_name
         FROM notification_rules nr LEFT JOIN inventory_user_roles u ON u.fieldclock_user_id = nr.recipient_user_id
         ORDER BY nr.condition_key"
    );
    $stmt->execute();
    echo json_encode(['rules' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    requireFields($body, ['condition_key']);
    if (!in_array($body['condition_key'], CONDITIONS, true)) { http_response_code(422); exit(json_encode(['error' => 'Invalid condition'])); }

    $recipientUserId = !empty($body['recipient_user_id']) ? (int)$body['recipient_user_id'] : null;
    $recipientRole   = in_array($body['recipient_role'] ?? '', ['admin', 'specialist'], true) ? $body['recipient_role'] : null;

    $pdo->prepare(
        'INSERT INTO notification_rules (condition_key, is_enabled, recipient_role, recipient_user_id, updated_by)
         VALUES (?, ?, ?, ?, ?)'
    )->execute([
        $body['condition_key'],
        array_key_exists('is_enabled', $body) ? (!empty($body['is_enabled']) ? 1 : 0) : 1,
        $recipientRole, $recipientUserId, $auth['user_id'],
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Rule created']);

} elseif ($method === 'PUT') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }
    $body = jsonBody();
    $sets = ['updated_by = ?']; $params = [$auth['user_id']];
    if (array_key_exists('is_enabled', $body)) { $sets[] = 'is_enabled = ?'; $params[] = !empty($body['is_enabled']) ? 1 : 0; }
    if (array_key_exists('recipient_role', $body)) {
        $sets[] = 'recipient_role = ?';
        $params[] = in_array($body['recipient_role'], ['admin', 'specialist'], true) ? $body['recipient_role'] : null;
    }
    if (array_key_exists('recipient_user_id', $body)) {
        $sets[] = 'recipient_user_id = ?';
        $params[] = !empty($body['recipient_user_id']) ? (int)$body['recipient_user_id'] : null;
    }
    $params[] = $id;
    $pdo->prepare('UPDATE notification_rules SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    echo json_encode(['message' => 'Rule updated']);

} else { http_response_code(405); }

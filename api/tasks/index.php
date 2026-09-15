<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// The daily-work queue behind the dashboard. Every row here is one of four
// sources (tasks.source): 'recurring'/'event' from api/cron/generate-tasks.php,
// 'improvement' backlog (also cron-seeded, stays unassigned until claimed),
// or 'manual' (a Lead/admin created it directly, right here).
//
// A basic 'user' only ever sees their own assignments plus the unclaimed
// pool — never a coworker's task, and never cost/vendor data (this endpoint
// simply never selects those columns, for any role, since a task feed has
// no legitimate reason to show them).
$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

const TASK_SELECT = "
    SELECT t.id, t.source, t.template_id, t.trigger_key, t.title, t.instructions, t.category,
           t.priority, t.status, t.status_note, t.follow_up_at, t.assigned_to,
           a.name AS assigned_to_name,
           t.location_id, l.name AS location_name,
           t.item_id, i.sku AS item_sku, i.name AS item_name, i.unit_of_measure,
           t.project_id, p.project_number, p.name AS project_name,
           t.linked_order_id, o.order_number, o.status AS order_status,
           t.requires_approval, t.requires_photo, t.requires_note, t.requires_qty,
           t.completion_notes, t.completed_qty, t.due_at,
           t.created_by, c.name AS created_by_name,
           t.completed_by, cb.name AS completed_by_name,
           t.completed_at, t.created_at, t.updated_at,
           (SELECT COUNT(*) FROM task_checklist_items tci WHERE tci.task_id = t.id) AS checklist_total,
           (SELECT COUNT(*) FROM task_checklist_items tci WHERE tci.task_id = t.id AND tci.is_checked = 1) AS checklist_done,
           (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id) AS attachment_count
    FROM tasks t
    LEFT JOIN inventory_user_roles a  ON a.fieldclock_user_id = t.assigned_to
    LEFT JOIN inventory_user_roles c  ON c.fieldclock_user_id = t.created_by
    LEFT JOIN inventory_user_roles cb ON cb.fieldclock_user_id = t.completed_by
    LEFT JOIN locations l ON l.id = t.location_id
    LEFT JOIN items i     ON i.id = t.item_id
    LEFT JOIN projects p  ON p.id = t.project_id
    LEFT JOIN orders o    ON o.id = t.linked_order_id
";

function logTaskHistory(PDO $pdo, int $taskId, int $actorId, string $action, ?string $from, ?string $to, ?string $note = null): void {
    $pdo->prepare(
        'INSERT INTO task_history (task_id, actor_id, action, from_value, to_value, note) VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$taskId, $actorId, $action, $from, $to, $note]);
}

if ($method === 'GET') {
    $where  = [];
    $params = [];

    $isManager = in_array($auth['role'], ['specialist', 'admin'], true);
    if (!$isManager) {
        // Own assignments + the unclaimed pool (improvement backlog, or any
        // manual/event task nobody's picked up yet) — never a coworker's.
        $where[] = '(t.assigned_to = ? OR t.assigned_to IS NULL)';
        $params[] = $auth['user_id'];
    } elseif (!empty($_GET['assigned_to'])) {
        if ($_GET['assigned_to'] === 'unassigned') {
            $where[] = 't.assigned_to IS NULL';
        } else {
            $where[] = 't.assigned_to = ?';
            $params[] = (int)$_GET['assigned_to'];
        }
    }
    if (!empty($_GET['status'])) {
        $statuses = explode(',', $_GET['status']);
        $where[] = 't.status IN (' . implode(',', array_fill(0, count($statuses), '?')) . ')';
        array_push($params, ...$statuses);
    }
    if (!empty($_GET['source'])) { $where[] = 't.source = ?'; $params[] = $_GET['source']; }

    $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $stmt = $pdo->prepare(TASK_SELECT . " $whereSql ORDER BY (t.due_at IS NULL), t.due_at ASC, t.priority = 'high' DESC, t.created_at ASC");
    $stmt->execute($params);
    echo json_encode(['tasks' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    // Manual task creation is a Lead/admin action — an employee never
    // creates their own assignment, only works the ones handed to them (or
    // claims one from the open pool via item.php).
    requireSpecialistOrAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['title']);

    $assignedTo = null;
    if (!empty($body['assigned_to'])) {
        $assignedTo = (int)$body['assigned_to'];
        $chk = $pdo->prepare('SELECT 1 FROM inventory_user_roles WHERE fieldclock_user_id = ? AND is_active = 1');
        $chk->execute([$assignedTo]);
        if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown employee'])); }
    }
    foreach (['location_id' => 'locations', 'item_id' => 'items', 'project_id' => 'projects', 'linked_order_id' => 'orders'] as $field => $table) {
        if (!empty($body[$field])) {
            $chk = $pdo->prepare("SELECT 1 FROM $table WHERE id = ?");
            $chk->execute([(int)$body[$field]]);
            if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => "Unknown $field"])); }
        }
    }
    $requestedPriority = $body['priority'] ?? 'normal';
    $priority = in_array($requestedPriority, ['low', 'normal', 'high'], true) ? $requestedPriority : 'normal';

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO tasks
                (source, title, instructions, category, priority, assigned_to, location_id, item_id,
                 project_id, linked_order_id, requires_approval, requires_photo, requires_note, requires_qty,
                 due_at, created_by)
             VALUES (\'manual\', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            sanitizeString($body['title']),
            !empty($body['instructions']) ? sanitizeString($body['instructions']) : null,
            !empty($body['category']) ? sanitizeString($body['category']) : null,
            $priority,
            $assignedTo,
            !empty($body['location_id']) ? (int)$body['location_id'] : null,
            !empty($body['item_id']) ? (int)$body['item_id'] : null,
            !empty($body['project_id']) ? (int)$body['project_id'] : null,
            !empty($body['linked_order_id']) ? (int)$body['linked_order_id'] : null,
            !empty($body['requires_approval']) ? 1 : 0,
            !empty($body['requires_photo']) ? 1 : 0,
            !empty($body['requires_note']) ? 1 : 0,
            !empty($body['requires_qty']) ? 1 : 0,
            !empty($body['due_at']) ? $body['due_at'] : null,
            $auth['user_id'],
        ]);
        $taskId = (int)$pdo->lastInsertId();

        $checklist = is_array($body['checklist'] ?? null) ? $body['checklist'] : [];
        $ciStmt = $pdo->prepare('INSERT INTO task_checklist_items (task_id, label, sort_order) VALUES (?, ?, ?)');
        foreach (array_values($checklist) as $i => $label) {
            $label = trim((string)$label);
            if ($label === '') continue;
            $ciStmt->execute([$taskId, sanitizeString($label), $i]);
        }

        logTaskHistory($pdo, $taskId, $auth['user_id'], 'created', null, 'to_do');
        if ($assignedTo) { logTaskHistory($pdo, $taskId, $auth['user_id'], 'assigned', null, (string)$assignedTo); }

        $pdo->commit();
        echo json_encode(['id' => $taskId, 'message' => 'Task created']);
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

} else { http_response_code(405); }

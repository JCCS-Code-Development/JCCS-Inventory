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
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$isManager = in_array($auth['role'], ['specialist', 'admin'], true);

$stmt = $pdo->prepare('SELECT * FROM tasks WHERE id = ?');
$stmt->execute([$id]);
$task = $stmt->fetch();
if (!$task) { http_response_code(404); exit(json_encode(['error' => 'Task not found'])); }

// A basic user only ever reaches their own assignment or something still open.
if (!$isManager && $task['assigned_to'] !== null && (int)$task['assigned_to'] !== $auth['user_id']) {
    http_response_code(403); exit(json_encode(['error' => 'Forbidden']));
}

function logHistory(PDO $pdo, int $taskId, int $actorId, string $action, ?string $from, ?string $to, ?string $note = null): void {
    $pdo->prepare(
        'INSERT INTO task_history (task_id, actor_id, action, from_value, to_value, note) VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$taskId, $actorId, $action, $from, $to, $note]);
}

if ($method === 'GET') {
    $out = $pdo->prepare(
        "SELECT t.*, a.name AS assigned_to_name, l.name AS location_name,
                i.sku AS item_sku, i.name AS item_name, i.unit_of_measure,
                p.project_number, p.name AS project_name,
                o.order_number, o.status AS order_status,
                c.name AS created_by_name, cb.name AS completed_by_name
         FROM tasks t
         LEFT JOIN inventory_user_roles a  ON a.fieldclock_user_id = t.assigned_to
         LEFT JOIN inventory_user_roles c  ON c.fieldclock_user_id = t.created_by
         LEFT JOIN inventory_user_roles cb ON cb.fieldclock_user_id = t.completed_by
         LEFT JOIN locations l ON l.id = t.location_id
         LEFT JOIN items i     ON i.id = t.item_id
         LEFT JOIN projects p  ON p.id = t.project_id
         LEFT JOIN orders o    ON o.id = t.linked_order_id
         WHERE t.id = ?"
    );
    $out->execute([$id]);
    $row = $out->fetch();

    $checklist = $pdo->prepare('SELECT id, label, is_checked, sort_order FROM task_checklist_items WHERE task_id = ? ORDER BY sort_order, id');
    $checklist->execute([$id]);
    $row['checklist'] = $checklist->fetchAll();

    $attach = $pdo->prepare(
        "SELECT ta.id, ta.file_path, ta.uploaded_at, u.name AS uploaded_by_name
         FROM task_attachments ta LEFT JOIN inventory_user_roles u ON u.fieldclock_user_id = ta.uploaded_by
         WHERE ta.task_id = ? ORDER BY ta.uploaded_at"
    );
    $attach->execute([$id]);
    $row['attachments'] = array_map(function ($a) {
        $a['url'] = APP_URL . '/uploads/' . $a['file_path'];
        return $a;
    }, $attach->fetchAll());

    $hist = $pdo->prepare(
        "SELECT h.id, h.action, h.from_value, h.to_value, h.note, h.created_at, u.name AS actor_name
         FROM task_history h LEFT JOIN inventory_user_roles u ON u.fieldclock_user_id = h.actor_id
         WHERE h.task_id = ? ORDER BY h.created_at, h.id"
    );
    $hist->execute([$id]);
    $row['history'] = $hist->fetchAll();

    echo json_encode($row);

} elseif ($method === 'PATCH') {
    $body = jsonBody();

    if (in_array($task['status'], ['completed', 'canceled'], true)) {
        http_response_code(422); exit(json_encode(['error' => 'This task is already finished']));
    }

    $pdo->beginTransaction();
    try {
        // ── Claim (anyone) or reassign (manager only) ──────────────────
        if (!empty($body['claim'])) {
            if ($task['assigned_to'] !== null) { http_response_code(422); exit(json_encode(['error' => 'Already assigned'])); }
            $pdo->prepare('UPDATE tasks SET assigned_to = ? WHERE id = ?')->execute([$auth['user_id'], $id]);
            logHistory($pdo, $id, $auth['user_id'], 'assigned', null, (string)$auth['user_id'], 'claimed');
            $task['assigned_to'] = $auth['user_id'];
        } elseif (array_key_exists('assigned_to', $body)) {
            requireSpecialistOrAdmin($auth);
            $newAssignee = !empty($body['assigned_to']) ? (int)$body['assigned_to'] : null;
            if ($newAssignee) {
                $chk = $pdo->prepare('SELECT 1 FROM inventory_user_roles WHERE fieldclock_user_id = ? AND is_active = 1');
                $chk->execute([$newAssignee]);
                if (!$chk->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown employee'])); }
            }
            $pdo->prepare('UPDATE tasks SET assigned_to = ? WHERE id = ?')->execute([$newAssignee, $id]);
            logHistory($pdo, $id, $auth['user_id'], 'assigned', (string)$task['assigned_to'], (string)$newAssignee);
            $task['assigned_to'] = $newAssignee;
        }

        // ── Manager-only field edits ────────────────────────────────────
        $managerFields = ['title' => 's', 'instructions' => 's', 'category' => 's', 'priority' => 'p', 'due_at' => 'd'];
        $sets = []; $params = [];
        foreach ($managerFields as $f => $kind) {
            if (!array_key_exists($f, $body)) continue;
            requireSpecialistOrAdmin($auth);
            if ($kind === 'p' && !in_array($body[$f], ['low', 'normal', 'high'], true)) {
                http_response_code(422); exit(json_encode(['error' => 'Invalid priority'])); }
            $sets[] = "$f = ?";
            $params[] = $body[$f] !== '' && $body[$f] !== null ? ($kind === 's' ? sanitizeString($body[$f]) : $body[$f]) : null;
        }
        if ($sets) {
            $params[] = $id;
            $pdo->prepare('UPDATE tasks SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        }

        // ── Checklist toggle (assignee or manager) ─────────────────────
        if (isset($body['checklist_item_id'])) {
            $ciId = (int)$body['checklist_item_id'];
            $checked = !empty($body['is_checked']) ? 1 : 0;
            $own = $pdo->prepare('SELECT 1 FROM task_checklist_items WHERE id = ? AND task_id = ?');
            $own->execute([$ciId, $id]);
            if (!$own->fetch()) { http_response_code(422); exit(json_encode(['error' => 'Unknown checklist item'])); }
            $pdo->prepare('UPDATE task_checklist_items SET is_checked = ? WHERE id = ?')->execute([$checked, $ciId]);
        }

        // ── Free-form progress fields (assignee or manager) ────────────
        if (array_key_exists('completion_notes', $body)) {
            $pdo->prepare('UPDATE tasks SET completion_notes = ? WHERE id = ?')
                ->execute([!empty($body['completion_notes']) ? sanitizeString($body['completion_notes']) : null, $id]);
            $task['completion_notes'] = $body['completion_notes'] ?? null;
        }
        if (array_key_exists('completed_qty', $body)) {
            $qty = $body['completed_qty'] !== '' && $body['completed_qty'] !== null ? (float)$body['completed_qty'] : null;
            $pdo->prepare('UPDATE tasks SET completed_qty = ? WHERE id = ?')->execute([$qty, $id]);
            $task['completed_qty'] = $qty;
        }

        // ── Status transition ───────────────────────────────────────────
        if (!empty($body['status'])) {
            $status = $body['status'];
            $valid = ['to_do', 'in_progress', 'waiting_approval', 'waiting_delivery', 'blocked', 'completed', 'canceled'];
            if (!in_array($status, $valid, true)) { http_response_code(422); exit(json_encode(['error' => 'Invalid status'])); }

            if ($status === 'canceled') { requireSpecialistOrAdmin($auth); }

            if (in_array($status, ['waiting_approval', 'waiting_delivery', 'blocked'], true)) {
                $note = trim((string)($body['status_note'] ?? ''));
                $followUp = $body['follow_up_at'] ?? null;
                if ($note === '' || empty($followUp)) {
                    http_response_code(422);
                    exit(json_encode(['error' => 'An explanation and a follow-up date are required for this status']));
                }
                $pdo->prepare('UPDATE tasks SET status_note = ?, follow_up_at = ? WHERE id = ?')
                    ->execute([sanitizeString($note), $followUp, $id]);
            }

            if ($status === 'completed') {
                if (!empty($task['requires_approval']) && !$isManager) {
                    http_response_code(422);
                    exit(json_encode(['error' => 'This task needs manager approval — submit it for approval instead']));
                }
                $checklistCounts = $pdo->prepare('SELECT COUNT(*) total, SUM(is_checked) done FROM task_checklist_items WHERE task_id = ?');
                $checklistCounts->execute([$id]);
                $cc = $checklistCounts->fetch();
                if ((int)$cc['total'] > 0 && (int)$cc['done'] < (int)$cc['total']) {
                    http_response_code(422); exit(json_encode(['error' => 'Finish every checklist item first'])); }

                $attachCount = $pdo->prepare('SELECT COUNT(*) FROM task_attachments WHERE task_id = ?');
                $attachCount->execute([$id]);
                if (!empty($task['requires_photo']) && (int)$attachCount->fetchColumn() === 0) {
                    http_response_code(422); exit(json_encode(['error' => 'A photo is required to complete this task'])); }

                if (!empty($task['requires_note']) && empty($task['completion_notes'])) {
                    http_response_code(422); exit(json_encode(['error' => 'Completion notes are required for this task'])); }

                if (!empty($task['requires_qty']) && $task['completed_qty'] === null) {
                    http_response_code(422); exit(json_encode(['error' => 'A quantity is required to complete this task'])); }

                $pdo->prepare('UPDATE tasks SET completed_by = ?, completed_at = NOW() WHERE id = ?')->execute([$auth['user_id'], $id]);
            }

            $pdo->prepare('UPDATE tasks SET status = ? WHERE id = ?')->execute([$status, $id]);
            logHistory($pdo, $id, $auth['user_id'], 'status_changed', $task['status'], $status, $body['status_note'] ?? null);
        }

        $pdo->commit();
        echo json_encode(['message' => 'Task updated']);
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

} else { http_response_code(405); }

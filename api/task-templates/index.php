<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// Recurring/improvement task definitions — api/cron/generate-tasks.php reads
// these on schedule. Lead/admin only, both to view and to manage: an
// employee only ever sees what's been generated from these (in api/tasks/),
// never the template list itself.
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function validTemplateBody(array $body): ?string {
    if (empty(trim((string)($body['title'] ?? '')))) return 'Title is required';
    if (!in_array($body['category'] ?? '', ['recurring', 'improvement'], true)) return 'Category must be recurring or improvement';
    if (($body['category'] ?? '') === 'recurring' && !in_array($body['frequency'] ?? '', ['daily', 'weekly', 'monthly', 'quarterly'], true)) {
        return 'A recurring template needs a frequency';
    }
    return null;
}

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        "SELECT tt.*, a.name AS default_assignee_name, l.name AS default_location_name, c.name AS created_by_name
         FROM task_templates tt
         LEFT JOIN inventory_user_roles a ON a.fieldclock_user_id = tt.default_assignee
         LEFT JOIN inventory_user_roles c ON c.fieldclock_user_id = tt.created_by
         LEFT JOIN locations l ON l.id = tt.default_location_id
         ORDER BY tt.category, tt.frequency, tt.title"
    );
    $stmt->execute();
    $templates = $stmt->fetchAll();
    if ($templates) {
        $ids = array_column($templates, 'id');
        $ph  = implode(',', array_fill(0, count($ids), '?'));
        $cl  = $pdo->prepare("SELECT * FROM task_template_checklist WHERE template_id IN ($ph) ORDER BY sort_order, id");
        $cl->execute($ids);
        $byTemplate = [];
        foreach ($cl->fetchAll() as $row) { $byTemplate[$row['template_id']][] = $row; }
        foreach ($templates as &$t) { $t['checklist'] = $byTemplate[$t['id']] ?? []; }
    }
    echo json_encode(['templates' => $templates]);

} elseif ($method === 'POST') {
    $body = jsonBody();
    if ($err = validTemplateBody($body)) { http_response_code(422); exit(json_encode(['error' => $err])); }
    $requestedPriority = $body['default_priority'] ?? 'normal';
    $defaultPriority = in_array($requestedPriority, ['low', 'normal', 'high'], true) ? $requestedPriority : 'normal';

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO task_templates
                (title, instructions, category, frequency, day_of_week, day_of_month, default_priority,
                 default_assignee, default_location_id, requires_approval, requires_photo, requires_note,
                 requires_qty, is_active, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            sanitizeString($body['title']),
            !empty($body['instructions']) ? sanitizeString($body['instructions']) : null,
            $body['category'],
            $body['category'] === 'recurring' ? $body['frequency'] : null,
            $body['day_of_week'] ?? null,
            $body['day_of_month'] ?? null,
            $defaultPriority,
            !empty($body['default_assignee']) ? (int)$body['default_assignee'] : null,
            !empty($body['default_location_id']) ? (int)$body['default_location_id'] : null,
            !empty($body['requires_approval']) ? 1 : 0,
            !empty($body['requires_photo']) ? 1 : 0,
            !empty($body['requires_note']) ? 1 : 0,
            !empty($body['requires_qty']) ? 1 : 0,
            array_key_exists('is_active', $body) ? (!empty($body['is_active']) ? 1 : 0) : 1,
            $auth['user_id'],
        ]);
        $templateId = (int)$pdo->lastInsertId();

        $checklist = is_array($body['checklist'] ?? null) ? $body['checklist'] : [];
        $ci = $pdo->prepare('INSERT INTO task_template_checklist (template_id, label, sort_order) VALUES (?, ?, ?)');
        foreach (array_values($checklist) as $i => $label) {
            $label = trim((string)$label);
            if ($label === '') continue;
            $ci->execute([$templateId, sanitizeString($label), $i]);
        }
        $pdo->commit();
        echo json_encode(['id' => $templateId, 'message' => 'Template created']);
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }

} else { http_response_code(405); }

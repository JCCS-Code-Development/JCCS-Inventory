<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth();
requireSpecialistOrAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

$chk = $pdo->prepare('SELECT id FROM task_templates WHERE id = ?');
$chk->execute([$id]);
if (!$chk->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Template not found'])); }

if ($method === 'PUT') {
    $body = jsonBody();
    $allowed = [
        'title' => 's', 'instructions' => 's', 'frequency' => 'r', 'day_of_week' => 'r', 'day_of_month' => 'r',
        'default_priority' => 'r', 'default_assignee' => 'i', 'default_location_id' => 'i',
        'requires_approval' => 'b', 'requires_photo' => 'b', 'requires_note' => 'b', 'requires_qty' => 'b',
        'is_active' => 'b',
    ];
    $sets = []; $params = [];
    foreach ($allowed as $f => $kind) {
        if (!array_key_exists($f, $body)) continue;
        $sets[] = "$f = ?";
        $params[] = match ($kind) {
            's' => $body[$f] !== '' && $body[$f] !== null ? sanitizeString((string)$body[$f]) : null,
            'i' => !empty($body[$f]) ? (int)$body[$f] : null,
            'b' => !empty($body[$f]) ? 1 : 0,
            default => $body[$f] !== '' && $body[$f] !== null ? $body[$f] : null,
        };
    }
    if ($sets) {
        $params[] = $id;
        $pdo->prepare('UPDATE task_templates SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    }

    if (array_key_exists('checklist', $body) && is_array($body['checklist'])) {
        $pdo->prepare('DELETE FROM task_template_checklist WHERE template_id = ?')->execute([$id]);
        $ci = $pdo->prepare('INSERT INTO task_template_checklist (template_id, label, sort_order) VALUES (?, ?, ?)');
        foreach (array_values($body['checklist']) as $i => $label) {
            $label = trim((string)$label);
            if ($label === '') continue;
            $ci->execute([$id, sanitizeString($label), $i]);
        }
    }
    echo json_encode(['message' => 'Template updated']);

} elseif ($method === 'DELETE') {
    // Deactivate rather than delete — never lose the record of what a
    // still-open generated task was created from.
    $pdo->prepare('UPDATE task_templates SET is_active = 0 WHERE id = ?')->execute([$id]);
    echo json_encode(['message' => 'Template deactivated']);

} else { http_response_code(405); }

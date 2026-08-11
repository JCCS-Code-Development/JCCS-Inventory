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
requireInventoryAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

if ($method === 'PUT') {
    $body = jsonBody();
    requireFields($body, ['name']);

    if (isset($body['status']) && !in_array($body['status'], ['active', 'completed'], true)) {
        http_response_code(422); exit(json_encode(['error' => 'Status must be active or completed']));
    }

    if (isset($body['project_number'])) {
        $projectNumber = trim((string)$body['project_number']);
        if (!preg_match('/^\d{4}$/', $projectNumber)) {
            http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
        }
        $dupe = $pdo->prepare('SELECT id FROM projects WHERE project_number = ? AND id != ?');
        $dupe->execute([$projectNumber, $id]);
        if ($dupe->fetch()) { http_response_code(422); exit(json_encode(['error' => 'That estimate # is already in use'])); }
    }

    $sets   = ['name = ?'];
    $params = [sanitizeString($body['name'])];
    foreach (['project_number', 'client_name', 'client_address'] as $f) {
        if (!array_key_exists($f, $body)) continue;
        $sets[]   = "$f = ?";
        $params[] = $body[$f] !== '' && $body[$f] !== null ? sanitizeString((string)$body[$f]) : null;
    }
    if (isset($body['status'])) { $sets[] = 'status = ?'; $params[] = $body['status']; }

    $params[] = $id;
    $pdo->prepare('UPDATE projects SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    echo json_encode(['message' => 'Updated']);

} elseif ($method === 'DELETE') {
    // "Mark completed" — no longer selectable for new checkouts, but past
    // cost history stays fully visible in Reports > By Project.
    $pdo->prepare("UPDATE projects SET is_active = 0, status = 'completed' WHERE id = ?")->execute([$id]);
    echo json_encode(['message' => 'Marked completed']);

} else { http_response_code(405); }

<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

$auth = requireAuth(); // any role can read (needed to tag a project on checkout)
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $active = isset($_GET['active']) ? (int)$_GET['active'] : null;
    if ($active !== null) {
        $stmt = $pdo->prepare('SELECT * FROM projects WHERE is_active = ? ORDER BY name');
        $stmt->execute([$active]);
    } else {
        $stmt = $pdo->query('SELECT * FROM projects ORDER BY name');
    }
    echo json_encode(['projects' => $stmt->fetchAll()]);

} elseif ($method === 'POST') {
    // Full project creation (name, client, etc.) stays admin-only. Any role
    // can still get a bare-bones project into existence via resolve.php.
    requireInventoryAdmin($auth);
    $body = jsonBody();
    requireFields($body, ['name', 'project_number']);

    $projectNumber = trim((string)$body['project_number']);
    if (!preg_match('/^\d{4}$/', $projectNumber)) {
        http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
    }
    $dupe = $pdo->prepare('SELECT id FROM projects WHERE project_number = ?');
    $dupe->execute([$projectNumber]);
    if ($dupe->fetch()) { http_response_code(422); exit(json_encode(['error' => 'That estimate # is already in use'])); }

    $pdo->prepare(
        'INSERT INTO projects (name, project_number, client_name, client_address) VALUES (?, ?, ?, ?)'
    )->execute([
        sanitizeString($body['name']),
        $projectNumber,
        !empty($body['client_name'])    ? sanitizeString($body['client_name'])    : null,
        !empty($body['client_address']) ? sanitizeString($body['client_address']) : null,
    ]);
    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'message' => 'Project created']);

} else { http_response_code(405); }

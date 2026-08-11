<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../middleware/validate.php';

// The quick path behind typing a 4-digit Estimate # on Items or Take/Drop-off
// — open to all three roles (unlike full project creation in index.php,
// which stays admin-only). Finds the project with that number, or creates a
// bare-bones one on the spot so cost tracking works immediately. An admin
// can flesh it out later (client name/address) from the Projects page.
$auth = requireAuth();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit; }

$body = jsonBody();
requireFields($body, ['project_number']);
$projectNumber = trim((string)$body['project_number']);
if (!preg_match('/^\d{4}$/', $projectNumber)) {
    http_response_code(422); exit(json_encode(['error' => 'Estimate # must be exactly 4 digits']));
}

$pdo  = getPDO();
$stmt = $pdo->prepare('SELECT * FROM projects WHERE project_number = ?');
$stmt->execute([$projectNumber]);
$project = $stmt->fetch();
$isNew   = false;

if (!$project) {
    $isNew = true;
    $pdo->prepare('INSERT INTO projects (name, project_number) VALUES (?, ?)')
        ->execute(["Estimate $projectNumber", $projectNumber]);
    $stmt = $pdo->prepare('SELECT * FROM projects WHERE id = ?');
    $stmt->execute([(int)$pdo->lastInsertId()]);
    $project = $stmt->fetch();
}

$project['is_new'] = $isNew;
echo json_encode($project);

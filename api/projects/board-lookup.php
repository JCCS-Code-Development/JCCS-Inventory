<?php
// GET /api/projects/board-lookup.php?numbers=1234,5678
//
// Read-only project resolver for the JCCS Calendar Operations Board. No
// FieldClock login (the board runs unattended on a TV): it accepts a shared
// service token in the X-Board-Token header, matched against OPS_BOARD_TOKEN
// in config.php.
//
// Returns { projects: { "1234": {project_number, name, client_name,
// client_address, status, is_active}, ... } } — only numbers that exist.
// No writes, no schema change.
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    exit(json_encode(['error' => 'Method not allowed']));
}

$expected = defined('OPS_BOARD_TOKEN') ? (string) OPS_BOARD_TOKEN : '';
$given    = (string) ($_SERVER['HTTP_X_BOARD_TOKEN'] ?? '');
if ($expected === '' || $expected === 'CHANGE_ME' || !hash_equals($expected, $given)) {
    http_response_code(401);
    exit(json_encode(['error' => 'Invalid board token']));
}

$raw = (string) ($_GET['numbers'] ?? '');
$numbers = array_values(array_unique(array_filter(
    array_map('trim', explode(',', $raw)),
    static fn($n) => preg_match('/^\d{4}$/', $n) === 1
)));

$out = [];
if ($numbers) {
    $pdo  = getPDO();
    $in   = implode(',', array_fill(0, count($numbers), '?'));
    $stmt = $pdo->prepare(
        "SELECT project_number, name, client_name, client_address, status, is_active
         FROM projects WHERE project_number IN ($in)"
    );
    $stmt->execute($numbers);
    foreach ($stmt->fetchAll() as $r) {
        $out[$r['project_number']] = [
            'project_number' => $r['project_number'],
            'name'           => $r['name'],
            'client_name'    => $r['client_name'],
            'client_address' => $r['client_address'],
            'status'         => $r['status'],
            'is_active'      => (bool) $r['is_active'],
        ];
    }
}

echo json_encode(['projects' => (object) $out]);

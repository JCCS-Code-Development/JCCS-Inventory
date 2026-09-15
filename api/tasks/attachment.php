<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Evidence photos for a task — unlike an item's single reference photo
// (api/items/image.php), a task can carry several (before/after, multiple
// angles of damage, etc.), so this appends rather than replaces.
const UPLOAD_DIR = __DIR__ . '/../uploads/tasks';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

$auth   = requireAuth();
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $taskId = isset($_POST['task_id']) ? (int)$_POST['task_id'] : 0;
    if (!$taskId) { http_response_code(422); exit(json_encode(['error' => 'Missing task_id'])); }

    $task = $pdo->prepare('SELECT assigned_to FROM tasks WHERE id = ?');
    $task->execute([$taskId]);
    $row = $task->fetch();
    if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Task not found'])); }
    $isManager = in_array($auth['role'], ['specialist', 'admin'], true);
    if (!$isManager && $row['assigned_to'] !== null && (int)$row['assigned_to'] !== $auth['user_id']) {
        http_response_code(403); exit(json_encode(['error' => 'Forbidden']));
    }

    if (empty($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(422); exit(json_encode(['error' => 'No photo uploaded']));
    }
    $file = $_FILES['photo'];
    if ($file['size'] > MAX_UPLOAD_BYTES) { http_response_code(422); exit(json_encode(['error' => 'Photo is too large (8MB max)'])); }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime  = finfo_file($finfo, $file['tmp_name']);
    if (!isset(ALLOWED_MIME[$mime])) { http_response_code(422); exit(json_encode(['error' => 'Photo must be JPEG, PNG, or WebP'])); }
    $ext = ALLOWED_MIME[$mime];

    if (!is_dir(UPLOAD_DIR)) { mkdir(UPLOAD_DIR, 0755, true); }
    $filename = "{$taskId}-" . bin2hex(random_bytes(6)) . ".{$ext}";
    if (!move_uploaded_file($file['tmp_name'], UPLOAD_DIR . '/' . $filename)) {
        http_response_code(500); exit(json_encode(['error' => 'Could not save the photo']));
    }
    $filePath = "tasks/{$filename}";

    $pdo->prepare('INSERT INTO task_attachments (task_id, file_path, uploaded_by) VALUES (?, ?, ?)')
        ->execute([$taskId, $filePath, $auth['user_id']]);
    $pdo->prepare(
        'INSERT INTO task_history (task_id, actor_id, action, to_value) VALUES (?, ?, \'attachment_added\', ?)'
    )->execute([$taskId, $auth['user_id'], $filePath]);

    echo json_encode(['id' => (int)$pdo->lastInsertId(), 'url' => APP_URL . '/uploads/' . $filePath, 'message' => 'Photo attached']);

} elseif ($method === 'DELETE') {
    $attachId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$attachId) { http_response_code(422); exit(json_encode(['error' => 'Missing id'])); }

    $stmt = $pdo->prepare(
        'SELECT ta.file_path, ta.uploaded_by, t.assigned_to FROM task_attachments ta JOIN tasks t ON t.id = ta.task_id WHERE ta.id = ?'
    );
    $stmt->execute([$attachId]);
    $row = $stmt->fetch();
    if (!$row) { http_response_code(404); exit(json_encode(['error' => 'Attachment not found'])); }
    $isManager = in_array($auth['role'], ['specialist', 'admin'], true);
    if (!$isManager && (int)$row['uploaded_by'] !== $auth['user_id']) {
        http_response_code(403); exit(json_encode(['error' => 'Forbidden']));
    }

    $path = __DIR__ . '/../uploads/' . $row['file_path'];
    if (is_file($path)) { @unlink($path); }
    $pdo->prepare('DELETE FROM task_attachments WHERE id = ?')->execute([$attachId]);
    echo json_encode(['message' => 'Attachment removed']);

} else { http_response_code(405); }

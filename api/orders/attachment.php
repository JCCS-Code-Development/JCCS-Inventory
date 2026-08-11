<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// The permanent record for an order — a photo of a receipt (drop-off flow)
// or an invoice PDF (online-order flow). One file per order; uploading a new
// one replaces whatever was there. Same storage convention as
// items/image.php (inside api/ so .cpanel.yml's existing recursive copy
// picks it up with no extra deploy wiring).
const UPLOAD_DIR       = __DIR__ . '/../uploads/orders';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB backstop — see api/.user.ini for the raised PHP-level ceiling
const ALLOWED_MIME = [
    'image/jpeg'      => 'jpg',
    'image/png'       => 'png',
    'image/webp'      => 'webp',
    'application/pdf' => 'pdf',
];

$auth = requireAuth();
requireSpecialistOrAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function orderAttachmentPath(int $orderId): ?string {
    foreach (glob(UPLOAD_DIR . "/{$orderId}.*") as $existing) {
        return $existing;
    }
    return null;
}

if ($method === 'POST') {
    $orderId = isset($_POST['order_id']) ? (int)$_POST['order_id'] : 0;
    if (!$orderId) { http_response_code(422); exit(json_encode(['error' => 'Missing order_id'])); }

    $stmt = $pdo->prepare('SELECT id FROM orders WHERE id = ?');
    $stmt->execute([$orderId]);
    if (!$stmt->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Order not found'])); }

    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(422); exit(json_encode(['error' => 'No file uploaded']));
    }
    $file = $_FILES['file'];
    if ($file['size'] > MAX_UPLOAD_BYTES) {
        http_response_code(422); exit(json_encode(['error' => 'File is too large (8MB max)']));
    }

    // Trust the file's actual bytes, not the browser-supplied mime string.
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime  = finfo_file($finfo, $file['tmp_name']);
    if (!isset(ALLOWED_MIME[$mime])) {
        http_response_code(422); exit(json_encode(['error' => 'File must be a JPEG/PNG/WebP photo or a PDF']));
    }
    $ext = ALLOWED_MIME[$mime];

    if (!is_dir(UPLOAD_DIR)) { mkdir(UPLOAD_DIR, 0755, true); }

    // Clear out any prior attachment first, in case it was a different format.
    if ($old = orderAttachmentPath($orderId)) { @unlink($old); }

    $filename = "{$orderId}.{$ext}";
    if (!move_uploaded_file($file['tmp_name'], UPLOAD_DIR . '/' . $filename)) {
        http_response_code(500); exit(json_encode(['error' => 'Could not save the file']));
    }

    $attachmentPath = "orders/{$filename}";
    $pdo->prepare('UPDATE orders SET attachment_path = ? WHERE id = ?')->execute([$attachmentPath, $orderId]);

    echo json_encode(['message' => 'Attachment saved', 'attachment_url' => APP_URL . '/uploads/' . $attachmentPath]);

} elseif ($method === 'DELETE') {
    $orderId = isset($_GET['order_id']) ? (int)$_GET['order_id'] : 0;
    if (!$orderId) { http_response_code(422); exit(json_encode(['error' => 'Missing order_id'])); }

    if ($existing = orderAttachmentPath($orderId)) { @unlink($existing); }
    $pdo->prepare('UPDATE orders SET attachment_path = NULL WHERE id = ?')->execute([$orderId]);
    echo json_encode(['message' => 'Attachment removed']);

} else { http_response_code(405); }

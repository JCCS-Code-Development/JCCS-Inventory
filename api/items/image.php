<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Reference photo for an item, editable by specialist/admin ("Inventory Lead
// and Admin") only. One photo per item — uploading a new one replaces
// whatever was there. Stored under api/uploads/items/ (inside the api/ tree
// on purpose: the existing .cpanel.yml deploy step already copies api/.
// recursively, so uploaded photos need no extra deploy wiring, and the local
// PHP dev server can serve them as plain static files with zero config).
const UPLOAD_DIR      = __DIR__ . '/../uploads/items';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB backstop — the frontend compresses client-side well below this
const ALLOWED_MIME = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];

$auth = requireAuth();
requireSpecialistOrAdmin($auth);
$pdo    = getPDO();
$method = $_SERVER['REQUEST_METHOD'];

function itemImagePath(int $itemId): ?string {
    foreach (glob(UPLOAD_DIR . "/{$itemId}.*") as $existing) {
        return $existing;
    }
    return null;
}

if ($method === 'POST') {
    $itemId = isset($_POST['item_id']) ? (int)$_POST['item_id'] : 0;
    if (!$itemId) { http_response_code(422); exit(json_encode(['error' => 'Missing item_id'])); }

    $stmt = $pdo->prepare('SELECT id FROM items WHERE id = ?');
    $stmt->execute([$itemId]);
    if (!$stmt->fetch()) { http_response_code(404); exit(json_encode(['error' => 'Item not found'])); }

    if (empty($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(422); exit(json_encode(['error' => 'No image uploaded']));
    }
    $file = $_FILES['image'];
    if ($file['size'] > MAX_UPLOAD_BYTES) {
        http_response_code(422); exit(json_encode(['error' => 'Image is too large (8MB max)']));
    }

    // Trust the file's actual bytes, not the browser-supplied mime string.
    // (finfo objects free themselves on scope exit since PHP 8.5 — no explicit close.)
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime  = finfo_file($finfo, $file['tmp_name']);
    if (!isset(ALLOWED_MIME[$mime])) {
        http_response_code(422); exit(json_encode(['error' => 'Image must be JPEG, PNG, or WebP']));
    }
    $ext = ALLOWED_MIME[$mime];

    if (!is_dir(UPLOAD_DIR)) { mkdir(UPLOAD_DIR, 0755, true); }

    // Clear out any prior image for this item first, in case it was a
    // different format (so we don't leave an orphaned old.png next to new.jpg).
    if ($old = itemImagePath($itemId)) { @unlink($old); }

    $filename = "{$itemId}.{$ext}";
    if (!move_uploaded_file($file['tmp_name'], UPLOAD_DIR . '/' . $filename)) {
        http_response_code(500); exit(json_encode(['error' => 'Could not save the image']));
    }

    $imagePath = "items/{$filename}";
    $pdo->prepare('UPDATE items SET image_path = ? WHERE id = ?')->execute([$imagePath, $itemId]);

    echo json_encode(['message' => 'Image saved', 'image_url' => APP_URL . '/uploads/' . $imagePath]);

} elseif ($method === 'DELETE') {
    $itemId = isset($_GET['item_id']) ? (int)$_GET['item_id'] : 0;
    if (!$itemId) { http_response_code(422); exit(json_encode(['error' => 'Missing item_id'])); }

    if ($existing = itemImagePath($itemId)) { @unlink($existing); }
    $pdo->prepare('UPDATE items SET image_path = NULL WHERE id = ?')->execute([$itemId]);
    echo json_encode(['message' => 'Image removed']);

} else { http_response_code(405); }

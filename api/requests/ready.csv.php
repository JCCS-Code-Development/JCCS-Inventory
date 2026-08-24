<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo $e->getMessage(); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

header('Access-Control-Allow-Origin: ' . FRONTEND_ORIGIN);
header('Access-Control-Allow-Headers: Content-Type, Authorization');
$auth = requireAuth();
requireSpecialistOrAdmin($auth); // the ordering-day worklist is a Lead-to-Lead handoff, not a worker view
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

// Same "reviewed and still open" queue as the Orders page's Ready to Order
// tab — a printable/shareable version of it for the Mon/Wed/Fri session
// with the other Inventory Lead.
$pdo  = getPDO();
$rows = $pdo->query(
    "SELECT r.created_at, req.name AS requested_by_name, r.description, r.qty_requested,
            r.unit_of_measure, r.vendor_hint, l.name AS location_name,
            p.project_number, p.name AS project_name, r.product_link, r.notes
     FROM order_requests r
     LEFT JOIN inventory_user_roles req ON req.fieldclock_user_id = r.requested_by
     LEFT JOIN locations l ON l.id = r.location_id
     LEFT JOIN projects p  ON p.id = r.project_id
     WHERE r.status = 'open' AND (r.project_id IS NOT NULL OR r.product_link IS NOT NULL)
     ORDER BY r.created_at ASC"
)->fetchAll();

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="ready-to-order-report.csv"');

// PHP 8.4+ requires $escape explicitly (its default is changing) — pass it on
// every call so this doesn't depend on which PHP version the server runs.
$out = fopen('php://output', 'w');
fputcsv($out, ['Requested', 'Requested By', 'Description', 'Qty', 'Unit', 'Vendor Hint', 'Location', 'Project #', 'Project Name', 'Product Link', 'Notes'], ',', '"', '\\');
foreach ($rows as $r) {
    fputcsv($out, [
        $r['created_at'], $r['requested_by_name'] ?? '', $r['description'], $r['qty_requested'] ?? '',
        $r['unit_of_measure'] ?? '', $r['vendor_hint'] ?? '', $r['location_name'] ?? '',
        $r['project_number'] ?? '', $r['project_name'] ?? '', $r['product_link'] ?? '', $r['notes'] ?? '',
    ], ',', '"', '\\');
}
fclose($out);

<?php
// CLI-only. Not reachable over HTTP (no cors.php, no JWT check) — invoked
// directly by a cPanel Cron Jobs entry, e.g. once daily:
//   php /home/<account>/public_html/jccs-inventory/api/cron/generate-tasks.php
// Adding that cron entry is a manual production step; this script alone
// does nothing until something actually calls it on a schedule.
if (php_sapi_name() !== 'cli') { http_response_code(403); exit('CLI only'); }

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';

$pdo = getPDO();
$today = date('Y-m-d');
$dow   = (int)date('w'); // 0=Sun..6=Sat
$dom   = (int)date('j');
$isFirstOfQuarter = in_array((int)date('n'), [1, 4, 7, 10], true) && $dom === 1;

$created = ['recurring' => 0, 'improvement' => 0, 'event' => 0];

// ── 1. Recurring templates due today ─────────────────────────────────────
$templates = $pdo->query(
    "SELECT * FROM task_templates WHERE category = 'recurring' AND is_active = 1"
)->fetchAll();

function templateDueToday(array $t, string $today, int $dow, int $dom, bool $isFirstOfQuarter): bool {
    if ($t['last_generated_on'] === $today) return false; // idempotency guard
    return match ($t['frequency']) {
        'daily'     => true,
        'weekly'    => $t['day_of_week'] === null || (int)$t['day_of_week'] === $dow,
        'monthly'   => $t['day_of_month'] === null ? $dom === 1 : (int)$t['day_of_month'] === $dom,
        'quarterly' => $t['day_of_month'] === null ? $isFirstOfQuarter : ((int)$t['day_of_month'] === $dom && in_array((int)date('n'), [1, 4, 7, 10], true)),
        default     => false,
    };
}

function materializeTask(PDO $pdo, array $fields, array $checklistLabels, int $actorId): int {
    $cols = array_keys($fields);
    $stmt = $pdo->prepare(
        'INSERT INTO tasks (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')'
    );
    $stmt->execute(array_values($fields));
    $taskId = (int)$pdo->lastInsertId();

    $ci = $pdo->prepare('INSERT INTO task_checklist_items (task_id, label, sort_order) VALUES (?, ?, ?)');
    foreach (array_values($checklistLabels) as $i => $label) { $ci->execute([$taskId, $label, $i]); }

    $pdo->prepare('INSERT INTO task_history (task_id, actor_id, action, to_value) VALUES (?, ?, \'created\', \'to_do\')')
        ->execute([$taskId, $actorId]);
    return $taskId;
}

// A system-authored task still needs a valid creator FK — the oldest active
// admin stands in as "the system." If there's truly no admin provisioned
// yet, skip generation rather than fail the whole run.
$systemActor = (int)($pdo->query("SELECT fieldclock_user_id FROM inventory_user_roles WHERE role = 'admin' AND is_active = 1 ORDER BY fieldclock_user_id LIMIT 1")->fetchColumn() ?: 0);
if (!$systemActor) { fwrite(STDERR, "No active admin found — skipping task generation.\n"); exit(1); }

foreach ($templates as $t) {
    if (!templateDueToday($t, $today, $dow, $dom, $isFirstOfQuarter)) continue;

    $checklist = $pdo->prepare('SELECT label FROM task_template_checklist WHERE template_id = ? ORDER BY sort_order, id');
    $checklist->execute([$t['id']]);
    $labels = array_column($checklist->fetchAll(), 'label');

    materializeTask($pdo, [
        'source' => 'recurring', 'template_id' => $t['id'], 'title' => $t['title'],
        'instructions' => $t['instructions'], 'category' => $t['title'], 'priority' => $t['default_priority'],
        'status' => 'to_do', 'assigned_to' => $t['default_assignee'], 'location_id' => $t['default_location_id'],
        'requires_approval' => $t['requires_approval'], 'requires_photo' => $t['requires_photo'],
        'requires_note' => $t['requires_note'], 'requires_qty' => $t['requires_qty'],
        'due_at' => $today . ' 17:00:00', 'created_by' => $systemActor,
    ], $labels, $systemActor);

    $pdo->prepare('UPDATE task_templates SET last_generated_on = ? WHERE id = ?')->execute([$today, $t['id']]);
    $created['recurring']++;
}

// ── 2. Improvement backlog — keep one open task per active template ──────
$improvementTemplates = $pdo->query("SELECT * FROM task_templates WHERE category = 'improvement' AND is_active = 1")->fetchAll();
foreach ($improvementTemplates as $t) {
    $open = $pdo->prepare("SELECT COUNT(*) FROM tasks WHERE template_id = ? AND status NOT IN ('completed', 'canceled')");
    $open->execute([$t['id']]);
    if ((int)$open->fetchColumn() > 0) continue;

    $checklist = $pdo->prepare('SELECT label FROM task_template_checklist WHERE template_id = ? ORDER BY sort_order, id');
    $checklist->execute([$t['id']]);
    $labels = array_column($checklist->fetchAll(), 'label');

    materializeTask($pdo, [
        'source' => 'improvement', 'template_id' => $t['id'], 'title' => $t['title'],
        'instructions' => $t['instructions'], 'category' => $t['title'], 'priority' => $t['default_priority'],
        'status' => 'to_do', 'assigned_to' => $t['default_assignee'], 'location_id' => $t['default_location_id'],
        'requires_approval' => $t['requires_approval'], 'requires_photo' => $t['requires_photo'],
        'requires_note' => $t['requires_note'], 'requires_qty' => $t['requires_qty'],
        'created_by' => $systemActor,
    ], $labels, $systemActor);
    $created['improvement']++;
}

// ── 3. Event-triggered tasks — one open task per (trigger_key, ref) ───────
function ensureEventTask(PDO $pdo, int $systemActor, string $key, int $refId, array $fields, ?string $checklistLabel = null): bool {
    $exists = $pdo->prepare("SELECT 1 FROM tasks WHERE trigger_key = ? AND trigger_ref_id = ? AND status NOT IN ('completed', 'canceled')");
    $exists->execute([$key, $refId]);
    if ($exists->fetch()) return false;
    materializeTask($pdo, array_merge([
        'source' => 'event', 'trigger_key' => $key, 'trigger_ref_id' => $refId,
        'status' => 'to_do', 'priority' => 'high', 'requires_note' => 1, 'created_by' => $systemActor,
    ], $fields), $checklistLabel ? [$checklistLabel] : [], $systemActor);
    return true;
}

// Low stock — same threshold the Reorder Planning report already uses.
$lowStock = $pdo->query(
    "SELECT i.id, i.name, i.reorder_point, i.default_project_id AS project_id,
            COALESCE(SUM(s.qty_on_hand), 0) AS on_hand
     FROM items i LEFT JOIN item_stock s ON s.item_id = i.id
     WHERE i.is_active = 1 AND i.reorder_point > 0
     GROUP BY i.id HAVING on_hand < i.reorder_point"
)->fetchAll();
foreach ($lowStock as $row) {
    if (ensureEventTask($pdo, $systemActor, 'low_stock', (int)$row['id'], [
        'title' => "Low stock: {$row['name']}", 'item_id' => $row['id'],
        'instructions' => 'On hand is below the reorder point — check the Reorder Planning report and request a reorder if still needed.',
    ], 'Reorder requested, or confirmed not needed')) { $created['event']++; }
}

// Overdue tools.
$overdueTools = $pdo->query(
    "SELECT tc.id, tc.assigned_to, tc.due_back_at, i.name
     FROM tool_checkouts tc JOIN items i ON i.id = tc.item_id
     WHERE tc.returned_at IS NULL AND tc.due_back_at IS NOT NULL AND tc.due_back_at < CURDATE()"
)->fetchAll();
foreach ($overdueTools as $row) {
    if (ensureEventTask($pdo, $systemActor, 'tool_overdue', (int)$row['id'], [
        'title' => "Overdue tool: {$row['name']}", 'assigned_to' => $row['assigned_to'],
        'instructions' => "This was due back {$row['due_back_at']} — return it or note why it's still out.",
    ], 'Tool returned, or new due-back date agreed')) { $created['event']++; }
}

// Open delivery discrepancies.
$discrepancies = $pdo->query(
    "SELECT id, order_id FROM order_discrepancy_reports WHERE status = 'open'"
)->fetchAll();
foreach ($discrepancies as $row) {
    if (ensureEventTask($pdo, $systemActor, 'discrepancy', (int)$row['id'], [
        'title' => "Investigate delivery discrepancy on order #{$row['order_id']}", 'linked_order_id' => $row['order_id'],
        'instructions' => 'A receiving discrepancy is still open — chase the vendor for a credit/replacement or resolve it.',
    ], 'Discrepancy resolved or vendor contacted')) { $created['event']++; }
}

// Expiring/expired items (14-day lookahead).
$expiring = $pdo->query(
    "SELECT id, name, expiration_date FROM items WHERE is_active = 1 AND expiration_date IS NOT NULL
     AND expiration_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)"
)->fetchAll();
foreach ($expiring as $row) {
    if (ensureEventTask($pdo, $systemActor, 'expiration', (int)$row['id'], [
        'title' => "Expiration review: {$row['name']}", 'item_id' => $row['id'],
        'instructions' => "Expires {$row['expiration_date']} — pull/use/dispose per policy.",
    ], 'Reviewed and handled')) { $created['event']++; }
}

// Orders stuck in item setup for more than 3 days.
$staleSetup = $pdo->query(
    "SELECT id, order_number FROM orders WHERE status = 'awaiting_item_setup' AND created_at < DATE_SUB(NOW(), INTERVAL 3 DAY)"
)->fetchAll();
foreach ($staleSetup as $row) {
    if (ensureEventTask($pdo, $systemActor, 'item_setup_stale', (int)$row['id'], [
        'title' => 'Finish item setup: order ' . ($row['order_number'] ?: "#{$row['id']}"), 'linked_order_id' => $row['id'],
        'instructions' => "This order has been waiting on item setup for over 3 days — finish naming its line items so it can be received.",
    ])) { $created['event']++; }
}

// ── 4. Notifications ──────────────────────────────────────────────────────
// The real sender is a follow-on phase (porting jccs-projects' Graph-API
// mailer — see [[project-jccs-noreply-mail]]). For now this only logs what
// *would* have gone out, once per condition per day, so nothing gets
// silently lost once sending is wired up, and nothing double-sends today.
function notifyIfDue(PDO $pdo, string $conditionKey, int $count): void {
    if ($count === 0) return;
    $rule = $pdo->prepare('SELECT * FROM notification_rules WHERE condition_key = ? AND is_enabled = 1');
    $rule->execute([$conditionKey]);
    $r = $rule->fetch();
    if (!$r) return;

    $recipient = $r['recipient_user_id']
        ? $pdo->query('SELECT name FROM inventory_user_roles WHERE fieldclock_user_id = ' . (int)$r['recipient_user_id'])->fetchColumn()
        : $r['recipient_role'];
    if (!$recipient) return;

    $already = $pdo->prepare("SELECT 1 FROM notification_log WHERE condition_key = ? AND DATE(sent_at) = CURDATE()");
    $already->execute([$conditionKey]);
    if ($already->fetch()) return; // already notified today for this condition

    // TODO(follow-on phase): call the ported mailer here instead of logging.
    error_log("[jccs-inventory cron] Would notify $recipient about $count open '$conditionKey' item(s).");
    $pdo->prepare('INSERT INTO notification_log (rule_id, condition_key, recipient) VALUES (?, ?, ?)')
        ->execute([$r['id'], $conditionKey, (string)$recipient]);
}

$openCounts = $pdo->query(
    "SELECT
        SUM(status NOT IN ('completed','canceled') AND due_at IS NOT NULL AND DATE(due_at) = CURDATE()) AS due_today,
        SUM(status NOT IN ('completed','canceled') AND due_at IS NOT NULL AND due_at < NOW()) AS overdue,
        SUM(status = 'waiting_approval') AS pending_approval
     FROM tasks"
)->fetch();
notifyIfDue($pdo, 'task_due_today', (int)($openCounts['due_today'] ?? 0));
notifyIfDue($pdo, 'task_overdue', (int)($openCounts['overdue'] ?? 0));
notifyIfDue($pdo, 'pending_approval', (int)($openCounts['pending_approval'] ?? 0));
notifyIfDue($pdo, 'low_stock', count($lowStock));
notifyIfDue($pdo, 'tool_overdue', count($overdueTools));

fwrite(STDOUT, sprintf(
    "generate-tasks: %d recurring, %d improvement, %d event task(s) created.\n",
    $created['recurring'], $created['improvement'], $created['event']
));

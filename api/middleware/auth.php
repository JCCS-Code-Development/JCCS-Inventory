<?php
// Validates the JWT issued by FieldClock's login, then resolves the payload's
// user_id to this app's own role via inventory_user_roles — Inventory does
// not trust FieldClock's `role` claim (employee/admin/contractor) since
// Inventory's roles (admin/specialist/user) are assigned independently.

function requireAuth(): array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!str_starts_with($auth, 'Bearer ')) {
        http_response_code(401);
        exit(json_encode(['error' => 'Unauthorized']));
    }
    $payload = jwt_decode(substr($auth, 7));
    if (!$payload) {
        http_response_code(401);
        exit(json_encode(['error' => 'Token expired or invalid']));
    }

    $pdo  = getPDO();
    $stmt = $pdo->prepare('SELECT * FROM inventory_user_roles WHERE fieldclock_user_id = ? AND is_active = 1');
    $stmt->execute([$payload['user_id']]);
    $access = $stmt->fetch();

    if (!$access) {
        http_response_code(403);
        exit(json_encode(['error' => 'Not provisioned for Inventory']));
    }

    return [
        'user_id' => (int)$payload['user_id'],
        'name'    => $access['name'],
        'role'    => $access['role'],
    ];
}

function requireInventoryAdmin(array $auth): void {
    if ($auth['role'] !== 'admin') {
        http_response_code(403);
        exit(json_encode(['error' => 'Forbidden']));
    }
}

function requireSpecialistOrAdmin(array $auth): void {
    if (!in_array($auth['role'], ['specialist', 'admin'], true)) {
        http_response_code(403);
        exit(json_encode(['error' => 'Forbidden']));
    }
}

// Strips fields a basic 'user' shouldn't see (cost/vendor info) from an item
// or report row. Applied just before json_encode, never at the SQL layer, so
// specialist/admin queries stay untouched.
function stripCostFields(array $row): array {
    unset($row['unit_cost'], $row['vendor_id'], $row['vendor_name']);
    return $row;
}

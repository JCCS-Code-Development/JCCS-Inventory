<?php
// Identical HS256 scheme to FieldClock's — this is what lets a token issued
// by FieldClock's /auth/login.php validate here too, as long as JWT_SECRET
// in config.php matches FieldClock's value exactly.

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/'));
}

function jwt_decode(string $token): array|false {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return false;
    [$h, $b, $s] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "$h.$b", JWT_SECRET, true));
    if (!hash_equals($expected, $s)) return false;
    $payload = json_decode(base64url_decode($b), true);
    if (!$payload || $payload['exp'] < time()) return false;
    return $payload;
}

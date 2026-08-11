<?php
const INVENTORY_TIMEZONE = 'America/New_York';
date_default_timezone_set(INVENTORY_TIMEZONE);

function getPDO(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        // Integration tests run the real API against a disposable database.
        $env = static function (string $name, string $fallback): string {
            $value = getenv($name);
            return $value === false ? $fallback : $value;
        };

        $host = $env('INVENTORY_DB_HOST', DB_HOST);
        $name = $env('INVENTORY_DB_NAME', DB_NAME);
        $user = $env('INVENTORY_DB_USER', DB_USER);
        $pass = $env('INVENTORY_DB_PASS', DB_PASS);

        $pdo = new PDO(
            'mysql:host=' . $host . ';dbname=' . $name . ';charset=utf8mb4',
            $user,
            $pass,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );

        $offset = (new DateTimeImmutable('now', new DateTimeZone(INVENTORY_TIMEZONE)))->format('P');
        $pdo->exec('SET time_zone = ' . $pdo->quote($offset));
    }
    return $pdo;
}

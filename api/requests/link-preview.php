<?php
ini_set('display_errors', 0);
set_exception_handler(function ($e) { http_response_code(500); echo json_encode(['error' => $e->getMessage()]); exit; });
set_error_handler(function ($s, $m, $f, $l) { throw new ErrorException($m, 0, $s, $f, $l); });

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Fetches a product page's title/description/image (Open Graph tags, falling
// back to <title>) so the "product link" a Lead pastes during a request
// review shows a small preview instead of a bare URL. Lead-only, same as
// the field itself — a basic user's session never has a reason to call this.
$auth = requireAuth();
requireSpecialistOrAdmin($auth);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit; }

$url = trim((string)($_GET['url'] ?? ''));
if ($url === '') { http_response_code(422); exit(json_encode(['error' => 'Missing url'])); }

// This fetches whatever URL a Lead pastes in, server-side — resolve and
// reject anything pointing at a private/loopback/link-local address so the
// endpoint can't be used to probe the internal network or hosting infra
// (SSRF). Re-checked on every redirect hop, not just the initial URL.
function isSafePublicHost(string $host): bool {
    $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);
    if ($ip === $host && !filter_var($host, FILTER_VALIDATE_IP)) return false; // DNS didn't resolve
    return (bool)filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
}

function fetchOnce(string $url): ?array {
    $parts = parse_url($url);
    if (!$parts || !in_array($parts['scheme'] ?? '', ['http', 'https'], true) || empty($parts['host'])) return null;
    if (!isSafePublicHost($parts['host'])) return null;

    $body = '';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER         => true,
        CURLOPT_FOLLOWLOCATION => false, // handled manually below, re-validating the host each hop
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT        => 6,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; JCCSInventoryBot/1.0; +https://inventory.jccs-services.com)',
        CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        // Only need the <head> — stop reading once we have enough, so a huge
        // or slow page can't be used to tie up the request.
        CURLOPT_WRITEFUNCTION  => function ($curlHandle, $chunk) use (&$body) {
            $body .= $chunk;
            return strlen($body) > 300000 ? -1 : strlen($chunk);
        },
    ]);
    curl_exec($ch);
    $status      = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize  = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $err         = curl_errno($ch);
    curl_close($ch);
    if ($err && $err !== CURLE_WRITE_ERROR) return null; // WRITE_ERROR is just our own size cutoff, not a real failure

    $headers = substr($body, 0, $headerSize ?: 0);
    $html    = substr($body, $headerSize ?: 0);

    if ($status >= 300 && $status < 400 && preg_match('/^Location:\s*(.+)$/mi', $headers, $m)) {
        $location = trim($m[1]);
        // Resolve a relative redirect against the URL we just requested.
        if (!preg_match('#^https?://#i', $location)) {
            $location = rtrim($parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : ''), '/') . '/' . ltrim($location, '/');
        }
        return ['redirect' => $location];
    }

    return ['html' => $html, 'finalUrl' => $url];
}

// Up to one redirect hop, each one re-validated by fetchOnce/isSafePublicHost.
$result = fetchOnce($url);
if ($result && isset($result['redirect'])) {
    $result = fetchOnce($result['redirect']);
}
if (!$result || empty($result['html'])) {
    echo json_encode(['title' => null, 'description' => null, 'image' => null, 'site_name' => null, 'url' => $url]);
    exit;
}

$doc = new DOMDocument();
libxml_use_internal_errors(true);
$doc->loadHTML($result['html'], LIBXML_NOERROR | LIBXML_NOWARNING);
libxml_clear_errors();
$xpath = new DOMXPath($doc);

$meta = function (string $attr, string $value) use ($xpath): ?string {
    $nodes = $xpath->query("//meta[@$attr='$value']/@content");
    return $nodes->length ? trim($nodes->item(0)->nodeValue) : null;
};

$title = $meta('property', 'og:title');
if (!$title) {
    $titleNodes = $xpath->query('//title');
    $title = $titleNodes->length ? trim($titleNodes->item(0)->textContent) : null;
}
$description = $meta('property', 'og:description') ?: $meta('name', 'description');
$image       = $meta('property', 'og:image');
$siteName    = $meta('property', 'og:site_name');

// A relative og:image (rare, but happens) resolved against the page it came from.
if ($image && !preg_match('#^https?://#i', $image)) {
    $base = parse_url($result['finalUrl']);
    $image = rtrim(($base['scheme'] ?? 'https') . '://' . ($base['host'] ?? ''), '/') . '/' . ltrim($image, '/');
}

echo json_encode([
    'title'       => $title ?: null,
    'description' => $description ?: null,
    'image'       => $image ?: null,
    'site_name'   => $siteName ?: parse_url($result['finalUrl'], PHP_URL_HOST),
    'url'         => $url,
]);

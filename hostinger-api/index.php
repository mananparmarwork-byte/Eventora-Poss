<?php
/**
 * Eventora OS — REST API for Hostinger (PHP 8 + MySQL).
 * Upload this folder as  public_html/api/  (so the API is https://yourdomain.com/api/index.php).
 * One endpoint, JSON in / JSON out:  POST index.php?action=quotes.list   (Authorization: Bearer <token>)
 */
declare(strict_types=1);

$config = require __DIR__ . '/config.php';

/* ---------- CORS ---------- */
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = $config['allowed_origins'];
if (in_array('*', $allowed, true) || ($origin !== '' && in_array($origin, $allowed, true))) {
  header('Access-Control-Allow-Origin: ' . (in_array('*', $allowed, true) ? '*' : $origin));
  header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

function out($data, int $code = 200): void { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function fail(string $message, int $code = 400): void { out(['error' => $message], $code); }

try {
  $pdo = new PDO("mysql:host={$config['db_host']};dbname={$config['db_name']};charset=utf8mb4", $config['db_user'], $config['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
} catch (Throwable $e) { fail('Database connection failed. Check config.php.', 500); }

$body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$action = (string)($_GET['action'] ?? '');

/* ---------- auth ---------- */
function bearer(): string {
  $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if ($h === '' && function_exists('getallheaders')) { foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'authorization') $h = $v; } }
  return preg_match('/^Bearer\s+(.+)$/i', $h, $m) ? trim($m[1]) : '';
}
function currentAdmin(PDO $pdo): ?array {
  $t = bearer();
  if ($t === '') return null;
  $s = $pdo->prepare('SELECT a.id, a.email FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_id WHERE s.token_hash = ? AND s.expires_at > NOW()');
  $s->execute([hash('sha256', $t)]);
  return $s->fetch() ?: null;
}
function requireAdmin(PDO $pdo): array { $a = currentAdmin($pdo); if (!$a) fail('Please sign in again.', 401); return $a; }

/* ---------- helpers ---------- */
function uuid(): string { $d = random_bytes(16); $d[6] = chr(ord($d[6]) & 0x0f | 0x40); $d[8] = chr(ord($d[8]) & 0x3f | 0x80); return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4)); }
function rowToQuote(array $r): array {
  $pricing = json_decode($r['pricing'], true) ?: [];
  $dates = (!empty($pricing['eventDates']) && is_array($pricing['eventDates'])) ? $pricing['eventDates'] : [$r['event_date']];
  return [
    'id' => $r['id'], 'reference' => $r['reference'], 'status' => $r['status'], 'createdAt' => date('c', strtotime($r['created_at'])),
    'customer' => [
      'name' => $r['customer_name'], 'mobile' => $r['mobile'], 'eventType' => $r['event_type'], 'eventDate' => $r['event_date'], 'eventDates' => $dates,
      'eventSlots' => $pricing['eventSlots'] ?? new stdClass(), 'guests' => (int)$r['guests'], 'gstNumber' => $r['customer_gst_number'] ?? '', 'hall' => $r['hall'],
    ],
    'services' => json_decode($r['services'], true) ?: [],
    'pricing' => $pricing,
  ];
}
function quoteFields(array $in): array {
  $c = $in['customer'] ?? []; $p = $in['pricing'] ?? [];
  if (empty($in['reference']) || empty($c['name']) || empty($c['mobile']) || empty($c['eventDate'])) fail('Missing required bill details.');
  $p['eventDates'] = $c['eventDates'] ?? [$c['eventDate']];
  $p['eventSlots'] = $c['eventSlots'] ?? new stdClass();
  return [
    (string)$in['reference'], (string)$c['name'], (string)$c['mobile'], (string)($c['eventType'] ?? ''), (string)$c['eventDate'], max(1, (int)($c['guests'] ?? 1)),
    (string)($c['gstNumber'] ?? ''), (string)($c['hall'] ?? 'Eventora'), json_encode($in['services'] ?? [], JSON_UNESCAPED_UNICODE), json_encode($p, JSON_UNESCAPED_UNICODE),
  ];
}
function getQuoteRow(PDO $pdo, string $ref): ?array { $s = $pdo->prepare('SELECT * FROM quotes WHERE reference = ?'); $s->execute([$ref]); return $s->fetch() ?: null; }
function toMin(?string $t): ?int { return ($t !== null && preg_match('/^(\d{1,2}):(\d{2})$/', $t, $m)) ? ((int)$m[1] * 60 + (int)$m[2]) : null; }

/* ---------- actions ---------- */
try {
  switch ($action) {
    /* public */
    case 'catalog.get': {
      $r = $pdo->query("SELECT categories FROM catalog WHERE id = 'default'")->fetch();
      out(['categories' => $r ? json_decode($r['categories'], true) : null]);
    }
    case 'booked': {
      $map = [];
      foreach ($pdo->query("SELECT event_date, pricing FROM quotes WHERE status = 'confirmed'") as $r) {
        $p = json_decode($r['pricing'], true) ?: [];
        $dates = (!empty($p['eventDates']) && is_array($p['eventDates'])) ? $p['eventDates'] : [$r['event_date']];
        foreach ($dates as $d) {
          $slot = $p['eventSlots'][$d] ?? null;
          $ok = is_array($slot) && toMin($slot['start'] ?? null) !== null && toMin($slot['end'] ?? null) !== null;
          $map[$d][] = $ok ? ['start' => $slot['start'], 'end' => $slot['end']] : ['start' => '00:00', 'end' => '24:00'];
        }
      }
      out($map ?: new stdClass());
    }
    case 'quotes.create': {
      $f = quoteFields($body);
      $id = uuid();
      try {
        $pdo->prepare('INSERT INTO quotes (id, reference, customer_name, mobile, event_type, event_date, guests, customer_gst_number, hall, services, pricing, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute(array_merge([$id], $f, ['new']));
      } catch (PDOException $e) { if ((int)$e->getCode() === 23000) fail('This bill number already exists. Use a different bill number.', 409); throw $e; }
      out(rowToQuote(getQuoteRow($pdo, $f[0])));
    }
    case 'settings.get': {
      $key = (string)($body['key'] ?? '');
      if ($key !== 'business') requireAdmin($pdo);          // payment details are admin-only
      $s = $pdo->prepare('SELECT data FROM app_settings WHERE id = ?'); $s->execute([$key]);
      $r = $s->fetch(); out(['data' => $r ? json_decode($r['data'], true) : null]);
    }
    case 'auth.login': {
      $email = trim((string)($body['email'] ?? '')); $pw = (string)($body['password'] ?? '');
      $s = $pdo->prepare('SELECT * FROM admin_users WHERE email = ?'); $s->execute([$email]); $a = $s->fetch();
      if (!$a || !password_verify($pw, $a['password_hash'])) { usleep(400000); fail('Wrong email or password.', 401); }
      $token = bin2hex(random_bytes(32));
      $pdo->prepare('INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?,?, DATE_ADD(NOW(), INTERVAL ? DAY))')->execute([hash('sha256', $token), $a['id'], (int)$config['session_days']]);
      $pdo->exec('DELETE FROM admin_sessions WHERE expires_at < NOW()');
      out(['token' => $token, 'email' => $a['email']]);
    }
    case 'auth.me': { $a = currentAdmin($pdo); out(['email' => $a['email'] ?? null]); }
    case 'auth.logout': { $t = bearer(); if ($t !== '') $pdo->prepare('DELETE FROM admin_sessions WHERE token_hash = ?')->execute([hash('sha256', $t)]); out(['ok' => true]); }

    /* admin only */
    case 'catalog.save': {
      requireAdmin($pdo);
      $pdo->prepare("INSERT INTO catalog (id, categories) VALUES ('default', ?) ON DUPLICATE KEY UPDATE categories = VALUES(categories)")->execute([json_encode($body['categories'] ?? [], JSON_UNESCAPED_UNICODE)]);
      out(['ok' => true]);
    }
    case 'quotes.list': {
      requireAdmin($pdo);
      out(array_map('rowToQuote', $pdo->query('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 2000')->fetchAll()));
    }
    case 'quotes.get': { requireAdmin($pdo); $r = getQuoteRow($pdo, (string)($body['reference'] ?? '')); out($r ? rowToQuote($r) : null); }
    case 'quotes.update': {
      requireAdmin($pdo);
      $ref = (string)($body['reference'] ?? ''); $f = quoteFields($body['input'] ?? []);
      array_shift($f); // reference is not changed
      $n = $pdo->prepare('UPDATE quotes SET customer_name=?, mobile=?, event_type=?, event_date=?, guests=?, customer_gst_number=?, hall=?, services=?, pricing=? WHERE reference=?');
      $n->execute(array_merge($f, [$ref]));
      if (!getQuoteRow($pdo, $ref)) fail('Bill not found.', 404);
      out(['ok' => true]);
    }
    case 'quotes.pricing': {
      requireAdmin($pdo);
      $pdo->prepare('UPDATE quotes SET pricing = ? WHERE reference = ?')->execute([json_encode($body['pricing'] ?? [], JSON_UNESCAPED_UNICODE), (string)($body['reference'] ?? '')]);
      out(['ok' => true]);
    }
    case 'quotes.status': {
      requireAdmin($pdo);
      $st = (string)($body['status'] ?? '');
      if (!in_array($st, ['new', 'contacted', 'confirmed', 'archived'], true)) fail('Invalid status.');
      $pdo->prepare('UPDATE quotes SET status = ? WHERE reference = ?')->execute([$st, (string)($body['reference'] ?? '')]);
      out(['ok' => true]);
    }
    case 'quotes.delete': { requireAdmin($pdo); $pdo->prepare('DELETE FROM quotes WHERE reference = ?')->execute([(string)($body['reference'] ?? '')]); out(['ok' => true]); }
    case 'settings.save': {
      requireAdmin($pdo);
      $key = (string)($body['key'] ?? '');
      if (!in_array($key, ['business', 'payment'], true)) fail('Unknown settings key.');
      $pdo->prepare('INSERT INTO app_settings (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)')->execute([$key, json_encode($body['data'] ?? new stdClass(), JSON_UNESCAPED_UNICODE)]);
      out(['ok' => true]);
    }
    default: fail('Unknown action.', 404);
  }
} catch (Throwable $e) {
  fail('Server error: ' . $e->getMessage(), 500);
}

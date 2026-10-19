<?php
/**
 * Eventora OS — REST API for Hostinger (PHP 8 + MySQL).
 * Upload this folder as  public_html/api/  (so the API is https://yourdomain.com/api/index.php).
 * One endpoint, JSON in / JSON out:  POST index.php?action=quotes.list   (Authorization: Bearer <token>)
 */
declare(strict_types=1);

$config = require __DIR__ . '/config.php';
date_default_timezone_set('Asia/Kolkata'); // bill numbers restart at midnight India time

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
function currentUser(PDO $pdo): ?array {
  $t = bearer();
  if ($t === '') return null;
  $s = $pdo->prepare('SELECT a.id, a.email, a.role FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_id WHERE s.token_hash = ? AND s.expires_at > NOW() AND a.active = 1');
  $s->execute([hash('sha256', $t)]);
  return $s->fetch() ?: null;
}
/** Owner only. */
function requireAdmin(PDO $pdo): array { $a = currentUser($pdo); if (!$a) fail('Please sign in again.', 401); if ($a['role'] !== 'admin') fail('Only the owner can do this.', 403); return $a; }
/** Owner or employee. */
function requireTeam(PDO $pdo): array { $a = currentUser($pdo); if (!$a) fail('Please sign in again.', 401); return $a; }
function setting(PDO $pdo, string $key): ?array { $s = $pdo->prepare('SELECT data FROM app_settings WHERE id = ?'); $s->execute([$key]); $r = $s->fetch(); return $r ? (json_decode($r['data'], true) ?: []) : null; }
/** What an employee may do; everything is allowed until the owner turns it off. */
function staffCan(PDO $pdo, array $user, string $perm): bool { if ($user['role'] === 'admin') return true; $p = setting($pdo, 'permissions'); return !isset($p[$perm]) || (bool)$p[$perm]; }
function logActivity(PDO $pdo, ?array $user, string $action, string $ref, string $title, string $detail, $data): void {
  $pdo->prepare('INSERT INTO activity_log (id, actor_email, actor_role, action, reference, title, detail, data) VALUES (?,?,?,?,?,?,?,?)')
      ->execute([uuid(), $user['email'] ?? null, $user['role'] ?? 'public', $action, $ref, $title, $detail, json_encode($data ?: new stdClass(), JSON_UNESCAPED_UNICODE)]);
}
/** PREFIX-DDMMYY-NUMBER. Restarts at "start" every day, only goes up during the day (a deleted bill's number is never reused). */
function nextBillNumber(PDO $pdo, bool $consume): string {
  $cfg = setting($pdo, 'numbering') ?? [];
  $pfx = preg_replace('/[^A-Za-z0-9]/', '', (string)($cfg['prefix'] ?? '')) ?: 'EV';
  $st = isset($cfg['start']) && (int)$cfg['start'] > 0 ? (int)$cfg['start'] : 1001;
  $day = date('Y-m-d');
  $own = $consume && !$pdo->inTransaction();   // quotes.create already runs inside a transaction
  if ($own) $pdo->beginTransaction();
  if ($consume) { $pdo->prepare('INSERT IGNORE INTO bill_counters (day, last_seq) VALUES (?, ?)')->execute([$day, $st - 1]); }
  $s = $pdo->prepare('SELECT last_seq FROM bill_counters WHERE day = ?' . ($consume ? ' FOR UPDATE' : '')); $s->execute([$day]);
  $r = $s->fetch(); $seq = $r ? (int)$r['last_seq'] : $st - 1;
  $exists = $pdo->prepare('SELECT 1 FROM quotes WHERE reference = ?');
  do { $seq++; $ref = $pfx . '-' . date('dmy') . '-' . $seq; $exists->execute([$ref]); } while ($exists->fetch());
  if ($consume) { $pdo->prepare('UPDATE bill_counters SET last_seq = ? WHERE day = ?')->execute([$seq, $day]); if ($own) $pdo->commit(); }
  return $ref;
}
/** Employee limits (the owner is never limited). $old/$new are quote rows; pass null to skip a check. */
function enforceStaff(PDO $pdo, array $user, array $old, ?array $newFields, ?string $newStatus, ?array $newPricing): void {
  if ($user['role'] === 'admin') return;
  if ($newStatus !== null && $newStatus !== $old['status'] && !staffCan($pdo, $user, 'markBooked')) fail('Employees are not allowed to mark bills as booked or release them.', 403);
  $op = json_decode($old['pricing'], true) ?: [];
  if ($newPricing !== null || $newFields !== null) {
    $np = $newPricing ?? (json_decode((string)($newFields['pricing'] ?? '{}'), true) ?: []);
    $oldIds = array_column($op['payments'] ?? [], 'id'); $newIds = array_column($np['payments'] ?? [], 'id');
    if (array_diff($oldIds, $newIds) && !staffCan($pdo, $user, 'removePayments')) fail('Employees are not allowed to remove payments.', 403);
    if ($newFields !== null) {
      $skip = ['payments', 'advancePaid', 'advanceAmount', 'balanceDue', 'eventDates', 'eventSlots'];
      $a = $op; $b = $np; foreach ($skip as $k) { unset($a[$k], $b[$k]); }
      $changed = $a != $b || $newFields['customer_name'] !== $old['customer_name'] || $newFields['mobile'] !== $old['mobile'] || $newFields['event_type'] !== $old['event_type'] || $newFields['event_date'] !== $old['event_date']
        || (int)$newFields['guests'] !== (int)$old['guests'] || json_decode($newFields['services'], true) != json_decode($old['services'], true)
        || ($op['eventDates'] ?? null) != ($np['eventDates'] ?? null) || ($op['eventSlots'] ?? null) != ($np['eventSlots'] ?? null);
      if ($changed && !staffCan($pdo, $user, 'editBills')) fail('Employees are not allowed to edit bills.', 403);
    }
  }
}

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
      $user = currentUser($pdo);   // may be null: the public estimator can also save an enquiry
      $f = quoteFields($body);
      $override = trim((string)($body['overrideRef'] ?? ''));
      $id = uuid();
      try {
        $pdo->beginTransaction();
        $ref = ($override !== '' && $user && $user['role'] === 'admin') ? $override : nextBillNumber($pdo, true);
        $f[0] = $ref;
        $pdo->prepare('INSERT INTO quotes (id, reference, customer_name, mobile, event_type, event_date, guests, customer_gst_number, hall, services, pricing, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute(array_merge([$id], $f, ['new']));
        $p = json_decode($f[9], true) ?: [];
        logActivity($pdo, $user, 'bill.created', $ref, "Bill $ref created", $f[1] . ' · ' . $f[3] . ' · total ₹' . number_format((float)($p['grandTotal'] ?? 0), 0),
          ['customer' => $f[1], 'mobile' => $f[2], 'eventType' => $f[3], 'guests' => $f[5], 'total' => (float)($p['grandTotal'] ?? 0), 'dates' => implode(', ', $p['eventDates'] ?? [])]);
        $pdo->commit();
      } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ((int)$e->getCode() === 23000) fail('This bill number already exists. Use a different bill number.', 409);
        throw $e;
      }
      out(rowToQuote(getQuoteRow($pdo, $f[0])));
    }
    case 'bill.peek': { requireTeam($pdo); out(['reference' => nextBillNumber($pdo, false)]); }
    case 'bill.setNext': {
      requireAdmin($pdo); $n = (int)($body['n'] ?? 0); if ($n < 1) fail('The number must be 1 or more.');
      $pdo->prepare('INSERT INTO bill_counters (day, last_seq) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_seq = VALUES(last_seq)')->execute([date('Y-m-d'), $n - 1]);
      out(['ok' => true]);
    }
    case 'settings.get': {
      $key = (string)($body['key'] ?? '');
      if ($key === 'business') { /* public: printed on bills */ }
      elseif (in_array($key, ['payment', 'permissions', 'numbering'], true)) requireTeam($pdo);
      else requireAdmin($pdo);
      out(['data' => setting($pdo, $key)]);
    }
    case 'auth.login': {
      $email = trim((string)($body['email'] ?? '')); $pw = (string)($body['password'] ?? '');
      $s = $pdo->prepare('SELECT * FROM admin_users WHERE email = ?'); $s->execute([$email]); $a = $s->fetch();
      if (!$a || !password_verify($pw, $a['password_hash'])) { usleep(400000); fail('Wrong email or password.', 401); }
      if (!(int)$a['active']) fail('This account is switched off. Please ask the owner.', 403);
      $token = bin2hex(random_bytes(32));
      $pdo->prepare('INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?,?, DATE_ADD(NOW(), INTERVAL ? DAY))')->execute([hash('sha256', $token), $a['id'], (int)$config['session_days']]);
      $pdo->exec('DELETE FROM admin_sessions WHERE expires_at < NOW()');
      out(['token' => $token, 'email' => $a['email'], 'role' => $a['role']]);
    }
    case 'auth.me': { $a = currentUser($pdo); out(['email' => $a['email'] ?? null, 'role' => $a['role'] ?? null]); }
    case 'auth.logout': { $t = bearer(); if ($t !== '') $pdo->prepare('DELETE FROM admin_sessions WHERE token_hash = ?')->execute([hash('sha256', $t)]); out(['ok' => true]); }

    /* admin only */
    case 'catalog.save': {
      requireAdmin($pdo);
      $pdo->prepare("INSERT INTO catalog (id, categories) VALUES ('default', ?) ON DUPLICATE KEY UPDATE categories = VALUES(categories)")->execute([json_encode($body['categories'] ?? [], JSON_UNESCAPED_UNICODE)]);
      out(['ok' => true]);
    }
    case 'quotes.list': {
      requireTeam($pdo);
      out(array_map('rowToQuote', $pdo->query('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 2000')->fetchAll()));
    }
    case 'quotes.get': { requireTeam($pdo); $r = getQuoteRow($pdo, (string)($body['reference'] ?? '')); out($r ? rowToQuote($r) : null); }
    case 'quotes.update': {
      $user = requireTeam($pdo);
      $ref = (string)($body['reference'] ?? ''); $f = quoteFields($body['input'] ?? []);
      $old = getQuoteRow($pdo, $ref); if (!$old) fail('Bill not found.', 404);
      array_shift($f); // the bill number is never changed
      enforceStaff($pdo, $user, $old, ['customer_name' => $f[0], 'mobile' => $f[1], 'event_type' => $f[2], 'event_date' => $f[3], 'guests' => $f[4], 'services' => $f[7], 'pricing' => $f[8]], null, null);
      $pdo->prepare('UPDATE quotes SET customer_name=?, mobile=?, event_type=?, event_date=?, guests=?, customer_gst_number=?, hall=?, services=?, pricing=? WHERE reference=?')->execute(array_merge($f, [$ref]));
      out(['ok' => true]);
    }
    case 'quotes.pricing': {
      $user = requireTeam($pdo);
      $ref = (string)($body['reference'] ?? ''); $old = getQuoteRow($pdo, $ref); if (!$old) fail('Bill not found.', 404);
      $np = is_array($body['pricing'] ?? null) ? $body['pricing'] : [];
      enforceStaff($pdo, $user, $old, null, null, $np);
      $pdo->prepare('UPDATE quotes SET pricing = ? WHERE reference = ?')->execute([json_encode($np, JSON_UNESCAPED_UNICODE), $ref]);
      out(['ok' => true]);
    }
    case 'quotes.status': {
      $user = requireTeam($pdo);
      $st = (string)($body['status'] ?? '');
      if (!in_array($st, ['new', 'contacted', 'confirmed', 'archived'], true)) fail('Invalid status.');
      $ref = (string)($body['reference'] ?? ''); $old = getQuoteRow($pdo, $ref); if (!$old) fail('Bill not found.', 404);
      enforceStaff($pdo, $user, $old, null, $st, null);
      $pdo->prepare('UPDATE quotes SET status = ? WHERE reference = ?')->execute([$st, $ref]);
      out(['ok' => true]);
    }
    case 'quotes.delete': {
      $user = requireTeam($pdo);
      if (!staffCan($pdo, $user, 'deleteBills')) fail('Employees are not allowed to delete bills.', 403);
      $pdo->prepare('DELETE FROM quotes WHERE reference = ?')->execute([(string)($body['reference'] ?? '')]); out(['ok' => true]);
    }
    case 'activity.log': {
      $user = requireTeam($pdo);
      logActivity($pdo, $user, substr((string)($body['action'] ?? 'settings.changed'), 0, 40), substr((string)($body['reference'] ?? ''), 0, 60), substr((string)($body['title'] ?? ''), 0, 250), (string)($body['detail'] ?? ''), $body['data'] ?? []);
      out(['ok' => true]);
    }
    case 'activity.list': {
      requireAdmin($pdo);
      $n = max(1, min(5000, (int)($body['limit'] ?? 3000)));
      $rows = $pdo->query("SELECT * FROM activity_log ORDER BY at DESC LIMIT $n")->fetchAll();
      out(array_map(fn($r) => ['id' => $r['id'], 'at' => date('c', strtotime($r['at'])), 'actorEmail' => $r['actor_email'] ?? '', 'actorRole' => $r['actor_role'] ?? 'system', 'action' => $r['action'], 'reference' => $r['reference'] ?? '', 'title' => $r['title'], 'detail' => $r['detail'] ?? '', 'data' => json_decode($r['data'] ?? '{}', true) ?: new stdClass()], $rows));
    }
    case 'activity.purge': {
      requireAdmin($pdo);
      $t = strtotime((string)($body['before'] ?? '')); if (!$t) fail('Invalid date.');
      $d = $pdo->prepare('DELETE FROM activity_log WHERE at < ?'); $d->execute([date('Y-m-d H:i:s', $t)]);
      out(['deleted' => $d->rowCount()]);
    }
    case 'staff.list': {
      requireAdmin($pdo);
      out(array_map(fn($r) => ['id' => (string)$r['id'], 'email' => $r['email'], 'active' => (bool)$r['active']], $pdo->query("SELECT id, email, active FROM admin_users WHERE role = 'staff' ORDER BY email")->fetchAll()));
    }
    case 'staff.setActive': {
      requireAdmin($pdo);
      $pdo->prepare("UPDATE admin_users SET active = ? WHERE id = ? AND role = 'staff'")->execute([!empty($body['active']) ? 1 : 0, (int)($body['id'] ?? 0)]);
      if (empty($body['active'])) $pdo->prepare('DELETE FROM admin_sessions WHERE admin_id = ?')->execute([(int)($body['id'] ?? 0)]);
      out(['ok' => true]);
    }
    case 'staff.create': {
      requireAdmin($pdo);
      $email = strtolower(trim((string)($body['email'] ?? ''))); $pw = (string)($body['password'] ?? '');
      if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.');
      if (strlen($pw) < 8) fail('The password must be at least 8 characters.');
      try { $pdo->prepare("INSERT INTO admin_users (email, password_hash, role, active) VALUES (?,?, 'staff', 1)")->execute([$email, password_hash($pw, PASSWORD_DEFAULT)]); }
      catch (PDOException $e) { if ((int)$e->getCode() === 23000) fail('That email already has a login.', 409); throw $e; }
      out(['ok' => true]);
    }
    case 'settings.save': {
      requireAdmin($pdo);
      $key = (string)($body['key'] ?? '');
      if (!in_array($key, ['business', 'payment', 'permissions', 'numbering', 'activity'], true)) fail('Unknown settings key.');
      $pdo->prepare('INSERT INTO app_settings (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)')->execute([$key, json_encode($body['data'] ?? new stdClass(), JSON_UNESCAPED_UNICODE)]);
      out(['ok' => true]);
    }
    default: fail('Unknown action.', 404);
  }
} catch (Throwable $e) {
  fail('Server error: ' . $e->getMessage(), 500);
}

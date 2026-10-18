<?php
// ONE-TIME admin creation. Open in a browser:
//   https://yourdomain.com/api/create-admin.php?key=YOUR_SETUP_KEY&email=you@example.com&password=YourStrongPassword
// Then DELETE THIS FILE from the server.
declare(strict_types=1);
header('Content-Type: text/plain; charset=utf-8');
$config = require __DIR__ . '/config.php';
if (!hash_equals((string)$config['setup_key'], (string)($_GET['key'] ?? ''))) { http_response_code(403); exit('Wrong setup key.'); }
$email = trim((string)($_GET['email'] ?? ''));
$password = (string)($_GET['password'] ?? '');
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) { http_response_code(400); exit('Give a valid email and a password of at least 8 characters.'); }
$pdo = new PDO("mysql:host={$config['db_host']};dbname={$config['db_name']};charset=utf8mb4", $config['db_user'], $config['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$stmt = $pdo->prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)');
$stmt->execute([$email, password_hash($password, PASSWORD_DEFAULT)]);
echo "Admin saved for $email. Now delete create-admin.php from the server.";

<?php
// Copy this file to config.php and fill it in (Hostinger → Databases → MySQL Databases shows these values).
return [
  'db_host' => 'localhost',
  'db_name' => 'u123456789_eventora',
  'db_user' => 'u123456789_eventora',
  'db_pass' => 'CHANGE-ME',
  // Your site address(es) allowed to call this API, e.g. https://yourdomain.com  (use '*' only while testing)
  'allowed_origins' => ['https://yourdomain.com'],
  // Used ONCE by create-admin.php. Choose a long random value, and delete create-admin.php after use.
  'setup_key' => 'CHANGE-ME-TO-A-LONG-RANDOM-VALUE',
  'session_days' => 14,
];

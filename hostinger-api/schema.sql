-- Eventora OS — MySQL schema for Hostinger (phpMyAdmin → Import, or paste in the SQL tab). Safe to run again.
CREATE TABLE IF NOT EXISTS catalog (
  id VARCHAR(40) PRIMARY KEY,
  categories JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS quotes (
  id CHAR(36) PRIMARY KEY,
  reference VARCHAR(60) NOT NULL UNIQUE,
  customer_name VARCHAR(160) NOT NULL,
  mobile VARCHAR(30) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  event_date DATE NOT NULL,
  guests INT NOT NULL,
  customer_gst_number VARCHAR(30) NULL,
  hall VARCHAR(160) NOT NULL DEFAULT 'Eventora',
  services JSON NOT NULL,
  pricing JSON NOT NULL,
  status ENUM('new','contacted','confirmed','archived') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX quotes_created_idx (created_at),
  INDEX quotes_event_idx (event_date),
  INDEX quotes_status_idx (status)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS app_settings (
  id VARCHAR(40) PRIMARY KEY,
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','staff') NOT NULL DEFAULT 'admin',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  admin_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS activity_log (
  id CHAR(36) PRIMARY KEY,
  at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_email VARCHAR(190) NULL,
  actor_role VARCHAR(20) NULL,
  action VARCHAR(40) NOT NULL,
  reference VARCHAR(60) NULL,
  title VARCHAR(250) NOT NULL,
  detail TEXT NULL,
  data JSON NULL,
  INDEX activity_at_idx (at)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS bill_counters (
  day DATE PRIMARY KEY,
  last_seq INT NOT NULL
) CHARACTER SET utf8mb4;

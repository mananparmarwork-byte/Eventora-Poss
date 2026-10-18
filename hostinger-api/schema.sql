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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  admin_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

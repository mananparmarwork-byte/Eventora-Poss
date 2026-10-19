-- Run this ONCE if you already installed the first version of Eventora on Hostinger (phpMyAdmin -> SQL tab).
-- New installs do not need it: schema.sql already contains all of this.
ALTER TABLE admin_users ADD COLUMN role ENUM('admin','staff') NOT NULL DEFAULT 'admin';
ALTER TABLE admin_users ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1;

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

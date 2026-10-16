-- Digify Instagram Studio · MySQL / MariaDB schema
-- You do NOT need to run this by hand: the server creates these tables on start (server/lib/db.js).
-- It is here for reference, or if you prefer to create them in phpMyAdmin first.
-- Times are milliseconds since epoch (BIGINT). Brand voices and docs are JSON stored as text.

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'member',
  session_version INT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS brands (
  id VARCHAR(64) PRIMARY KEY,
  data MEDIUMTEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  updated_by INT UNSIGNED NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS logs (
  id CHAR(26) PRIMARY KEY,
  brand_id VARCHAR(64) NOT NULL,
  skill VARCHAR(32) NOT NULL,
  title VARCHAR(500) NOT NULL DEFAULT '',
  formula SMALLINT NULL,
  body MEDIUMTEXT NOT NULL,
  created_at BIGINT NOT NULL,
  created_by INT UNSIGNED NULL,
  INDEX idx_brand_time (brand_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS docs (
  path VARCHAR(160) PRIMARY KEY,
  data MEDIUMTEXT NOT NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  brand_id VARCHAR(64) NULL,
  skill VARCHAR(32) NOT NULL,
  model VARCHAR(64) NOT NULL,
  input_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_user_time (user_id, created_at),
  INDEX idx_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

"use strict";
// One small SQL layer over two drivers: MySQL/MariaDB in production (Hostinger), Node's built-in SQLite for local dev and tests.
// Queries use "?" placeholders and plain SQL that both engines accept; the few differences live in `upsert` and the schema.
const fs = require("fs");
const path = require("path");
const { config } = require("./config");

const SCHEMA = {
  mysql: [
    `CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(190) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'member',
      session_version INT NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS brands (
      id VARCHAR(64) PRIMARY KEY,
      data MEDIUMTEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      updated_by INT UNSIGNED NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS logs (
      id CHAR(26) PRIMARY KEY,
      brand_id VARCHAR(64) NOT NULL,
      skill VARCHAR(32) NOT NULL,
      title VARCHAR(500) NOT NULL DEFAULT '',
      formula SMALLINT NULL,
      body MEDIUMTEXT NOT NULL,
      created_at BIGINT NOT NULL,
      created_by INT UNSIGNED NULL,
      INDEX idx_brand_time (brand_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS docs (
      path VARCHAR(160) PRIMARY KEY,
      data MEDIUMTEXT NOT NULL,
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS usage_log (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  sqlite: [
    `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', session_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS brands (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by INTEGER NULL)`,
    `CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, skill TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
      formula INTEGER NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, created_by INTEGER NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_brand_time ON logs (brand_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS usage_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NULL, brand_id TEXT NULL, skill TEXT NOT NULL,
      model TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_user_time ON usage_log (user_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_time ON usage_log (created_at)`,
  ],
};

let impl = null;

async function connect() {
  if (impl) return impl;
  if (config.db.driver === "mysql") {
    const mysql = require("mysql2/promise");
    const pool = mysql.createPool({
      host: config.db.host, port: config.db.port, database: config.db.name, user: config.db.user, password: config.db.password,
      connectionLimit: 5, charset: "utf8mb4", supportBigNumbers: true, bigNumberStrings: false,
    });
    impl = {
      driver: "mysql",
      async all(sql, params = []) { const [rows] = await pool.query(sql, params); return rows; },
      async run(sql, params = []) { const [r] = await pool.query(sql, params); return { insertId: r.insertId, changes: r.affectedRows }; },
      upsertSql(table, cols, key, updateCols) {
        return `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ON DUPLICATE KEY UPDATE ${updateCols.map(c => `${c} = VALUES(${c})`).join(", ")}`;
      },
      async close() { await pool.end(); },
    };
  } else {
    const { DatabaseSync } = require("node:sqlite");
    const file = config.db.sqliteFile === ":memory:" ? ":memory:" : path.resolve(config.db.sqliteFile);
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    impl = {
      driver: "sqlite",
      async all(sql, params = []) { return db.prepare(sql).all(...params); },
      async run(sql, params = []) { const r = db.prepare(sql).run(...params); return { insertId: Number(r.lastInsertRowid), changes: Number(r.changes) }; },
      upsertSql(table, cols, key, updateCols) {
        return `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ON CONFLICT(${key}) DO UPDATE SET ${updateCols.map(c => `${c} = excluded.${c}`).join(", ")}`;
      },
      async close() { db.close(); },
    };
  }
  for (const stmt of SCHEMA[impl.driver]) await impl.run(stmt);
  return impl;
}

const db = {
  connect,
  get driver() { return impl && impl.driver; },
  all: (sql, params) => impl.all(sql, params),
  async one(sql, params) { const rows = await impl.all(sql, params); return rows[0] || null; },
  run: (sql, params) => impl.run(sql, params),
  upsert(table, row, key, updateCols) {
    const cols = Object.keys(row);
    return impl.run(impl.upsertSql(table, cols, key, updateCols || cols.filter(c => c !== key)), cols.map(c => row[c]));
  },
  async close() { if (impl) { await impl.close(); impl = null; } },
};

module.exports = { db };

/**
 * Builddy SaaS Scaffold — Database Module
 * SQLite with users, subscriptions, usage_tracking tables, WAL mode, and CRUD helpers.
 *
 * Modification Points:
 *   // {{SCHEMA_INSERTION_POINT}}  — Add CREATE TABLE statements here
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "app.db");

let _db = null;

/**
 * Get or create the singleton database connection.
 * Configures WAL mode for better concurrent read performance.
 */
export function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    console.log(`[db] SQLite database opened at ${DB_PATH} (WAL mode)`);
  }
  return _db;
}

// ---------------------------------------------------------------------------
// Schema Initialisation
// ---------------------------------------------------------------------------

export function initSchema() {
  const db = getDb();

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT    UNIQUE NOT NULL,
      password   TEXT    NOT NULL,
      name       TEXT    DEFAULT '',
      role       TEXT    DEFAULT 'user',
      api_key    TEXT    UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);`);

  // Subscriptions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      plan          TEXT    DEFAULT 'free',
      status        TEXT    DEFAULT 'active',
      stripe_id     TEXT,
      current_period_start DATETIME,
      current_period_end   DATETIME,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);`);

  // Usage tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_tracking (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      metric     TEXT    NOT NULL,
      value      INTEGER DEFAULT 1,
      date       TEXT    NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_tracking(user_id, date);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_metric ON usage_tracking(metric, date);`);

  // Refresh tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      token      TEXT    UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);`);

  // Orders table — tracks digital product purchases linked to Stripe sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_name       TEXT    NOT NULL,
      buyer_email      TEXT    NOT NULL,
      amount           INTEGER NOT NULL,
      currency         TEXT    DEFAULT 'usd',
      status           TEXT    DEFAULT 'pending',
      stripe_session_id TEXT,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(buyer_email);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);`);

  // {{SCHEMA_INSERTION_POINT}}
  // Add your CREATE TABLE statements above this line.

  console.log("[db] Schema initialised.");
}

// ---------------------------------------------------------------------------
// Generic CRUD Helpers
// ---------------------------------------------------------------------------

export function getAll(table, orderCol = "id") {
  const db = getDb();
  const sql = `SELECT * FROM ${table} ORDER BY ${orderCol}`;
  return db.prepare(sql).all();
}

export function getById(table, id) {
  const db = getDb();
  const sql = `SELECT * FROM ${table} WHERE id = ?`;
  return db.prepare(sql).get(id);
}

export function getWhere(table, filters, orderCol = "id") {
  const db = getDb();
  const cols = Object.keys(filters);
  const vals = Object.values(filters);
  const where = cols.map((c) => `${c} = ?`).join(" AND ");
  const sql = `SELECT * FROM ${table} WHERE ${where} ORDER BY ${orderCol}`;
  return db.prepare(sql).all(...vals);
}

export function getOneWhere(table, filters) {
  const db = getDb();
  const cols = Object.keys(filters);
  const vals = Object.values(filters);
  const where = cols.map((c) => `${c} = ?`).join(" AND ");
  const sql = `SELECT * FROM ${table} WHERE ${where} LIMIT 1`;
  return db.prepare(sql).get(...vals);
}

export function create(table, data) {
  const db = getDb();
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
  const info = db.prepare(sql).run(...vals);
  return getById(table, info.lastInsertRowid);
}

export function update(table, id, data) {
  const db = getDb();
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const setClause = cols.map((c) => `${c} = ?`).join(", ");
  const sql = `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  db.prepare(sql).run(...vals, id);
  return getById(table, id);
}

export function deleteRow(table, id) {
  const db = getDb();
  const sql = `DELETE FROM ${table} WHERE id = ?`;
  const info = db.prepare(sql).run(id);
  return info.changes > 0;
}

export function runQuery(sql, params = []) {
  const db = getDb();
  return db.prepare(sql).all(...params);
}

// ---------------------------------------------------------------------------
// Usage Tracking Helper
// ---------------------------------------------------------------------------

export function trackUsage(userId, metric, value = 1) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare(
    `SELECT * FROM usage_tracking WHERE user_id = ? AND metric = ? AND date = ?`
  ).get(userId, metric, today);

  if (existing) {
    db.prepare(
      `UPDATE usage_tracking SET value = value + ? WHERE id = ?`
    ).run(value, existing.id);
  } else {
    db.prepare(
      `INSERT INTO usage_tracking (user_id, metric, value, date) VALUES (?, ?, ?, ?)`
    ).run(userId, metric, value, today);
  }
}

export function getUsage(userId, metric, days = 30) {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return db.prepare(
    `SELECT date, SUM(value) as total FROM usage_tracking
     WHERE user_id = ? AND metric = ? AND date >= ?
     GROUP BY date ORDER BY date`
  ).all(userId, metric, since);
}

// ---------------------------------------------------------------------------
// Order Helpers
// ---------------------------------------------------------------------------

export function createOrder(name, email, amount) {
  const db = getDb();
  const info = db.prepare(
    `INSERT INTO orders (buyer_name, buyer_email, amount) VALUES (?, ?, ?)`
  ).run(name, email, amount);
  return db.prepare(`SELECT * FROM orders WHERE id = ?`).get(info.lastInsertRowid);
}

export function getOrderBySession(sessionId) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM orders WHERE stripe_session_id = ?`
  ).get(sessionId);
}

export function updateOrderStatus(id, status) {
  const db = getDb();
  db.prepare(
    `UPDATE orders SET status = ? WHERE id = ?`
  ).run(status, id);
  return db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id);
}

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
    console.log("[db] Database connection closed.");
  }
}

process.on("SIGINT", () => { closeDb(); process.exit(0); });
process.on("SIGTERM", () => { closeDb(); process.exit(0); });
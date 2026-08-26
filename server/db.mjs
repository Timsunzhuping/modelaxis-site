// SQLite persistence via the built-in node:sqlite driver. No external deps.
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  org_name TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  budget_usd REAL,
  spent_usd REAL NOT NULL DEFAULT 0,
  rpm INTEGER NOT NULL DEFAULT 600,
  allow_models TEXT,
  data_policy TEXT NOT NULL DEFAULT 'standard',
  logging INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  delta_usd REAL NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  key_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  endpoint TEXT,
  region TEXT,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  ttft_ms INTEGER,
  status INTEGER NOT NULL,
  error TEXT,
  stream INTEGER NOT NULL DEFAULT 0,
  byok INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id, created_at);
CREATE TABLE IF NOT EXISTS request_content (
  request_id INTEGER PRIMARY KEY,
  prompt TEXT,
  completion TEXT
);
CREATE TABLE IF NOT EXISTS byok_keys (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  enc_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, provider)
);
`;

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return {
    raw: db,
    get: (sql, ...args) => db.prepare(sql).get(...args),
    all: (sql, ...args) => db.prepare(sql).all(...args),
    run: (sql, ...args) => db.prepare(sql).run(...args),
    close: () => db.close(),
  };
}

export const now = () => new Date().toISOString();

// Accounts, console sessions, API keys, BYOK encryption.
import { randomBytes, scryptSync, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { now } from './db.mjs';

const sha256 = s => createHash('sha256').update(s).digest('hex');

// ---- passwords ----
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
export function verifyPassword(password, salt, hash) {
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

// ---- console sessions ----
const SESSION_TTL_MS = 14 * 24 * 3600 * 1000;

export function createSession(db, userId) {
  const token = 'mx-sess-' + randomBytes(24).toString('base64url');
  db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)',
    sha256(token), userId, now(), new Date(Date.now() + SESSION_TTL_MS).toISOString());
  return token;
}

export function sessionUser(db, req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)mx_sess=([^;]+)/);
  if (!m) return null;
  const sess = db.get('SELECT * FROM sessions WHERE token_hash = ?', sha256(m[1]));
  if (!sess || sess.expires_at < now()) return null;
  return db.get('SELECT id, email, org_name, created_at FROM users WHERE id = ?', sess.user_id) || null;
}

export function destroySession(db, req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)mx_sess=([^;]+)/);
  if (m) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(m[1]));
}

// ---- API keys ----
export function createApiKey(db, userId, opts = {}) {
  const key = 'mx-sk-' + randomBytes(24).toString('base64url');
  const res = db.run(
    `INSERT INTO api_keys (user_id, name, key_hash, prefix, budget_usd, rpm, allow_models, data_policy, logging, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    userId, opts.name || 'default', sha256(key), key.slice(0, 12) + '…',
    opts.budget_usd ?? null, opts.rpm ?? 600,
    opts.allow_models ? JSON.stringify(opts.allow_models) : null,
    opts.data_policy === 'zero-retention' ? 'zero-retention' : 'standard',
    opts.logging ? 1 : 0, now());
  return { key, id: Number(res.lastInsertRowid) };
}

export function apiKeyAuth(db, req) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(mx-sk-[\w-]+)$/i);
  if (!m) return { error: 'invalid_api_key' };
  const row = db.get('SELECT * FROM api_keys WHERE key_hash = ?', sha256(m[1]));
  if (!row || row.revoked) return { error: 'invalid_api_key' };
  return { key: row };
}

// ---- BYOK encryption (AES-256-GCM under the server secret) ----
function kdf(secret) { return createHash('sha256').update('mx-byok:' + secret).digest(); }

export function encryptSecret(secret, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', kdf(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), enc.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}
export function decryptSecret(secret, blob) {
  const [iv, data, tag] = blob.split('.').map(s => Buffer.from(s, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', kdf(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

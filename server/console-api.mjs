// Console (dashboard) API — session-cookie authenticated, same-origin.
import { now } from './db.mjs';
import {
  hashPassword, verifyPassword, createSession, sessionUser, destroySession,
  createApiKey, encryptSecret,
} from './auth.mjs';
import { balance, credit, usageSummary } from './billing.mjs';

const json = (res, status, obj, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(obj));
};
const bad = (res, status, message) => json(res, status, { error: message });

const cookie = token =>
  `mx_sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 24 * 3600}`;

const VALID_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function consoleRoutes(ctx) {
  const { db, cfg } = ctx;

  const requireUser = (req, res) => {
    const user = sessionUser(db, req);
    if (!user) { bad(res, 401, 'Not signed in.'); return null; }
    return user;
  };

  return {
    'POST /api/console/signup': (req, res, body) => {
      const email = String(body?.email || '').trim().toLowerCase();
      const password = String(body?.password || '');
      if (!VALID_EMAIL.test(email)) return bad(res, 400, 'Enter a valid email address.');
      if (password.length < 8) return bad(res, 400, 'Password must be at least 8 characters.');
      if (db.get('SELECT id FROM users WHERE email = ?', email)) return bad(res, 409, 'An account with this email already exists — sign in instead.');
      const { salt, hash } = hashPassword(password);
      const r = db.run('INSERT INTO users (email, pass_hash, salt, created_at) VALUES (?,?,?,?)', email, hash, salt, now());
      const userId = Number(r.lastInsertRowid);
      if (cfg.signupCreditUsd > 0) credit(db, userId, cfg.signupCreditUsd, 'signup_credit');
      const token = createSession(db, userId);
      json(res, 200, { ok: true, email }, { 'Set-Cookie': cookie(token) });
    },

    'POST /api/console/login': (req, res, body) => {
      const email = String(body?.email || '').trim().toLowerCase();
      const user = db.get('SELECT * FROM users WHERE email = ?', email);
      if (!user || !verifyPassword(String(body?.password || ''), user.salt, user.pass_hash)) {
        return bad(res, 401, 'Wrong email or password.');
      }
      const token = createSession(db, user.id);
      json(res, 200, { ok: true, email: user.email }, { 'Set-Cookie': cookie(token) });
    },

    'POST /api/console/logout': (req, res) => {
      destroySession(db, req);
      json(res, 200, { ok: true }, { 'Set-Cookie': 'mx_sess=; Path=/; Max-Age=0' });
    },

    'GET /api/console/me': (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      json(res, 200, {
        email: user.email, created_at: user.created_at,
        balance_usd: Number(balance(db, user.id).toFixed(6)),
        dev_topup: cfg.devTopup, mock_only: cfg.mockOnly,
      });
    },

    'GET /api/console/keys': (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const keys = db.all(
        `SELECT id, name, prefix, budget_usd, spent_usd, rpm, allow_models, data_policy, logging, revoked, created_at, last_used_at
         FROM api_keys WHERE user_id = ? ORDER BY id DESC`, user.id);
      json(res, 200, { keys });
    },

    'POST /api/console/keys': (req, res, body) => {
      const user = requireUser(req, res); if (!user) return;
      const name = String(body?.name || '').trim().slice(0, 60) || 'default';
      const budget = body?.budget_usd != null && body.budget_usd !== '' ? Math.max(0, Number(body.budget_usd)) : null;
      const rpm = Math.min(10000, Math.max(1, Number(body?.rpm) || cfg.defaultRpm));
      let allow = null;
      if (Array.isArray(body?.allow_models) && body.allow_models.length) allow = body.allow_models.map(String);
      const { key, id } = createApiKey(db, user.id, {
        name, budget_usd: budget, rpm, allow_models: allow,
        data_policy: body?.data_policy, logging: Boolean(body?.logging),
      });
      json(res, 200, { id, key, note: 'Store this key now — it is shown only once.' });
    },

    'PATCH /api/console/keys/:id': (req, res, body, params) => {
      const user = requireUser(req, res); if (!user) return;
      const row = db.get('SELECT * FROM api_keys WHERE id = ? AND user_id = ?', Number(params.id), user.id);
      if (!row) return bad(res, 404, 'Key not found.');
      if (body?.revoke === true) db.run('UPDATE api_keys SET revoked = 1 WHERE id = ?', row.id);
      if (body?.budget_usd !== undefined) db.run('UPDATE api_keys SET budget_usd = ? WHERE id = ?', body.budget_usd == null || body.budget_usd === '' ? null : Math.max(0, Number(body.budget_usd)), row.id);
      if (body?.rpm !== undefined) db.run('UPDATE api_keys SET rpm = ? WHERE id = ?', Math.min(10000, Math.max(1, Number(body.rpm) || row.rpm)), row.id);
      json(res, 200, { ok: true });
    },

    'GET /api/console/usage': (req, res, _body, _params, query) => {
      const user = requireUser(req, res); if (!user) return;
      const days = Math.min(90, Math.max(1, Number(query.get('days')) || 30));
      json(res, 200, usageSummary(db, user.id, days));
    },

    'GET /api/console/requests': (req, res, _body, _params, query) => {
      const user = requireUser(req, res); if (!user) return;
      const limit = Math.min(200, Math.max(1, Number(query.get('limit')) || 50));
      const rows = db.all(
        `SELECT r.id, r.model, r.endpoint, r.region, r.tokens_in, r.tokens_out, r.cost_usd,
                r.latency_ms, r.ttft_ms, r.status, r.error, r.stream, r.created_at, k.name AS key_name
         FROM requests r JOIN api_keys k ON k.id = r.key_id
         WHERE r.user_id = ? ORDER BY r.id DESC LIMIT ?`, user.id, limit);
      json(res, 200, { requests: rows });
    },

    'POST /api/console/topup': (req, res, body) => {
      const user = requireUser(req, res); if (!user) return;
      const amount = Number(body?.amount_usd);
      if (!(amount > 0 && amount <= 10000)) return bad(res, 400, 'Amount must be between $0 and $10,000.');
      if (cfg.stripeKey) {
        // Card payments land here once Stripe is configured (checkout session flow).
        return bad(res, 501, 'Stripe checkout is not wired up yet on this deployment.');
      }
      if (!cfg.devTopup) return bad(res, 403, 'Top-ups are disabled on this deployment.');
      credit(db, user.id, amount, 'topup', 'dev');
      json(res, 200, { ok: true, balance_usd: Number(balance(db, user.id).toFixed(6)) });
    },

    'GET /api/console/byok': (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const rows = db.all('SELECT provider, created_at FROM byok_keys WHERE user_id = ?', user.id);
      json(res, 200, { providers: rows });
    },

    'POST /api/console/byok': (req, res, body) => {
      const user = requireUser(req, res); if (!user) return;
      const provider = String(body?.provider || '').toLowerCase();
      const key = String(body?.key || '');
      if (!['openai', 'anthropic', 'google', 'deepseek', 'xai', 'moonshot', 'mistral'].includes(provider)) {
        return bad(res, 400, 'Unsupported provider.');
      }
      if (key.length < 8) return bad(res, 400, 'That does not look like a valid key.');
      db.run('INSERT INTO byok_keys (user_id, provider, enc_key, created_at) VALUES (?,?,?,?) ' +
        'ON CONFLICT(user_id, provider) DO UPDATE SET enc_key = excluded.enc_key, created_at = excluded.created_at',
        user.id, provider, encryptSecret(cfg.secret, key), now());
      json(res, 200, { ok: true });
    },

    'DELETE /api/console/byok/:provider': (req, res, _body, params) => {
      const user = requireUser(req, res); if (!user) return;
      db.run('DELETE FROM byok_keys WHERE user_id = ? AND provider = ?', user.id, String(params.provider).toLowerCase());
      json(res, 200, { ok: true });
    },
  };
}

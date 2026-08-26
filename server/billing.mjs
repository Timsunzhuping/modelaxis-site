// Metering and the credit ledger. Balance = SUM(ledger.delta_usd).
import { now } from './db.mjs';

export function balance(db, userId) {
  return db.get('SELECT COALESCE(SUM(delta_usd), 0) AS bal FROM ledger WHERE user_id = ?', userId).bal;
}

export function credit(db, userId, amountUsd, kind, ref = null) {
  db.run('INSERT INTO ledger (user_id, delta_usd, kind, ref, created_at) VALUES (?,?,?,?,?)',
    userId, amountUsd, kind, ref, now());
}

// Pre-flight gate: enough balance, key budget not exhausted.
export function checkFunds(db, key) {
  if (balance(db, key.user_id) <= 0) {
    return { status: 402, code: 'insufficient_credits', message: 'Credit balance exhausted — top up in the console.' };
  }
  if (key.budget_usd != null && key.spent_usd >= key.budget_usd) {
    return { status: 402, code: 'insufficient_credits', message: `Key budget of $${key.budget_usd} reached — raise it in the console.` };
  }
  return null;
}

export function recordUsage(db, { key, model, endpoint, tokensIn, tokensOut, costUsd, latencyMs, ttftMs, status, error = null, stream = false, byok = false, prompt = null, completion = null }) {
  const res = db.run(
    `INSERT INTO requests (user_id, key_id, model, endpoint, region, tokens_in, tokens_out, cost_usd, latency_ms, ttft_ms, status, error, stream, byok, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    key.user_id, key.id, model, endpoint?.host ?? null, endpoint?.region ?? null,
    tokensIn, tokensOut, costUsd, latencyMs, ttftMs, status, error, stream ? 1 : 0, byok ? 1 : 0, now());
  if (costUsd > 0) {
    credit(db, key.user_id, -costUsd, 'usage', model);
    db.run('UPDATE api_keys SET spent_usd = spent_usd + ?, last_used_at = ? WHERE id = ?', costUsd, now(), key.id);
  } else {
    db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', now(), key.id);
  }
  // Content is stored ONLY when the key opted into logging.
  if (key.logging && (prompt != null || completion != null)) {
    db.run('INSERT INTO request_content (request_id, prompt, completion) VALUES (?,?,?)',
      Number(res.lastInsertRowid), prompt, completion);
  }
  return Number(res.lastInsertRowid);
}

export function usageSummary(db, userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const daily = db.all(
    `SELECT substr(created_at, 1, 10) AS day,
            COUNT(*) AS requests, SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out, SUM(cost_usd) AS cost
     FROM requests WHERE user_id = ? AND created_at >= ? GROUP BY day ORDER BY day`, userId, since);
  const byModel = db.all(
    `SELECT model, COUNT(*) AS requests, SUM(tokens_in + tokens_out) AS tokens, SUM(cost_usd) AS cost
     FROM requests WHERE user_id = ? AND created_at >= ? GROUP BY model ORDER BY cost DESC LIMIT 12`, userId, since);
  return { daily, byModel };
}

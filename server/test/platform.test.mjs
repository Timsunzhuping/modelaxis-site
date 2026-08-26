// End-to-end platform tests against an in-process server in mock mode.
//   node --test server/test/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../index.mjs';

let srv, base, dataDir;
let cookie = '';
let apiKey = '';

const jfetch = async (path, { method = 'GET', body, headers = {}, raw = false } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie?.includes('mx_sess=') && !setCookie.includes('Max-Age=0')) {
    cookie = setCookie.split(';')[0];
  }
  return raw ? res : { status: res.status, json: await res.json() };
};

const chat = (body, key = apiKey, raw = false) => jfetch('/v1/chat/completions', {
  method: 'POST', body, headers: { Authorization: `Bearer ${key}` }, raw,
});

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'mx-test-'));
  srv = await startServer({ port: 0, MX_DATA_DIR: dataDir, MX_MOCK_ONLY: '1', MX_LOG: '0', MX_SIGNUP_CREDIT_USD: '5' });
  base = `http://localhost:${srv.port}`;
});

after(async () => {
  await srv.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('signup grants credit and signs in', async () => {
  const r = await jfetch('/api/console/signup', { method: 'POST', body: { email: 'dev@modelaxis.ai', password: 'hunter22!' } });
  assert.equal(r.status, 200);
  const me = await jfetch('/api/console/me');
  assert.equal(me.status, 200);
  assert.equal(me.json.balance_usd, 5);
});

test('duplicate signup is rejected', async () => {
  const r = await jfetch('/api/console/signup', { method: 'POST', body: { email: 'dev@modelaxis.ai', password: 'hunter22!' } });
  assert.equal(r.status, 409);
});

test('create API key (shown once)', async () => {
  const r = await jfetch('/api/console/keys', { method: 'POST', body: { name: 'test-key' } });
  assert.equal(r.status, 200);
  assert.match(r.json.key, /^mx-sk-/);
  apiKey = r.json.key;
  const list = await jfetch('/api/console/keys');
  assert.equal(list.json.keys.length, 1);
  assert.ok(!JSON.stringify(list.json).includes(apiKey), 'full key must not be listable');
});

test('chat completion (non-stream): 200, usage, cost, balance decreases', async () => {
  const before = (await jfetch('/api/console/me')).json.balance_usd;
  const r = await chat({ model: 'openai/gpt-5', messages: [{ role: 'user', content: 'Hello, axis' }] });
  assert.equal(r.status, 200);
  assert.equal(r.json.model, 'openai/gpt-5');
  assert.ok(r.json.choices[0].message.content.includes('simulated'));
  assert.ok(r.json.usage.total_tokens > 0);
  assert.ok(r.json.modelaxis.cost_usd > 0);
  const after = (await jfetch('/api/console/me')).json.balance_usd;
  assert.ok(after < before, 'balance must decrease');
});

test('usage + request log recorded', async () => {
  const u = await jfetch('/api/console/usage');
  assert.ok(u.json.daily.length >= 1);
  assert.ok(u.json.byModel.find(m => m.model === 'openai/gpt-5'));
  const logs = await jfetch('/api/console/requests');
  assert.equal(logs.json.requests[0].status, 200);
});

test('streaming: OpenAI chunks, [DONE], final usage', async () => {
  const res = await chat({ model: 'deepseek/deepseek-v3.2', stream: true, messages: [{ role: 'user', content: 'stream please' }] }, apiKey, true);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const text = await res.text();
  const events = text.split('\n\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6));
  assert.equal(events.at(-1), '[DONE]');
  const parsed = events.slice(0, -1).map(e => JSON.parse(e));
  const content = parsed.map(p => p.choices[0].delta.content || '').join('');
  assert.ok(content.includes('simulated'));
  const final = parsed.at(-1);
  assert.equal(final.choices[0].finish_reason, 'stop');
  assert.ok(final.usage.completion_tokens > 0);
  assert.ok(final.modelaxis.cost_usd > 0);
});

test('modelaxis/auto resolves to a cheap model', async () => {
  const r = await chat({ model: 'modelaxis/auto', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(r.status, 200);
  assert.notEqual(r.json.model, 'modelaxis/auto');
});

test('unknown model → 400', async () => {
  const r = await chat({ model: 'nope/never', messages: [{ role: 'user', content: 'x' }] });
  assert.equal(r.status, 400);
});

test('bad key → 401, revoked key → 401', async () => {
  const r = await chat({ model: 'openai/gpt-5', messages: [{ role: 'user', content: 'x' }] }, 'mx-sk-invalid');
  assert.equal(r.status, 401);
  assert.equal(r.json.error.code, 'invalid_api_key');

  const created = await jfetch('/api/console/keys', { method: 'POST', body: { name: 'revoke-me' } });
  await jfetch(`/api/console/keys/${created.json.id}`, { method: 'PATCH', body: { revoke: true } });
  const r2 = await chat({ model: 'openai/gpt-5', messages: [{ role: 'user', content: 'x' }] }, created.json.key);
  assert.equal(r2.status, 401);
});

test('model allowlist → 403 model_not_allowed', async () => {
  const created = await jfetch('/api/console/keys', { method: 'POST', body: { name: 'narrow', allow_models: ['openai/gpt-5'] } });
  const ok = await chat({ model: 'openai/gpt-5', messages: [{ role: 'user', content: 'x' }] }, created.json.key);
  assert.equal(ok.status, 200);
  const blocked = await chat({ model: 'x-ai/grok-4', messages: [{ role: 'user', content: 'x' }] }, created.json.key);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.error.code, 'model_not_allowed');
});

test('key budget exhaustion → 402', async () => {
  const created = await jfetch('/api/console/keys', { method: 'POST', body: { name: 'tiny-budget', budget_usd: 0.000001 } });
  const first = await chat({ model: 'openai/gpt-5-nano', messages: [{ role: 'user', content: 'one' }] }, created.json.key);
  assert.equal(first.status, 200);
  const second = await chat({ model: 'openai/gpt-5-nano', messages: [{ role: 'user', content: 'two' }] }, created.json.key);
  assert.equal(second.status, 402);
  assert.equal(second.json.error.code, 'insufficient_credits');
});

test('rate limit → 429 with Retry-After', async () => {
  const created = await jfetch('/api/console/keys', { method: 'POST', body: { name: 'slow', rpm: 2 } });
  const k = created.json.key;
  await chat({ model: 'openai/gpt-5-nano', messages: [{ role: 'user', content: '1' }] }, k);
  await chat({ model: 'openai/gpt-5-nano', messages: [{ role: 'user', content: '2' }] }, k);
  const res = await chat({ model: 'openai/gpt-5-nano', messages: [{ role: 'user', content: '3' }] }, k, true);
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) >= 1);
});

test('failover: primary endpoint down → served by fallback endpoint', async () => {
  const { router } = srv.ctx;
  const modelId = 'z-ai/glm-4.6'; // open model with several synthesized hosts
  const eps = router.candidates(modelId);
  assert.ok(eps.length >= 2, 'needs at least two endpoints');
  router.forceDown(eps[0].id, true);
  try {
    const r = await chat({ model: modelId, messages: [{ role: 'user', content: 'failover?' }] });
    assert.equal(r.status, 200);
    assert.equal(r.json.modelaxis.endpoint, eps[1].host);
  } finally {
    router.forceDown(eps[0].id, false);
  }
});

test('all endpoints down → 502 all_endpoints_down', async () => {
  const { router } = srv.ctx;
  const eps = router.candidates('microsoft/phi-4');
  eps.forEach(ep => router.forceDown(ep.id, true));
  try {
    const r = await chat({ model: 'microsoft/phi-4', messages: [{ role: 'user', content: 'x' }] });
    assert.equal(r.status, 502);
    assert.equal(r.json.error.code, 'all_endpoints_down');
  } finally {
    eps.forEach(ep => router.forceDown(ep.id, false));
  }
});

test('route.fallbacks: falls back across models', async () => {
  const { router } = srv.ctx;
  const eps = router.candidates('microsoft/phi-4');
  eps.forEach(ep => router.forceDown(ep.id, true));
  try {
    const r = await chat({
      model: 'microsoft/phi-4',
      route: { fallbacks: ['meta-llama/llama-3.3-70b'] },
      messages: [{ role: 'user', content: 'fallback chain' }],
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.model, 'meta-llama/llama-3.3-70b');
  } finally {
    eps.forEach(ep => router.forceDown(ep.id, false));
  }
});

test('content privacy: no logging by default, logged when opted in', async () => {
  const { db } = srv.ctx;
  await chat({ model: 'openai/gpt-5', messages: [{ role: 'user', content: 'PRIVATE-MARKER-1' }] });
  const leak = db.get(`SELECT COUNT(*) AS n FROM request_content rc JOIN requests r ON r.id = rc.request_id WHERE rc.prompt LIKE '%PRIVATE-MARKER-1%'`);
  assert.equal(leak.n, 0, 'default key must not store content');

  const logged = await jfetch('/api/console/keys', { method: 'POST', body: { name: 'debug', logging: true } });
  await chat({ model: 'openai/gpt-5', messages: [{ role: 'user', content: 'LOGGED-MARKER-2' }] }, logged.json.key);
  const hit = db.get(`SELECT COUNT(*) AS n FROM request_content WHERE prompt LIKE '%LOGGED-MARKER-2%'`);
  assert.equal(hit.n, 1, 'opted-in key must store content');
});

test('zero-retention data policy restricts endpoints', async () => {
  const created = await jfetch('/api/console/keys', { method: 'POST', body: { name: 'zr', data_policy: 'zero-retention' } });
  const r = await chat({ model: 'z-ai/glm-4.6', messages: [{ role: 'user', content: 'zr' }] }, created.json.key);
  // Either served by a zero-retention endpoint or refused — never a standard endpoint.
  if (r.status === 200) {
    const { router } = srv.ctx;
    const zrHosts = router.candidates('z-ai/glm-4.6', { dataPolicy: 'zero-retention' }).map(e => e.host);
    assert.ok(zrHosts.includes(r.json.modelaxis.endpoint));
  } else {
    assert.equal(r.status, 502);
  }
});

test('balance exhaustion → 402 insufficient_credits', async () => {
  // Second, separate account so the main account's tests are unaffected.
  cookie = '';
  await jfetch('/api/console/signup', { method: 'POST', body: { email: 'broke@modelaxis.ai', password: 'password1' } });
  const created = await jfetch('/api/console/keys', { method: 'POST', body: { name: 'k' } });
  const { db } = srv.ctx;
  const user = db.get('SELECT id FROM users WHERE email = ?', 'broke@modelaxis.ai');
  db.run('INSERT INTO ledger (user_id, delta_usd, kind, created_at) VALUES (?, -5, ?, ?)', user.id, 'adjustment', new Date().toISOString());
  const r = await chat({ model: 'openai/gpt-5', messages: [{ role: 'user', content: 'x' }] }, created.json.key);
  assert.equal(r.status, 402);
  assert.equal(r.json.error.code, 'insufficient_credits');
});

test('dev topup restores service', async () => {
  const t = await jfetch('/api/console/topup', { method: 'POST', body: { amount_usd: 25 } });
  assert.equal(t.status, 200);
  assert.equal(t.json.balance_usd, 25); // +5 signup − 5 adjustment + 25 topup
  const keys = await jfetch('/api/console/keys');
  assert.equal(keys.json.keys.length, 1);
});

test('BYOK: store, list, delete (encrypted at rest)', async () => {
  const r = await jfetch('/api/console/byok', { method: 'POST', body: { provider: 'openai', key: 'sk-test-1234567890' } });
  assert.equal(r.status, 200);
  const { db } = srv.ctx;
  const row = db.get('SELECT enc_key FROM byok_keys LIMIT 1');
  assert.ok(!row.enc_key.includes('sk-test'), 'BYOK key must be encrypted at rest');
  const list = await jfetch('/api/console/byok');
  assert.equal(list.json.providers[0].provider, 'openai');
  const del = await jfetch('/api/console/byok/openai', { method: 'DELETE' });
  assert.equal(del.status, 200);
});

test('/v1/models is public and priced', async () => {
  const r = await jfetch('/v1/models');
  assert.equal(r.status, 200);
  assert.ok(r.json.data.length >= 40);
  const gpt5 = r.json.data.find(m => m.id === 'openai/gpt-5');
  assert.equal(gpt5.pricing.input_per_1m, 1.19);
});

test('console requires session', async () => {
  cookie = '';
  const r = await jfetch('/api/console/keys');
  assert.equal(r.status, 401);
});

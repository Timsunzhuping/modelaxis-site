// Public OpenAI-compatible API: /v1/chat/completions, /v1/models.
import { randomBytes } from 'node:crypto';
import { MODELS, byId, costOf, endpointsFor } from './catalog.mjs';
import { apiKeyAuth } from './auth.mjs';
import { checkFunds, recordUsage } from './billing.mjs';
import { checkRate } from './ratelimit.mjs';

const err = (res, status, code, message) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: {
      message,
      type: status === 429 ? 'rate_limit_error' : status >= 500 ? 'api_error' : 'invalid_request_error',
      code,
    },
  }));
};

const textOf = messages => (messages || [])
  .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');

export function handleModels(ctx, req, res) {
  const data = MODELS.map(m => ({
    id: m.id,
    object: 'model',
    owned_by: m.provider,
    created: Math.floor(new Date(m.released + '-01').getTime() / 1000),
    context_length: m.ctx,
    max_output_tokens: m.maxOut,
    modality: m.modality,
    open_weights: m.open,
    pricing: { input_per_1m: m.in, output_per_1m: m.out, currency: 'USD' },
    endpoints: endpointsFor(m, ctx.cfg).length,
  }));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ object: 'list', data }));
}

export async function handleChatCompletions(ctx, req, res, body) {
  const { db, cfg, router } = ctx;

  const auth = apiKeyAuth(db, req);
  if (auth.error) return err(res, 401, 'invalid_api_key', 'Missing or invalid API key. Pass "Authorization: Bearer mx-sk-…".');
  const key = auth.key;

  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return err(res, 400, 'invalid_request', '"messages" must be a non-empty array.');
  }

  const rate = checkRate(key.id, key.rpm || cfg.defaultRpm);
  if (rate.limited) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(rate.retryAfter) });
    return res.end(JSON.stringify({ error: { message: `Key rate limit of ${key.rpm} RPM exceeded — retry in ${rate.retryAfter}s.`, type: 'rate_limit_error', code: 'rate_limited' } }));
  }

  const funds = checkFunds(db, key);
  if (funds) return err(res, funds.status, funds.code, funds.message);

  let planned;
  try { planned = router.plan(body, key); }
  catch (e) { return err(res, e.status || 400, e.code || 'invalid_request', e.message); }

  const { modelId, chain } = planned;
  const model = byId.get(modelId);
  const reqId = 'chatcmpl-' + randomBytes(10).toString('hex');
  const started = Date.now();
  const logging = key.logging === 1;
  const promptLog = logging ? textOf(body.messages).slice(0, 20000) : null;

  const recordError = (status, message) => recordUsage(db, {
    key, model: modelId, endpoint: null, tokensIn: 0, tokensOut: 0, costUsd: 0,
    latencyMs: Date.now() - started, ttftMs: null, status, error: message, stream: body.stream === true,
  });

  // ---------------------------------------------------------- non-stream --
  if (body.stream !== true) {
    try {
      const { ep, result } = await router.execute(chain, (endpoint, adapter, c) =>
        adapter.chatOnce(endpoint, body, { apiKey: c.apiKey }));
      const latency = Date.now() - started;
      const cost = costOf(model, result.tokensIn, result.tokensOut, ep);
      recordUsage(db, {
        key, model: ep.model, endpoint: ep, tokensIn: result.tokensIn, tokensOut: result.tokensOut,
        costUsd: cost, latencyMs: latency, ttftMs: latency, status: 200, stream: false,
        prompt: promptLog, completion: logging ? result.content.slice(0, 20000) : null,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: reqId, object: 'chat.completion', created: Math.floor(started / 1000), model: ep.model,
        choices: [{ index: 0, message: { role: 'assistant', content: result.content }, finish_reason: result.finishReason }],
        usage: { prompt_tokens: result.tokensIn, completion_tokens: result.tokensOut, total_tokens: result.tokensIn + result.tokensOut },
        modelaxis: { endpoint: ep.host, region: ep.region, cost_usd: Number(cost.toFixed(8)), latency_ms: latency },
      }));
    } catch (e) {
      const status = e.status || 500;
      recordError(status, e.message);
      err(res, status, e.code || 'api_error', e.message);
    }
    return;
  }

  // -------------------------------------------------------------- stream --
  // Endpoint selection pulls the FIRST delta inside router.execute, so a dead
  // endpoint fails over before any bytes reach the client. After first token,
  // the stream is committed to that endpoint.
  let picked;
  try {
    picked = await router.execute(chain, async (endpoint, adapter, c) => {
      const gen = adapter.chatStream(endpoint, body, { apiKey: c.apiKey });
      const first = await gen.next();
      return { gen, first };
    });
  } catch (e) {
    const status = e.status || 500;
    recordError(status, e.message);
    return err(res, status, e.code || 'api_error', e.message);
  }

  const { ep, result: { gen, first } } = picked;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = obj => res.write('data: ' + JSON.stringify(obj) + '\n\n');
  const chunk = (delta, finish = null, extra = {}) => ({
    id: reqId, object: 'chat.completion.chunk', created: Math.floor(started / 1000), model: ep.model,
    choices: [{ index: 0, delta, finish_reason: finish }], ...extra,
  });
  send(chunk({ role: 'assistant', content: '' }));

  let ttft = null, completion = '';
  let final = { tokensIn: 0, tokensOut: 0, finishReason: 'stop' };
  const emit = delta => {
    if (ttft == null) ttft = Date.now() - started;
    completion += delta;
    send(chunk({ content: delta }));
  };

  let streamError = null;
  try {
    if (first.done) final = first.value || final;
    else {
      if (first.value?.delta) emit(first.value.delta);
      for (;;) {
        const n = await gen.next();
        if (n.done) { final = n.value || final; break; }
        if (n.value?.delta) emit(n.value.delta);
      }
    }
  } catch (e) {
    streamError = e.message;
    final.tokensOut = Math.max(final.tokensOut, Math.ceil(completion.length / 4));
    final.finishReason = 'error';
  }

  const latency = Date.now() - started;
  const tokensIn = final.tokensIn || Math.ceil(textOf(body.messages).length / 4);
  const tokensOut = final.tokensOut || Math.max(1, Math.ceil(completion.length / 4));
  const cost = costOf(model, tokensIn, tokensOut, ep);
  recordUsage(db, {
    key, model: ep.model, endpoint: ep, tokensIn, tokensOut, costUsd: cost,
    latencyMs: latency, ttftMs: ttft, status: streamError ? 502 : 200, error: streamError, stream: true,
    prompt: promptLog, completion: logging ? completion.slice(0, 20000) : null,
  });

  send(chunk({}, final.finishReason, {
    usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut, total_tokens: tokensIn + tokensOut },
    modelaxis: { endpoint: ep.host, region: ep.region, cost_usd: Number(cost.toFixed(8)), latency_ms: latency, ttft_ms: ttft },
  }));
  res.write('data: [DONE]\n\n');
  res.end();
}

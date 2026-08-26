// Routing engine: endpoint selection by price/latency + health, fallback
// chains across models, upstream failure cooldowns.
import { byId, endpointsFor, resolveAuto } from './catalog.mjs';
import { ADAPTERS, UpstreamError, ClientError } from './providers.mjs';

const COOLDOWN_MS = 30_000;

export function createRouter(cfg) {
  // endpoint id -> { failCount, downUntil } ; test hooks can force endpoints down.
  const health = new Map();
  const state = ep => {
    let s = health.get(ep.id);
    if (!s) { s = { failCount: 0, downUntil: 0, forced: false }; health.set(ep.id, s); }
    return s;
  };
  const healthy = ep => { const s = state(ep); return !s.forced && Date.now() >= s.downUntil; };
  const markFailure = ep => {
    const s = state(ep);
    s.failCount += 1;
    s.downUntil = Date.now() + COOLDOWN_MS * Math.min(4, s.failCount);
  };
  const markSuccess = ep => { const s = state(ep); s.failCount = 0; s.downUntil = 0; };

  function candidates(modelId, { sort = 'price', dataPolicy = 'standard' } = {}) {
    let eps = endpointsFor(modelId, cfg);
    if (dataPolicy === 'zero-retention') eps = eps.filter(e => e.dataPolicy === 'zero-retention');
    if (sort === 'latency') eps = eps.slice().sort((a, b) => a.ttftEst - b.ttftEst);
    return eps;
  }

  // Resolve model id (handling modelaxis/auto) and build the ordered endpoint
  // chain including route.fallbacks.
  function plan(body, key) {
    let modelId = body.model;
    if (!modelId) throw new ClientError('missing "model"');
    if (modelId === 'modelaxis/auto') {
      modelId = resolveAuto(body, cfg);
      if (!modelId) throw new ClientError('no models available for auto routing', 502, 'all_endpoints_down');
    }
    if (!byId.has(modelId)) throw new ClientError(`unknown model "${modelId}" — list ids with GET /v1/models`, 400, 'invalid_request');

    const allow = key.allow_models ? JSON.parse(key.allow_models) : null;
    const route = body.route || {};
    const opts = {
      sort: route.sort === 'latency' ? 'latency' : 'price',
      dataPolicy: route.data_policy === 'zero-retention' || key.data_policy === 'zero-retention' ? 'zero-retention' : 'standard',
    };
    const chainModels = [modelId, ...(Array.isArray(route.fallbacks) ? route.fallbacks.filter(id => byId.has(id)) : [])];
    for (const id of chainModels) {
      if (allow && !allow.includes(id)) {
        throw new ClientError(`model "${id}" is not on this key's allowlist`, 403, 'model_not_allowed');
      }
    }
    const chain = [];
    for (const id of chainModels) chain.push(...candidates(id, opts));
    return { modelId, chain, opts };
  }

  // Walk the chain until an endpoint succeeds. `run` invokes the adapter for
  // one endpoint; upstream errors advance the chain, client errors bubble up.
  async function execute(chain, run) {
    let lastErr = null;
    for (const ep of chain) {
      if (!healthy(ep)) continue;
      const adapter = ADAPTERS[ep.protocol];
      const apiKey = ep.protocol === 'mock' ? 'mock' : cfg.providerKeys[ep.keyName];
      try {
        const result = await run(ep, adapter, { apiKey });
        markSuccess(ep);
        return { ep, result };
      } catch (e) {
        if (e instanceof ClientError) throw e;
        markFailure(ep);
        lastErr = e;
      }
    }
    throw new ClientError(
      lastErr ? `all endpoints failed (last: ${lastErr.message})` : 'no healthy endpoint for this model',
      502, 'all_endpoints_down');
  }

  return {
    plan, execute, candidates,
    // introspection + test hooks
    endpointHealth: id => health.get(id) || { failCount: 0, downUntil: 0, forced: false },
    forceDown: (id, on = true) => { const s = state({ id }); s.forced = on; },
    snapshot: () => Object.fromEntries([...health].map(([k, v]) => [k, { ...v }])),
  };
}

export { UpstreamError, ClientError };

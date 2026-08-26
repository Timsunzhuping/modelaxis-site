// Model catalog: single source of truth is assets/js/models-data.js (shared with the site).
// This module loads it in Node and derives the routable endpoint table.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

const win = {};
new Function('window', readFileSync(join(ROOT, 'assets/js/models-data.js'), 'utf8'))(win);

export const MODELS = win.MX_MODELS;
export const HOSTS = win.MX_HOSTS;
export const FMT = win.MX_FMT;

export const byId = new Map(MODELS.map(m => [m.id, m]));

// Which first-party API protocol serves each closed-model provider,
// and which env key + base URL + upstream model id to use.
const FIRST_PARTY = {
  OpenAI:      { protocol: 'openai',    keyName: 'openai',    baseUrl: 'https://api.openai.com/v1' },
  Anthropic:   { protocol: 'anthropic', keyName: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  Google:      { protocol: 'google',    keyName: 'google',    baseUrl: 'https://generativelanguage.googleapis.com' },
  DeepSeek:    { protocol: 'openai',    keyName: 'deepseek',  baseUrl: 'https://api.deepseek.com/v1' },
  xAI:         { protocol: 'openai',    keyName: 'xai',       baseUrl: 'https://api.x.ai/v1' },
  'Moonshot AI': { protocol: 'openai',  keyName: 'moonshot',  baseUrl: 'https://api.moonshot.ai/v1' },
  Mistral:     { protocol: 'openai',    keyName: 'mistral',   baseUrl: 'https://api.mistral.ai/v1' },
};

// Upstream model ids where they differ from our catalog slug.
const UPSTREAM_ID = {
  'openai/gpt-5': 'gpt-5',
  'openai/gpt-5-mini': 'gpt-5-mini',
  'openai/gpt-5-nano': 'gpt-5-nano',
  'openai/gpt-4.1': 'gpt-4.1',
  'openai/o3': 'o3',
  'anthropic/claude-opus-4.1': 'claude-opus-4-1',
  'anthropic/claude-sonnet-4.5': 'claude-sonnet-4-5',
  'anthropic/claude-haiku-4.5': 'claude-haiku-4-5',
  'google/gemini-2.5-pro': 'gemini-2.5-pro',
  'google/gemini-2.5-flash': 'gemini-2.5-flash',
  'google/gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
  'deepseek/deepseek-v3.2': 'deepseek-chat',
  'deepseek/deepseek-r1-0528': 'deepseek-reasoner',
  'x-ai/grok-4': 'grok-4',
  'x-ai/grok-4-fast': 'grok-4-fast',
  'x-ai/grok-code-fast-1': 'grok-code-fast-1',
  'moonshotai/kimi-k2': 'kimi-k2-0711-preview',
  'moonshotai/kimi-k2-thinking': 'kimi-k2-thinking',
  'mistralai/mistral-medium-3': 'mistral-medium-latest',
  'mistralai/magistral-medium': 'magistral-medium-latest',
  'mistralai/codestral-2508': 'codestral-latest',
};

// Deterministic endpoint synthesis — mirrors the site's model-page logic so
// the numbers users see on the site match what the router reports.
export function endpointsFor(model, cfg) {
  const m = typeof model === 'string' ? byId.get(model) : model;
  if (!m) return [];
  const h = FMT.hash(m.id);
  const eps = [];
  if (m.open) {
    const n = 3 + (h % 2);
    for (let i = 0; i < n; i++) {
      const host = HOSTS[(h + i * 3) % HOSTS.length];
      const v = 1 + (((h >> (i * 4)) % 13) - 6) / 40;
      const lv = 1 + (((h >> (i * 3)) % 11) - 5) / 25;
      eps.push({
        id: m.id + '@' + host.toLowerCase(),
        model: m.id, host, region: ['us-east', 'us-west', 'eu-central', 'ap-southeast'][(h + i) % 4],
        priceIn: m.in * v, priceOut: m.out * v,
        ttftEst: Math.round(m.latency * lv), tps: Math.round(m.tps / lv),
        protocol: 'mock', upstreamId: m.id, dataPolicy: (h + i) % 3 === 0 ? 'zero-retention' : 'standard',
      });
    }
  } else {
    const fp = FIRST_PARTY[m.provider];
    [['us-east', 1], ['eu-central', 1.12], ['ap-southeast', 1.22]].forEach(([region, lv]) => {
      eps.push({
        id: m.id + '@axis-' + region,
        model: m.id, host: m.provider + ' · axis edge', region,
        priceIn: m.in, priceOut: m.out,
        ttftEst: Math.round(m.latency * lv), tps: m.tps,
        protocol: fp ? fp.protocol : 'mock',
        baseUrl: fp?.baseUrl, keyName: fp?.keyName,
        upstreamId: UPSTREAM_ID[m.id] || m.id.split('/')[1],
        dataPolicy: 'zero-retention',
      });
    });
  }
  // Availability: mock mode serves everything via the mock adapter; real mode
  // requires a configured provider key (open models stay on mock's host sim).
  for (const ep of eps) {
    if (cfg.mockOnly || ep.protocol === 'mock') { ep.protocol = 'mock'; ep.available = true; }
    else ep.available = Boolean(cfg.providerKeys[ep.keyName]);
  }
  return eps.filter(ep => ep.available).sort((a, b) => (3 * a.priceIn + a.priceOut) - (3 * b.priceIn + b.priceOut));
}

// The pool `modelaxis/auto` chooses from, cheapest-first within a tier.
export const AUTO_POOL = {
  light: ['google/gemini-2.5-flash-lite', 'openai/gpt-5-nano', 'amazon/nova-lite', 'meta-llama/llama-3.3-70b'],
  standard: ['deepseek/deepseek-v3.2', 'google/gemini-2.5-flash', 'openai/gpt-5-mini', 'anthropic/claude-haiku-4.5'],
};

export function resolveAuto(req, cfg) {
  const chars = JSON.stringify(req.messages || []).length;
  const pool = chars < 2000 ? AUTO_POOL.light : AUTO_POOL.standard;
  for (const id of pool) if (endpointsFor(id, cfg).length) return id;
  for (const m of MODELS) if (endpointsFor(m.id, cfg).length) return m.id;
  return null;
}

export function estimateTokens(text) {
  return Math.max(1, Math.ceil((text || '').length / 4));
}

export function costOf(model, tokensIn, tokensOut, ep) {
  const pIn = ep?.priceIn ?? model.in, pOut = ep?.priceOut ?? model.out;
  return (tokensIn * pIn + tokensOut * pOut) / 1e6;
}

# ModelAxis — www.modelaxis.ai

The global model API exchange: 400+ models behind one OpenAI-compatible API at
wholesale prices. This repo contains the complete platform:

- **Site** — marketing pages, model catalog, rankings, docs, status, playground
  (static, "Barcode Globe" visual system: cobalt #3355FF × aurora #14B88A,
  Sora / Noto Sans / JetBrains Mono, everything-is-bars).
- **Platform server** (`server/`) — API gateway, accounts, API keys, billing,
  routing engine, and the web console. **Zero npm dependencies**: Node built-ins
  only (`node:http`, `node:sqlite`, `node:crypto`). Requires Node ≥ 22.

## Run the platform

```bash
node build.mjs            # build the site to dist/
node server/index.mjs     # http://localhost:8787 — site + console + API
```

With no provider keys configured the gateway runs in **mock mode**: every model
is served by a deterministic simulator, so auth, billing, routing, failover,
and streaming are fully testable offline. Add real keys to route upstream:

```bash
OPENAI_API_KEY=… ANTHROPIC_API_KEY=… GEMINI_API_KEY=… DEEPSEEK_API_KEY=… \
XAI_API_KEY=… MOONSHOT_API_KEY=… MISTRAL_API_KEY=… node server/index.mjs
```

| Env var | Default | Meaning |
|---|---|---|
| `MX_PORT` | `8787` | listen port |
| `MX_DATA_DIR` | `./data` | SQLite database + generated secret |
| `MX_SECRET` | generated | session signing + BYOK encryption key |
| `MX_MOCK_ONLY` | auto | `1` forces mock routing even with keys |
| `MX_SIGNUP_CREDIT_USD` | `5` | free credits on signup |
| `MX_DEV_TOPUP` | auto | `1` = instant no-payment topups (dev) |
| `STRIPE_SECRET_KEY` | — | disables dev topups (checkout flow TODO) |

### API surface

- `POST /v1/chat/completions` — OpenAI-compatible, streaming SSE, `modelaxis/auto`
  routing, `route.fallbacks`, `route.sort` (price/latency), `route.data_policy`.
- `GET /v1/models` — catalog with live pricing.
- `/console/` — sign up, API keys (budgets, RPM, allowlists, zero-retention,
  opt-in logging), usage charts, request log, dev topups, BYOK (encrypted at rest).
- `GET /api/status`, `GET /healthz` — health.

### Tests

```bash
node --test server/test/platform.test.mjs   # 22 end-to-end tests, mock mode
```

### Docker

```bash
docker build -t modelaxis .
docker run -p 8787:8787 -v mx-data:/app/data modelaxis
```

## Static site only (GitHub Pages)

```bash
node build.mjs docs       # build to docs/, then commit + push
```

GitHub Pages serves `docs/` (via `.github/workflows/pages.yml`). The console and
playground work on a static host too — set the platform API URL under
"API server" on the console sign-in page (stored in localStorage).

Custom domain: point a DNS CNAME `www -> <owner>.github.io`, then set
`www.modelaxis.ai` in the repo's Pages settings. The API should live on its own
host (e.g. `api.modelaxis.ai`) running `server/index.mjs`.

## Editing the model catalog

All model prices, context windows, and latency figures live in one file:
`assets/js/models-data.js`. The site (directory, model pages, rankings, board,
search) **and** the gateway (routing, billing) read from it — edit and rebuild.

// ModelAxis platform server — API gateway + console + static site.
// Zero external dependencies: node:http, node:sqlite, node:crypto.
//
//   node server/index.mjs            # http://localhost:8787
//   MX_PORT=9000 OPENAI_API_KEY=…    # real upstream routing when keys are set
//
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { openDb } from './db.mjs';
import { createRouter } from './router.mjs';
import { handleModels, handleChatCompletions } from './gateway.mjs';
import { consoleRoutes } from './console-api.mjs';
import { MODELS } from './catalog.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain',
  '.xml': 'application/xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

export function startServer(overrides = {}) {
  const cfg = loadConfig(overrides);
  const db = openDb(cfg.dbFile);
  const router = createRouter(cfg);
  const ctx = { cfg, db, router, startedAt: Date.now() };
  const routes = consoleRoutes(ctx);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    const t0 = Date.now();
    res.on('finish', () => {
      if (cfg.logRequests) console.log(`${new Date().toISOString()} ${req.method} ${path} ${res.statusCode} ${Date.now() - t0}ms`);
    });

    // CORS for the public API + console (site may be hosted on another origin).
    const origin = req.headers.origin;
    if (path.startsWith('/v1/') || path.startsWith('/api/')) {
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    }

    try {
      // ---- public API ----
      if (path === '/v1/models' && req.method === 'GET') return handleModels(ctx, req, res);
      if (path === '/v1/chat/completions' && req.method === 'POST') {
        const body = await readBody(req).catch(e => ({ __err: e.message }));
        if (body?.__err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: { message: body.__err, type: 'invalid_request_error', code: 'invalid_request' } }));
        }
        return await handleChatCompletions(ctx, req, res, body);
      }

      // ---- platform status ----
      if (path === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          status: 'operational',
          uptime_s: Math.floor((Date.now() - ctx.startedAt) / 1000),
          mock_only: cfg.mockOnly,
          models: MODELS.length,
          endpoints_health: router.snapshot(),
        }));
      }
      if (path === '/healthz') { res.writeHead(200); return res.end('ok'); }

      // ---- console API ----
      const routeKey = Object.keys(routes).find(k => {
        const [method, pattern] = k.split(' ');
        if (method !== req.method) return false;
        const re = new RegExp('^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$');
        return re.test(path);
      });
      if (routeKey) {
        const [, pattern] = routeKey.split(' ');
        const names = [...pattern.matchAll(/:([^/]+)/g)].map(m => m[1]);
        const values = path.match(new RegExp('^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$')).slice(1);
        const params = Object.fromEntries(names.map((n, i) => [n, values[i]]));
        const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req).catch(() => null) : null;
        return await routes[routeKey](req, res, body, params, url.searchParams);
      }

      // ---- static site (built dist/) ----
      if (req.method === 'GET' && existsSync(cfg.siteDir)) {
        let filePath = normalize(join(cfg.siteDir, path)).replace(/\\/g, '/');
        if (!filePath.startsWith(normalize(cfg.siteDir))) { res.writeHead(403); return res.end(); }
        if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
        if (!existsSync(filePath)) {
          const notFound = join(cfg.siteDir, '404.html');
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(existsSync(notFound) ? readFileSync(notFound) : 'Not found');
        }
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
        return res.end(readFileSync(filePath));
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'route not found', type: 'invalid_request_error', code: 'route_not_found' } }));
    } catch (e) {
      console.error('unhandled:', e);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'internal error', type: 'api_error', code: 'internal' } }));
      } else res.end();
    }
  });

  return new Promise(resolve => {
    server.listen(overrides.port ?? cfg.port, cfg.host, () => {
      const { port } = server.address();
      if (cfg.logRequests) {
        console.log(`modelaxis platform on http://localhost:${port}  (mock_only=${cfg.mockOnly}, db=${cfg.dbFile})`);
      }
      resolve({
        port, server, ctx,
        close: () => new Promise(r => { db.close(); server.close(r); }),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();

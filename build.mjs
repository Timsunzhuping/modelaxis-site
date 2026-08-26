// ModelAxis static site builder — zero dependencies.
// Usage: node build.mjs
// Reads src/**/*.html, injects partials/<name>.html at <!--#name key="val" --> markers,
// resolves {{ROOT}} to the page's relative path prefix, copies assets/ into dist/.

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('./src/', import.meta.url));
const DIST = fileURLToPath(new URL('./' + (process.argv[2] || 'dist') + '/', import.meta.url));
const PARTIALS = fileURLToPath(new URL('./partials/', import.meta.url));
const ASSETS = fileURLToPath(new URL('./assets/', import.meta.url));

const partialCache = {};
function partial(name) {
  if (!partialCache[name]) partialCache[name] = readFileSync(join(PARTIALS, name + '.html'), 'utf8');
  return partialCache[name];
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

function render(source, root, attrs = {}) {
  let out = source.replace(/<!--#([\w-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->/g, (_, name, attrStr) => {
    const localAttrs = { ...attrs };
    for (const m of attrStr.matchAll(/([\w-]+)="([^"]*)"/g)) localAttrs[m[1]] = m[2];
    return render(partial(name), root, localAttrs);
  });
  out = out.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (_, key, fallback) => {
    if (key === 'ROOT') return root;
    if (key in attrs) return attrs[key];
    return fallback ?? '';
  });
  return out;
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

let pages = 0;
for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  const dest = join(DIST, rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (!file.endsWith('.html')) { cpSync(file, dest); continue; }
  const depth = rel.split(sep).length - 1;
  const root = depth === 0 ? './' : '../'.repeat(depth);
  writeFileSync(dest, render(readFileSync(file, 'utf8'), root));
  pages++;
}

cpSync(ASSETS, join(DIST, 'assets'), { recursive: true });
console.log(`built ${pages} pages -> dist/`);

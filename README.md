# ModelAxis — www.modelaxis.ai

Marketing and platform site for ModelAxis, the global model API exchange.
Static site, zero dependencies, built from the "Barcode Globe" visual system
(cobalt #3355FF × aurora #14B88A, Sora / Noto Sans / JetBrains Mono, everything-is-bars).

## Structure

```
src/        pages (HTML with <!--#partial --> markers)
partials/   shared head / nav / footer
assets/     css, js, model catalog data (assets/js/models-data.js), images
build.mjs   zero-dependency static builder
docs/       build output served by GitHub Pages (do not edit by hand)
```

## Develop

```bash
node build.mjs            # build to dist/
python3 -m http.server 4173 -d dist
```

## Deploy

```bash
node build.mjs docs       # build to docs/
git add -A && git commit -m "update site" && git push
```

GitHub Pages serves `main:/docs`. The `docs/CNAME` file pins the custom domain
`www.modelaxis.ai` (requires a DNS CNAME record `www -> <owner>.github.io`).

## Editing the model catalog

All model prices, context windows, and latency figures live in
`assets/js/models-data.js`. Edit that one file and rebuild — the models
directory, model pages, rankings, homepage board, and search all read from it.

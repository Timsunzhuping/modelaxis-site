// Model detail page: renders one model from ?id=.
(function () {
  const M = window.MX_MODELS, F = window.MX_FMT, HOSTS = window.MX_HOSTS;
  const id = new URLSearchParams(location.search).get('id');
  const m = M.find(x => x.id === id) || M[0];

  document.title = m.name + ' — ModelAxis';
  document.getElementById('crumb').textContent = m.id;
  document.getElementById('m-name').textContent = m.name;
  document.getElementById('m-desc').textContent = m.desc;
  document.getElementById('m-try').href = '../chat/?model=' + encodeURIComponent(m.id);

  const badges = document.getElementById('m-badges');
  badges.innerHTML =
    '<span class="badge">' + m.provider + '</span>' +
    (m.new ? '<span class="badge badge-new">NEW</span>' : '') +
    (m.open ? '<span class="badge">OPEN WEIGHTS</span>' : '') +
    (m.reasoning ? '<span class="badge">REASONING</span>' : '') +
    (m.modality !== 'text' ? '<span class="badge">' + (m.modality === 'omni' ? 'OMNI' : 'VISION') + '</span>' : '') +
    (m.listIn ? '<span class="badge badge-online"><span class="dot"></span>BELOW LIST</span>' : '') +
    '<span class="mono" style="font-size:11px; color:var(--ink-40)">' + m.id + '</span>';

  // spec grid
  const strike = (axis, list) => list
    ? F.price(axis) + ' <s style="color:var(--ink-40); font-size:11px">' + F.price(list) + '</s>'
    : F.price(axis);
  document.getElementById('m-kv').innerHTML = [
    ['Input $/1M', strike(m.in, m.listIn)],
    ['Output $/1M', strike(m.out, m.listOut)],
    ['Context', F.ctx(m.ctx)],
    ['Max output', F.ctx(m.maxOut)],
    ['First token p50', m.latency + 'ms'],
    ['Throughput', m.tps + ' tok/s'],
    ['Released', m.released],
    ['License', m.open ? 'Open weights' : 'Proprietary'],
  ].map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');

  // endpoints — deterministic synthesis from the model id
  const h = F.hash(m.id);
  const eps = [];
  if (m.open) {
    const n = 3 + (h % 2);
    for (let i = 0; i < n; i++) {
      const host = HOSTS[(h + i * 3) % HOSTS.length];
      const v = 1 + (((h >> (i * 4)) % 13) - 6) / 40; // ±15% price variance
      const lv = 1 + (((h >> (i * 3)) % 11) - 5) / 25;
      eps.push({
        name: host, region: ['us-east', 'us-west', 'eu-central', 'ap-southeast'][(h + i) % 4],
        in_: m.in * v, out: m.out * v, ttft: Math.round(m.latency * lv), tps: Math.round(m.tps / lv),
        up: (99.5 + ((h + i * 7) % 45) / 100).toFixed(2),
      });
    }
    eps.sort((a, b) => (3 * a.in_ + a.out) - (3 * b.in_ + b.out));
  } else {
    [['us-east', 1], ['eu-central', 1.12], ['ap-southeast', 1.22]].forEach(([region, lv], i) => {
      eps.push({
        name: m.provider + ' · axis edge', region,
        in_: m.in, out: m.out, ttft: Math.round(m.latency * lv), tps: m.tps,
        up: (99.9 + ((h + i * 11) % 9) / 100).toFixed(2),
      });
    });
  }
  document.querySelector('#ep-table tbody').innerHTML = eps.map((e, i) =>
    '<tr><td><span class="status-dot on" style="margin-right:8px"></span>' + e.name +
    (i === 0 ? ' <span class="badge badge-new" style="font-size:8.5px; padding:1px 5px">DEFAULT</span>' : '') + '</td>' +
    '<td class="mono" style="font-size:11px; color:var(--ink-70)">' + e.region + '</td>' +
    '<td class="num">' + F.price(e.in_) + '</td><td class="num">' + F.price(e.out) + '</td>' +
    '<td class="num">' + e.ttft + 'ms</td><td class="num">' + e.tps + ' t/s</td>' +
    '<td class="num" style="color:var(--aurora-deep)">' + e.up + '%</td></tr>'
  ).join('');

  // code samples
  document.querySelector('#code-python code').textContent =
    'from openai import OpenAI\n\n' +
    'client = OpenAI(\n' +
    '    base_url="https://api.modelaxis.ai/v1",\n' +
    '    api_key="mx-sk-…",\n' +
    ')\n\n' +
    'reply = client.chat.completions.create(\n' +
    '    model="' + m.id + '",\n' +
    '    messages=[{"role": "user", "content": "Hello, axis"}],\n' +
    ')';
  document.querySelector('#code-curl code').textContent =
    'curl https://api.modelaxis.ai/v1/chat/completions \\\n' +
    '  -H "Authorization: Bearer mx-sk-…" \\\n' +
    '  -H "Content-Type: application/json" \\\n' +
    '  -d \'{"model": "' + m.id + '",\n' +
    '       "messages": [{"role": "user", "content": "Hello, axis"}]}\'';

  // related: same provider first, then nearest blended price
  const blend = x => 3 * x.in + x.out;
  const related = M.filter(x => x.id !== m.id)
    .sort((a, b) =>
      (b.provider === m.provider) - (a.provider === m.provider) ||
      Math.abs(blend(a) - blend(m)) - Math.abs(blend(b) - blend(m)))
    .slice(0, 4);
  document.getElementById('related').innerHTML = related.map(r =>
    '<a class="card" href="model.html?id=' + encodeURIComponent(r.id) + '" style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px 18px; color:var(--ink)">' +
    '<span>' + r.name + '<span class="mono" style="display:block; font-size:10px; color:var(--ink-40)">' + r.provider + '</span></span>' +
    '<span class="mono" style="font-size:11px; color:var(--ink-70)">' + F.price(r.in) + ' / ' + F.price(r.out) + '</span></a>'
  ).join('');
})();

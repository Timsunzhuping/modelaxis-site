// Console dashboard.
(function () {
  const API = localStorage.getItem('MX_API_BASE') || '';
  const $ = id => document.getElementById(id);
  const money = v => '$' + Number(v).toFixed(v < 10 ? 4 : 2);
  const fmtInt = v => Number(v || 0).toLocaleString('en-US');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const call = async (path, opts = {}) => {
    const res = await fetch(API + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) { location.href = './'; throw new Error('unauthenticated'); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Error ' + res.status);
    return json;
  };

  // ---- overview / identity ----
  async function loadMe() {
    const me = await call('/api/console/me');
    $('who').textContent = me.email;
    $('ov-balance').textContent = money(me.balance_usd);
    $('ov-balance').style.color = me.balance_usd > 0 ? 'var(--aurora-deep)' : 'var(--alert)';
    $('mode-badge').hidden = !me.mock_only;
    $('topup-note').textContent = me.dev_topup ? 'Dev environment: credits are added instantly without payment.' : '';
  }

  // ---- usage ----
  async function loadUsage() {
    const u = await call('/api/console/usage?days=30');
    let requests = 0, tokens = 0, spend = 0;
    const byDay = new Map(u.daily.map(d => [d.day, d]));
    u.daily.forEach(d => { requests += d.requests; tokens += (d.tokens_in || 0) + (d.tokens_out || 0); spend += d.cost || 0; });
    $('ov-requests').textContent = fmtInt(requests);
    $('ov-tokens').textContent = fmtInt(tokens);
    $('ov-spend').textContent = money(spend);

    const days = [];
    for (let i = 29; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
    const max = Math.max(1e-9, ...days.map(d => byDay.get(d)?.cost || 0));
    $('usage-bars').innerHTML = days.map(d => {
      const cost = byDay.get(d)?.cost || 0;
      const h = cost > 0 ? Math.max(4, (cost / max) * 100) : 2;
      const cls = cost > 0 && cost === max ? ' class="b-cobalt"' : '';
      return `<i${cls} style="height:${h}%" title="${d} · ${money(cost)}"></i>`;
    }).join('');
    $('usage-from').textContent = days[0];
    $('usage-to').textContent = days[29];

    const maxCost = Math.max(1e-9, ...u.byModel.map(m => m.cost || 0));
    $('usage-models').innerHTML = u.byModel.map(m =>
      `<div style="display:grid; grid-template-columns:220px 1fr 90px; gap:14px; align-items:center; font-size:12.5px">
         <span class="mono" style="font-size:11px">${esc(m.model)}</span>
         <span class="meter" style="height:6px"><i class="fill" style="width:${(m.cost / maxCost) * 100}%"></i><i class="rest" style="flex:1"></i></span>
         <span class="mono" style="font-size:11px; text-align:right">${money(m.cost || 0)}</span>
       </div>`).join('') || '<span style="font-size:12.5px; color:var(--ink-40)">No usage yet — make your first API call below.</span>';
  }

  // ---- keys ----
  async function loadKeys() {
    const { keys } = await call('/api/console/keys');
    $('keys-table').querySelector('tbody').innerHTML = keys.map(k => `
      <tr style="${k.revoked ? 'opacity:.45' : ''}">
        <td>${esc(k.name)}${k.logging ? ' <span class="badge" style="font-size:8.5px; padding:1px 5px">LOGS</span>' : ''}</td>
        <td class="mono" style="font-size:11px; color:var(--ink-40)">${esc(k.prefix)}</td>
        <td class="num">${money(k.spent_usd || 0)}</td>
        <td class="num">${k.budget_usd != null ? money(k.budget_usd) : '—'}</td>
        <td class="num">${k.rpm}</td>
        <td style="font-size:11.5px; color:var(--ink-70)">${k.data_policy === 'zero-retention' ? 'zero-retention' : 'standard'}</td>
        <td class="mono" style="font-size:10.5px; color:var(--ink-40)">${k.created_at.slice(0, 10)}</td>
        <td class="num">${k.revoked ? '<span class="badge">REVOKED</span>' : `<button class="btn btn-secondary" data-revoke="${k.id}" style="padding:3px 10px; font-size:10.5px">Revoke</button>`}</td>
      </tr>`).join('') || '<tr><td colspan="8" style="text-align:center; color:var(--ink-40); padding:24px">No keys yet — create your first key above.</td></tr>';

    document.querySelectorAll('[data-revoke]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Revoke this key? Requests using it will fail immediately.')) return;
      await call('/api/console/keys/' + btn.dataset.revoke, { method: 'PATCH', body: { revoke: true } });
      loadKeys();
    }));
  }

  $('key-form').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await call('/api/console/keys', {
      method: 'POST',
      body: {
        name: $('key-name').value,
        budget_usd: $('key-budget').value || null,
        rpm: Number($('key-rpm').value) || 600,
        data_policy: $('key-policy').value,
        logging: $('key-logging').checked,
      },
    }).catch(err => { alert(err.message); return null; });
    if (!r) return;
    $('new-key').textContent = r.key;
    $('new-key-box').hidden = false;
    $('key-name').value = '';
    loadKeys(); renderQuickstart(r.key);
  });
  $('copy-key').addEventListener('click', () => {
    navigator.clipboard.writeText($('new-key').textContent);
    $('copy-key').textContent = 'Copied';
    setTimeout(() => { $('copy-key').textContent = 'Copy'; }, 1200);
  });

  // ---- requests ----
  async function loadRequests() {
    const { requests } = await call('/api/console/requests?limit=25');
    $('req-table').querySelector('tbody').innerHTML = requests.map(r => `
      <tr>
        <td class="mono" style="font-size:10.5px; color:var(--ink-40)">${r.created_at.slice(5, 19).replace('T', ' ')}</td>
        <td style="font-size:12.5px">${esc(r.model)}${r.stream ? ' <span class="badge" style="font-size:8px; padding:0 4px">SSE</span>' : ''}</td>
        <td style="font-size:11.5px; color:var(--ink-70)">${esc(r.endpoint || '—')} <span class="mono" style="font-size:9.5px; color:var(--ink-40)">${esc(r.region || '')}</span></td>
        <td class="num">${fmtInt(r.tokens_in)}</td>
        <td class="num">${fmtInt(r.tokens_out)}</td>
        <td class="num">${money(r.cost_usd || 0)}</td>
        <td class="num">${r.latency_ms != null ? r.latency_ms + 'ms' : '—'}</td>
        <td class="num" style="color:${r.status === 200 ? 'var(--aurora-deep)' : 'var(--alert)'}">${r.status}</td>
      </tr>`).join('') || '<tr><td colspan="8" style="text-align:center; color:var(--ink-40); padding:24px">No requests yet.</td></tr>';
  }

  // ---- topup ----
  $('topup-btn').addEventListener('click', async () => {
    const amount = Number($('topup-amount').value);
    try {
      await call('/api/console/topup', { method: 'POST', body: { amount_usd: amount } });
      await loadMe();
    } catch (e) { alert(e.message); }
  });

  // ---- byok ----
  async function loadByok() {
    const { providers } = await call('/api/console/byok');
    $('byok-list').innerHTML = providers.map(p =>
      `<span class="badge badge-online"><span class="dot"></span>${esc(p.provider)}
         <button data-byok-del="${esc(p.provider)}" style="background:none; border:0; cursor:pointer; color:inherit; font-family:inherit; font-size:10px">✕</button></span>`
    ).join('') || '<span style="font-size:12px; color:var(--ink-40)">No provider keys attached.</span>';
    document.querySelectorAll('[data-byok-del]').forEach(b => b.addEventListener('click', async () => {
      await call('/api/console/byok/' + b.dataset.byokDel, { method: 'DELETE' });
      loadByok();
    }));
  }
  $('byok-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await call('/api/console/byok', { method: 'POST', body: { provider: $('byok-provider').value, key: $('byok-key').value } });
      $('byok-key').value = '';
      loadByok();
    } catch (err) { alert(err.message); }
  });

  // ---- quickstart ----
  function renderQuickstart(key = 'mx-sk-…') {
    const base = API || location.origin;
    $('qs-code').querySelector('code').textContent =
      `curl ${base}/v1/chat/completions \\\n` +
      `  -H "Authorization: Bearer ${key}" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '{"model": "modelaxis/auto",\n` +
      `       "messages": [{"role": "user", "content": "Hello, axis"}]}'`;
  }

  // ---- logout ----
  $('logout').addEventListener('click', async () => {
    await call('/api/console/logout', { method: 'POST' }).catch(() => {});
    location.href = './';
  });

  renderQuickstart();
  loadMe().then(() => Promise.all([loadUsage(), loadKeys(), loadRequests(), loadByok()]))
    .catch(() => {});
})();

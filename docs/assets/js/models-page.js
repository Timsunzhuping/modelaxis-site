// Models directory: filter, sort, render.
(function () {
  const M = window.MX_MODELS, F = window.MX_FMT;
  const $q = document.getElementById('q');
  const $provider = document.getElementById('provider');
  const $sort = document.getElementById('sort');
  const $chips = document.getElementById('chips');
  const $tbody = document.querySelector('#model-table tbody');
  const $count = document.getElementById('count');
  let cat = '';

  // provider dropdown
  [...new Set(M.map(m => m.provider))].sort().forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    $provider.appendChild(opt);
  });

  // ?q= prefill
  const params = new URLSearchParams(location.search);
  if (params.get('q')) $q.value = params.get('q');

  const catFilters = {
    reasoning: m => m.reasoning,
    open: m => m.open,
    multimodal: m => m.modality !== 'text',
    long: m => m.ctx >= 1000000,
    cheap: m => m.out < 1,
  };
  const sorts = {
    share: (a, b) => b.share - a.share,
    'price-asc': (a, b) => (3 * a.in + a.out) - (3 * b.in + b.out),
    'price-desc': (a, b) => (3 * b.in + b.out) - (3 * a.in + a.out),
    latency: (a, b) => a.latency - b.latency,
    ctx: (a, b) => b.ctx - a.ctx,
    new: (a, b) => b.released.localeCompare(a.released),
  };

  function render() {
    const q = $q.value.trim().toLowerCase();
    let list = M.filter(m =>
      (!q || (m.id + ' ' + m.name + ' ' + m.provider + ' ' + m.desc).toLowerCase().includes(q)) &&
      (!$provider.value || m.provider === $provider.value) &&
      (!cat || catFilters[cat](m))
    );
    list.sort(sorts[$sort.value]);

    $count.textContent = list.length + ' model' + (list.length === 1 ? '' : 's');
    if (!list.length) {
      $tbody.innerHTML = '<tr><td colspan="6" style="padding:32px; text-align:center; color:var(--ink-40)">No models match. Clear a filter or search the full catalog via <code>GET /v1/models</code>.</td></tr>';
      return;
    }
    $tbody.innerHTML = list.map(m => {
      const badges =
        (m.new ? ' <span class="badge badge-new" style="font-size:8.5px; padding:1px 5px">NEW</span>' : '') +
        (m.open ? ' <span class="badge" style="font-size:8.5px; padding:1px 5px">OPEN</span>' : '');
      const discount = m.listIn ? ' <span class="badge badge-online" style="font-size:8.5px; padding:1px 5px">BELOW LIST</span>' : '';
      return '<tr class="rowlink" data-href="model.html?id=' + encodeURIComponent(m.id) + '">' +
        '<td><a href="model.html?id=' + encodeURIComponent(m.id) + '" style="color:var(--ink); font-weight:500">' + m.name + '</a>' + badges + discount +
        '<div class="mono" style="font-size:10.5px; color:var(--ink-40)">' + m.id + '</div></td>' +
        '<td style="color:var(--ink-70)">' + m.provider + '</td>' +
        '<td class="num">' + F.ctx(m.ctx) + '</td>' +
        '<td class="num">' + F.price(m.in) + '</td>' +
        '<td class="num">' + F.price(m.out) + '</td>' +
        '<td class="num" style="color:var(--ink-70)">' + m.latency + 'ms</td></tr>';
    }).join('');
    $tbody.querySelectorAll('tr.rowlink').forEach(tr =>
      tr.addEventListener('click', e => { if (e.target.tagName !== 'A') location.href = tr.dataset.href; }));
  }

  $q.addEventListener('input', render);
  $provider.addEventListener('change', render);
  $sort.addEventListener('change', render);
  $chips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    cat = chip.dataset.cat;
    $chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    render();
  });

  render();
  if (params.get('q')) $q.focus();
})();

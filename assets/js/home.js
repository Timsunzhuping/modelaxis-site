// Homepage: live board, price comparison, featured model cards.
(function () {
  const M = window.MX_MODELS, F = window.MX_FMT;
  const byId = id => M.find(m => m.id === id);
  const modelUrl = id => 'models/model.html?id=' + encodeURIComponent(id);

  // ---- hero board: top models by share ----
  const boardIds = [
    'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-flash', 'openai/gpt-5',
    'deepseek/deepseek-v3.2', 'x-ai/grok-4-fast', 'moonshotai/kimi-k2-thinking',
  ];
  const rows = document.getElementById('board-rows');
  if (rows) {
    boardIds.map(byId).filter(Boolean).forEach(m => {
      const row = document.createElement('a');
      row.className = 'board-row';
      row.href = modelUrl(m.id);
      row.style.color = 'inherit';
      row.innerHTML =
        '<span>' + m.name + (m.new ? ' <span class="badge badge-new" style="font-size:8.5px; padding:1px 5px">NEW</span>' : '') + '</span>' +
        '<span class="num">' + m.latency + 'ms</span>' +
        '<span class="num price">' + F.price(m.in) + '</span>' +
        '<span class="num price">' + F.price(m.out) + '</span>';
      rows.appendChild(row);
    });
  }

  // ---- hero bar chart: 24h token flow, center bar cobalt, one aurora ----
  const bars = document.getElementById('board-bars');
  if (bars) {
    const heights = [34, 52, 44, 61, 72, 100, 58, 66, 48, 55, 40, 63];
    heights.forEach((h, i) => {
      const bar = document.createElement('i');
      bar.style.height = h + '%';
      if (h === 100) bar.className = 'b-cobalt';
      else if (i === 7) bar.className = 'b-aurora';
      bars.appendChild(bar);
    });
  }

  // ---- price comparison (blended 3:1 in:out) ----
  const blend = (i, o) => (3 * i + o) / 4;
  const compareIds = ['anthropic/claude-opus-4.1', 'openai/gpt-5', 'google/gemini-2.5-pro', 'z-ai/glm-4.6', 'moonshotai/kimi-k2'];
  const cmp = document.getElementById('compare-rows');
  if (cmp) {
    const items = compareIds.map(byId).filter(m => m && m.listIn);
    const maxBlend = Math.max(...items.map(m => blend(m.listIn, m.listOut)));
    cmp.innerHTML = items.map(m => {
      const list = blend(m.listIn, m.listOut), axis = blend(m.in, m.out);
      const save = Math.round((1 - axis / list) * 100);
      return '<div class="compare-row">' +
        '<div class="name">' + m.name + '<small>' + m.id + '</small></div>' +
        '<div class="compare-bars">' +
          '<div class="track"><span class="bar list" style="width:' + (list / maxBlend * 100) + '%"></span><span class="lbl">list ' + F.price(list) + '</span></div>' +
          '<div class="track"><span class="bar axis" style="width:' + (axis / maxBlend * 100) + '%"></span><span class="lbl">axis ' + F.price(axis) + '</span></div>' +
        '</div>' +
        '<div class="save">−' + save + '%</div></div>';
    }).join('');
  }

  // ---- featured model cards ----
  const featuredIds = ['anthropic/claude-haiku-4.5', 'openai/gpt-5', 'x-ai/grok-4-fast', 'deepseek/deepseek-v3.2'];
  const feat = document.getElementById('featured-models');
  if (feat) {
    feat.innerHTML = featuredIds.map(byId).filter(Boolean).map(m =>
      '<div class="model-card">' +
        '<div class="mc-top"><div><h3><a href="' + modelUrl(m.id) + '">' + m.name + '</a></h3>' +
        '<div class="provider">' + m.provider + '</div></div>' +
        (m.new ? '<span class="badge badge-new">NEW</span>' : (m.open ? '<span class="badge">OPEN</span>' : '')) + '</div>' +
        '<p>' + m.desc + '</p>' +
        '<div class="mc-meta"><span><b>' + F.price(m.in) + '</b> in</span><span><b>' + F.price(m.out) + '</b> out</span><span><b>' + F.ctx(m.ctx) + '</b> ctx</span></div>' +
      '</div>'
    ).join('');
  }
})();

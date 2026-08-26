// Rankings: token-share bars per category.
(function () {
  const M = window.MX_MODELS, F = window.MX_FMT;
  const $list = document.getElementById('rank-list');
  const $tabs = document.getElementById('rank-tabs');

  const cats = {
    '': () => true,
    reasoning: m => m.reasoning,
    open: m => m.open,
    multimodal: m => m.modality !== 'text',
    cheap: m => m.out < 1,
  };

  function render(cat) {
    const list = M.filter(cats[cat]).sort((a, b) => b.share - a.share).slice(0, 15);
    const total = list.reduce((s, m) => s + m.share, 0);
    const max = list[0].share;
    $list.innerHTML = list.map((m, i) => {
      const share = (m.share / total) * 100;
      return '<a href="../models/model.html?id=' + encodeURIComponent(m.id) + '" style="display:grid; grid-template-columns:44px 220px 1fr 76px; gap:16px; align-items:center; padding:13px 20px; border-bottom:1px solid var(--line-soft); color:var(--ink)" class="rank-row">' +
        '<span class="mono" style="font-size:12px; color:var(--ink-40)">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span style="font-size:13.5px">' + m.name +
          '<span class="mono" style="display:block; font-size:9.5px; letter-spacing:1px; color:var(--ink-40); text-transform:uppercase">' + m.provider + '</span></span>' +
        '<span class="meter" style="height:10px"><i class="' + (i === 0 ? 'fill' : '') + '" style="width:' + (m.share / max * 100) + '%; background:' + (i === 0 ? 'var(--cobalt)' : 'var(--bar-neutral)') + '"></i><i class="rest" style="flex:1; background:transparent"></i></span>' +
        '<span class="mono" style="font-size:12px; text-align:right">' + share.toFixed(1) + '%</span></a>';
    }).join('');
  }

  $tabs.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $tabs.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    render(chip.dataset.cat);
  });

  render('');
})();

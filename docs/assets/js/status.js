// Status page: deterministic 90-day uptime bars per provider.
(function () {
  const F = window.MX_FMT;
  const providers = [...new Set(window.MX_MODELS.map(m => m.provider))].sort();
  const $list = document.getElementById('uptime-list');

  $list.innerHTML = providers.map(p => {
    const h = F.hash(p);
    let cells = '', downDays = 0, degDays = 0;
    for (let d = 0; d < 90; d++) {
      const r = (h * (d + 13) * 2654435761) >>> 0;
      let cls = '';
      if (r % 997 < 6) { cls = 'down'; downDays++; }
      else if (r % 499 < 9) { cls = 'deg'; degDays++; }
      cells += '<i class="' + cls + '" title="day −' + (89 - d) + '"></i>';
    }
    const uptime = (100 - (downDays * 0.9 + degDays * 0.12) / 90 * 100 / 24).toFixed(2);
    return '<div style="display:grid; grid-template-columns:170px 1fr 90px; gap:18px; align-items:center; padding:13px 20px; border-bottom:1px solid var(--line-soft)" class="uptime-row">' +
      '<span style="font-size:13.5px">' + p + '</span>' +
      '<span class="uptime" aria-label="' + p + ' 90-day uptime">' + cells + '</span>' +
      '<span class="mono" style="font-size:12px; text-align:right; color:' + (uptime >= 99.9 ? 'var(--aurora-deep)' : 'var(--ink-70)') + '">' + uptime + '%</span></div>';
  }).join('');
})();

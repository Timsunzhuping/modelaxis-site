// ModelAxis shared behaviors: nav, ⌘K search, bar animations, code tabs.
(function () {
  const ROOT = document.querySelector('.nav .nav-brand')?.getAttribute('href') || './';

  // ---- mobile menu ----
  const burger = document.querySelector('[data-burger]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      const open = mobileMenu.hidden;
      mobileMenu.hidden = !open;
      burger.setAttribute('aria-expanded', String(open));
    });
  }

  // ---- ⌘K model search overlay ----
  let overlay = null, selIndex = -1;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.innerHTML =
      '<div class="search-panel" role="dialog" aria-label="Search models">' +
      '<input type="text" placeholder="Search 400+ models… (esc to close)" aria-label="Search models">' +
      '<div class="search-results"></div></div>';
    document.body.appendChild(overlay);
    const input = overlay.querySelector('input');
    const results = overlay.querySelector('.search-results');

    function renderResults(q) {
      const models = window.MX_MODELS || [];
      const query = q.trim().toLowerCase();
      const matches = (query
        ? models.filter(m => (m.id + ' ' + m.name + ' ' + m.provider).toLowerCase().includes(query))
        : models.slice().sort((a, b) => b.share - a.share)
      ).slice(0, 8);
      selIndex = -1;
      if (!matches.length) {
        results.innerHTML = '<div class="search-empty">No models match “' + q.replace(/</g, '&lt;') + '”. Try a provider name.</div>';
        return;
      }
      results.innerHTML = matches.map(m =>
        '<a href="' + ROOT + 'models/model.html?id=' + encodeURIComponent(m.id) + '">' +
        '<span>' + m.name + ' <span class="mono">' + m.provider + '</span></span>' +
        '<span class="mono">' + window.MX_FMT.price(m.in) + ' / ' + window.MX_FMT.price(m.out) + '</span></a>'
      ).join('');
    }

    input.addEventListener('input', () => renderResults(input.value));
    input.addEventListener('keydown', e => {
      const links = [...results.querySelectorAll('a')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        selIndex = (selIndex + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % (links.length || 1);
        links.forEach((a, i) => a.classList.toggle('sel', i === selIndex));
        links[selIndex]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && links[selIndex >= 0 ? selIndex : 0]) {
        links[selIndex >= 0 ? selIndex : 0].click();
      }
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSearch(); });
    renderResults('');
    return overlay;
  }

  function openSearch() {
    if (!window.MX_MODELS) { // data not loaded on this page — go to the directory
      location.href = ROOT + 'models/';
      return;
    }
    ensureOverlay().classList.add('open');
    overlay.querySelector('input').focus();
  }
  function closeSearch() { overlay?.classList.remove('open'); }

  document.querySelectorAll('[data-search-trigger]').forEach(el => el.addEventListener('click', openSearch));
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') closeSearch();
  });

  // ---- bar chart entrance animation ----
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const bars = entry.target;
      [...bars.children].forEach((bar, i) => { bar.style.transitionDelay = (i * 45) + 'ms'; });
      bars.classList.add('in');
      io.unobserve(bars);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.bars-anim').forEach(el => io.observe(el));
  // Fallback: never leave bars hidden if the observer can't fire (hidden tab, etc.)
  setTimeout(() => document.querySelectorAll('.bars-anim').forEach(el => el.classList.add('in')), 1600);

  // ---- count-up numbers ----
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cio = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      cio.unobserve(el);
      const target = parseFloat(el.dataset.count);
      const decimals = (el.dataset.count.split('.')[1] || '').length;
      if (reduced) { el.textContent = target.toFixed(decimals); return; }
      const start = performance.now(), dur = 900;
      (function tick(now) {
        const t = Math.min(1, (now - start) / dur);
        el.textContent = (target * (1 - Math.pow(1 - t, 3))).toFixed(decimals);
        if (t < 1) requestAnimationFrame(tick);
      })(start);
      // rAF stalls in hidden tabs — guarantee the final value regardless.
      setTimeout(() => { el.textContent = target.toFixed(decimals); }, dur + 200);
    });
  }, { threshold: 0.4 });
  document.querySelectorAll('[data-count]').forEach(el => cio.observe(el));

  // ---- code tabs + copy ----
  document.querySelectorAll('.code-card').forEach(card => {
    const tabs = [...card.querySelectorAll('.code-tabs button')];
    const panes = [...card.querySelectorAll('.code-body pre')];
    tabs.forEach((tab, i) => tab.addEventListener('click', () => {
      tabs.forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
      panes.forEach((p, j) => { p.hidden = i !== j; });
    }));
    const copy = card.querySelector('.code-copy');
    copy?.addEventListener('click', () => {
      const visible = panes.find(p => !p.hidden) || panes[0];
      navigator.clipboard.writeText(visible.textContent).then(() => {
        copy.textContent = 'COPIED';
        setTimeout(() => { copy.textContent = 'COPY'; }, 1400);
      });
    });
  });
})();

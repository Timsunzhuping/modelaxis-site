// Chat playground. Demo mode simulates locally; paste an mx-sk key to route
// the conversation through the live platform API (same origin or MX_API_BASE).
(function () {
  const M = window.MX_MODELS, F = window.MX_FMT;
  const API_BASE = (localStorage.getItem('MX_API_BASE') || '').replace(/\/$/, '');
  const $key = document.getElementById('chat-key');
  const $modeBadge = document.getElementById('chat-mode-badge');
  const $model = document.getElementById('chat-model');
  const $meta = document.getElementById('chat-modelmeta');
  const $log = document.getElementById('chat-log');
  const $empty = document.getElementById('chat-empty');
  const $form = document.getElementById('chat-form');
  const $input = document.getElementById('chat-input');
  const $temp = document.getElementById('chat-temp');
  const $tempVal = document.getElementById('temp-val');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // model select: auto first, then by share
  const auto = document.createElement('option');
  auto.value = 'modelaxis/auto'; auto.textContent = 'modelaxis/auto — best price-performance';
  $model.appendChild(auto);
  M.slice().sort((a, b) => b.share - a.share).forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name + ' · ' + m.provider;
    $model.appendChild(opt);
  });
  const pre = new URLSearchParams(location.search).get('model');
  if (pre && [...$model.options].some(o => o.value === pre)) $model.value = pre;

  function currentModel() { return M.find(m => m.id === $model.value); }
  function renderMeta() {
    const m = currentModel();
    $meta.innerHTML = m
      ? F.price(m.in) + ' in · ' + F.price(m.out) + ' out<br>' + F.ctx(m.ctx) + ' context · ' + m.latency + 'ms TTFT'
      : 'routes per request ·<br>current pick: ' + M.slice().sort((a, b) => b.share - a.share)[0].name;
    $meta.style.borderLeft = '2px solid var(--cobalt)';
    $meta.style.paddingLeft = '10px';
  }
  $model.addEventListener('change', renderMeta);
  renderMeta();

  $temp.addEventListener('input', () => { $tempVal.textContent = (+$temp.value).toFixed(1); });

  function addMsg(role, html) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    div.innerHTML = html;
    $log.appendChild(div);
    $log.scrollTop = $log.scrollHeight;
    return div;
  }

  function demoReply(question, m) {
    const name = m ? m.name : 'the current best pick';
    const price = m ? F.price(m.in) + ' / ' + F.price(m.out) + ' per 1M tokens' : 'the lowest live price';
    return 'This is a simulated reply — in demo mode nothing leaves your browser. ' +
      'In production, this exact conversation would be routed to ' + name +
      ' at ' + price + ', with automatic failover if the primary endpoint blinks. ' +
      'Your question was:\n\n“' + question.slice(0, 280) + (question.length > 280 ? '…' : '') + '”\n\n' +
      'Create an API key to run it for real — the request body you would send is identical.';
  }

  // live-mode plumbing
  if ($key) {
    $key.value = sessionStorage.getItem('MX_CHAT_KEY') || '';
    const syncMode = () => {
      const live = /^mx-sk-/.test($key.value.trim());
      $modeBadge.textContent = live ? 'LIVE' : 'DEMO';
      $modeBadge.className = 'badge' + (live ? ' badge-online' : '');
      sessionStorage.setItem('MX_CHAT_KEY', $key.value.trim());
    };
    $key.addEventListener('input', syncMode);
    syncMode();
  }
  const liveKey = () => {
    const v = ($key?.value || '').trim();
    return /^mx-sk-/.test(v) ? v : null;
  };
  const history = [];

  async function liveReply(text, holder, m) {
    const body = {
      model: m ? m.id : 'modelaxis/auto',
      stream: true,
      temperature: +$temp.value,
      messages: [
        ...(document.getElementById('chat-system').value.trim()
          ? [{ role: 'system', content: document.getElementById('chat-system').value.trim() }] : []),
        ...history,
        { role: 'user', content: text },
      ],
    };
    const res = await fetch((API_BASE || '') + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + liveKey() },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'API error ' + res.status);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const span = document.createElement('span');
    holder.innerHTML = '';
    holder.appendChild(span);
    let buf = '', content = '', meta = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 2);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let json; try { json = JSON.parse(data); } catch { continue; }
        if (json.modelaxis) meta = { ...json.modelaxis, model: json.model, usage: json.usage };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) { content += delta; span.textContent = content; $log.scrollTop = $log.scrollHeight; }
      }
    }
    const metaDiv = document.createElement('div');
    metaDiv.className = 'meta mono';
    metaDiv.textContent = meta
      ? `${meta.model} · LIVE · ${meta.endpoint} · ${meta.usage?.total_tokens ?? '?'} TOK · $${(meta.cost_usd ?? 0).toFixed(6)}`
      : (m ? m.id : 'modelaxis/auto') + ' · LIVE';
    holder.appendChild(metaDiv);
    history.push({ role: 'user', content: text }, { role: 'assistant', content });
  }

  let busy = false;
  $form.addEventListener('submit', e => {
    e.preventDefault();
    const text = $input.value.trim();
    if (!text || busy) return;
    busy = true;
    $empty?.remove();
    $input.value = '';
    addMsg('user', escapeHtml(text));

    const m = currentModel();
    if (liveKey()) {
      const holder = addMsg('assistant', '<span class="loader-bars" aria-label="Thinking"><i></i><i></i><i></i><i></i><i></i></span>');
      liveReply(text, holder, m)
        .catch(err => { holder.innerHTML = '<span style="color:var(--alert)">' + escapeHtml(err.message) + '</span>'; })
        .finally(() => { busy = false; });
      return;
    }
    const holder = addMsg('assistant', '<span class="loader-bars" aria-label="Thinking"><i></i><i></i><i></i><i></i><i></i></span>');
    const full = demoReply(text, m);
    const latency = m ? m.latency : 160;

    setTimeout(() => {
      const body = document.createElement('span');
      holder.innerHTML = '';
      holder.appendChild(body);
      let i = 0;
      const step = reduced ? full.length : 3;
      (function type() {
        i = Math.min(full.length, i + step);
        body.textContent = full.slice(0, i);
        $log.scrollTop = $log.scrollHeight;
        if (i < full.length) { setTimeout(type, 12); return; }
        const meta = document.createElement('div');
        meta.className = 'meta mono';
        meta.textContent = (m ? m.id : 'modelaxis/auto') + ' · DEMO · ' + latency + 'MS TTFT · TEMP ' + (+$temp.value).toFixed(1);
        holder.appendChild(meta);
        busy = false;
      })();
    }, reduced ? 0 : latency + 200);
  });

  $input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $form.requestSubmit(); }
  });

  function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
})();

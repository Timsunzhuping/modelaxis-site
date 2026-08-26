// Console sign-in / sign-up page.
(function () {
  const API = () => localStorage.getItem('MX_API_BASE') || '';
  const $ = id => document.getElementById(id);
  let mode = 'login';

  const setMode = m => {
    mode = m;
    $('tab-login').setAttribute('aria-pressed', String(m === 'login'));
    $('tab-signup').setAttribute('aria-pressed', String(m === 'signup'));
    $('auth-submit').textContent = m === 'login' ? 'Sign in' : 'Create account';
    $('signup-note').hidden = m === 'login';
    $('password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('auth-error').textContent = '';
  };
  $('tab-login').addEventListener('click', () => setMode('login'));
  $('tab-signup').addEventListener('click', () => setMode('signup'));

  $('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    $('auth-error').textContent = '';
    $('auth-submit').disabled = true;
    try {
      const res = await fetch(API() + '/api/console/' + (mode === 'login' ? 'login' : 'signup'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('email').value, password: $('password').value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { $('auth-error').textContent = json.error || ('Error ' + res.status); return; }
      location.href = 'dashboard.html';
    } catch {
      $('auth-error').textContent = 'Cannot reach the platform API — check the API server setting below.';
    } finally {
      $('auth-submit').disabled = false;
    }
  });

  // API base settings
  $('api-settings-link').addEventListener('click', e => {
    e.preventDefault();
    $('api-settings').hidden = !$('api-settings').hidden;
  });
  $('api-base').value = API();
  $('api-base').addEventListener('change', () => {
    const v = $('api-base').value.trim().replace(/\/$/, '');
    if (v) localStorage.setItem('MX_API_BASE', v); else localStorage.removeItem('MX_API_BASE');
  });

  // Already signed in? Go straight to the dashboard.
  fetch(API() + '/api/console/me', { credentials: 'include' })
    .then(r => { if (r.ok) location.href = 'dashboard.html'; })
    .catch(() => {});
})();

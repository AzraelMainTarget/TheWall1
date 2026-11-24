(() => {
  const O = 'AzraelMainTarget', R = 'TheWall1', FEED = 'box/messages.md';
  const TS = 'gh-voice-token';
  const token = () => { try { return (localStorage.getItem(TS) || '').trim(); } catch { return ''; } };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));

  const api = (p, opt = {}) => fetch('https://api.github.com/repos/' + O + '/' + R + p, {
    ...opt,
    headers: { 'Authorization': 'Bearer ' + token(), 'Accept': 'application/vnd.github+json', ...(opt.headers || {}) }
  });

  /* --- последние сообщения --- */
  async function loadFeed() {
    const box = document.getElementById('feed');
    if (!token()) {
      box.innerHTML = '<div class="row-empty">лента скрыта — нужен ключ в <a href="box.html">Box</a></div>';
      return;
    }
    try {
      const r = await api('/contents/' + FEED);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const lines = unb64(d.content).trim().split('\n').filter(Boolean).slice(-4).reverse();
      box.innerHTML = lines.map(l => {
        const raw = l.replace(/^\s*-\s*/, '');
        const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.*)$/);
        if (!m) return '<div class="row-empty">' + esc(raw) + '</div>';
        const arena = /arena/i.test(m[3]);
        const dd = m[1].slice(8) + '.' + m[1].slice(5, 7);
        return '<div class="msg ' + (arena ? 'from-arena' : 'from-me') + '">' +
          '<span class="meta"><b class="who">' + esc(m[3].trim()) + '</b>' +
          '<span class="when">' + dd + ' · ' + m[2] + '</span></span>' +
          '<span class="body">' + esc(m[4]) + '</span></div>';
      }).join('') || '<div class="row-empty">пока пусто</div>';
    } catch (e) {
      box.innerHTML = '<div class="row-empty">не смог прочитать: ' + esc(e.message) + '</div>';
    }
  }

  /* --- быстрая отправка со страницы-хаба --- */
  const quick = document.getElementById('quick');
  const qmsg = document.getElementById('qmsg');
  quick.onclick = async () => {
    const v = qmsg.value.trim();
    if (!v) return;
    if (!token()) { qmsg.value = ''; qmsg.placeholder = 'нужен ключ — открой Box'; return; }
    quick.disabled = true;
    quick.textContent = '…';
    try {
      let sha = null, body = '';
      const r = await api('/contents/' + FEED);
      if (r.ok) { const d = await r.json(); sha = d.sha; body = unb64(d.content); }
      const t = new Date(), p = (n) => String(n).padStart(2, '0');
      const stamp = t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
      body = body.replace(/\s*$/, '\n') + '- ' + stamp + ' | Ты | ' + v.replace(/\n/g, ' ') + '\n';
      const put = await api('/contents/' + FEED, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'box: add entry', content: btoa(unescape(encodeURIComponent(body))), ...(sha ? { sha } : {}) })
      });
      if (!put.ok) throw new Error('HTTP ' + put.status);
      qmsg.value = '';
      loadFeed();
    } catch (e) {
      qmsg.value = v;
      qmsg.placeholder = 'ошибка: ' + e.message;
    } finally {
      quick.disabled = false;
      quick.textContent = 'Отправить';
    }
  };

  /* --- статус --- */
  async function loadStatus() {
    const site = document.getElementById('stSite');
    try {
      const r = await fetch('https://azraelmaintarget.github.io/TheWall1/?t=' + Date.now(), { method: 'HEAD' });
      site.textContent = r.ok ? 'работает' : 'HTTP ' + r.status;
      site.className = r.ok ? 'ok' : 'bad';
    } catch { site.textContent = 'нет связи'; site.className = 'bad'; }

    try {
      const runs = await api('/actions/runs?per_page=1');
      if (runs.ok) {
        const r = (await runs.json()).workflow_runs[0];
        const d = document.getElementById('stDeploy');
        const t = new Date(r.created_at);
        d.textContent = (r.conclusion === 'success' ? '✓ ' : '✕ ') +
          t.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        d.className = r.conclusion === 'success' ? 'ok' : 'bad';
      }
    } catch {}
  }

  loadFeed();
  loadStatus();

  /* автообновление ленты, чтобы не жать каждый раз */
  const ref = document.getElementById('ref');
  if (ref) ref.onclick = loadFeed;
  let last = 0;
  setInterval(() => {
    if (document.hidden) return;
    if (Date.now() - last < 20000) return;
    last = Date.now();
    loadFeed();
  }, 5000);
})();


(() => {
  const GATE_HASH = 'pbkdf2$sha256$150000$vngfCPefeLcNgXM0ajqQ1A==$kdDmd5q3sk26k7p1QSzwbuonE/0+Mg4b3Jh1WUUWzbg=';
  const SESSION = 'td-tools';
  const SESSION_MS = 12 * 60 * 60 * 1000;

  const gate = document.getElementById('gate');
  const app  = document.getElementById('app');

  const open = () => {
    gate.classList.add('hide');
    app.style.display = 'block';
    status();
  };

  try {
    const t = Number(localStorage.getItem(SESSION) || 0);
    if (t && Date.now() - t < SESSION_MS) open();
  } catch {}

  const b64b = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function check(code) {
    const [, name, iter, salt, want] = GATE_HASH.split('$');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: b64b(salt), iterations: Number(iter), hash: name.toUpperCase() }, key, 256);
    return btoa(String.fromCharCode(...new Uint8Array(bits))) === want;
  }

  document.getElementById('gateBtn').onclick = async () => {
    const msg = document.getElementById('gateMsg');
    const inp = document.getElementById('gatePass');
    msg.textContent = 'проверяю…';
    msg.className = 'mut';
    const raw = (inp.value || '');
    /* iPhone autocapitalises password fields — the code is lowercase, so we
       try as typed, then lowercased, then without any spaces */
    const variants = [...new Set([
      raw.trim(),
      raw.trim().toLowerCase(),
      raw.replace(/\s+/g, ''),
      raw.replace(/\s+/g, '').toLowerCase()
    ])].filter(Boolean);

    let ok = false;
    for (const v of variants) {
      if (await check(v).catch(() => false)) { ok = true; break; }
    }
    if (ok) { try { localStorage.setItem(SESSION, String(Date.now())); } catch {} open(); }
    else {
      msg.textContent = 'неверный код · введено «' + (raw.trim() || '—') + '»';
      msg.className = 'bad';
      inp.value = '';
    }
  };
  document.getElementById('gatePass').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('gateBtn').click();
  });

  document.getElementById('lock').onclick = () => {
    try { localStorage.removeItem(SESSION); } catch {}
    location.reload();
  };

  /* ---------- статус GitHub ---------- */
  const api = (p) => fetch('https://api.github.com/repos/AzraelMainTarget/TheWall1' + p, {
    headers: { 'Accept': 'application/vnd.github+json' }
  }).then(r => r.ok ? r.json() : Promise.reject(r.status));

  async function status() {
    const site = document.getElementById('stSite');
    try {
      const r = await fetch('https://azraelmaintarget.github.io/TheWall1/?t=' + Date.now(), { method: 'HEAD' });
      site.textContent = r.ok ? 'работает' : 'HTTP ' + r.status;
      site.className = r.ok ? 'ok' : 'bad';
    } catch { site.textContent = 'нет связи'; site.className = 'bad'; }

    try {
      const repo = await api('');
      document.getElementById('stBranch').textContent = repo.default_branch;
      const runs = await api('/actions/runs?per_page=1');
      const r = (runs.workflow_runs || [])[0];
      const d = document.getElementById('stDeploy');
      if (r) {
        const t = new Date(r.created_at);
        d.textContent = (r.conclusion === 'success' ? '✓ ' : '✕ ') +
          t.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        d.className = r.conclusion === 'success' ? 'ok' : 'bad';
      }
    } catch {
      document.getElementById('stBranch').textContent = '—';
    }
  }
  document.getElementById('refresh').onclick = status;

  /* ---------- инструменты ---------- */
  const secret = document.getElementById('secret');

  document.getElementById('tPass').onclick = () => {
    secret.style.display = 'block';
    secret.innerHTML = `
      <h2>Генератор паролей</h2>
      <div class="panel">
        <input class="field" id="pwLen" type="number" min="8" max="64" value="16" placeholder="длина">
        <div class="row">
          <button class="btn" id="gen">Сгенерировать</button>
          <button class="btn" id="mkHash">Сделать хеш</button>
        </div>
        <pre class="out" id="pwOut">—</pre>
      </div>`;
    const out = document.getElementById('pwOut');
    const charset = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%^&*-_=+';
    document.getElementById('gen').onclick = () => {
      const n = Math.min(64, Math.max(8, Number(document.getElementById('pwLen').value) || 16));
      const buf = new Uint32Array(n);
      crypto.getRandomValues(buf);
      out.textContent = Array.from(buf, x => charset[x % charset.length]).join('');
    };
    document.getElementById('mkHash').onclick = async () => {
      const pw = out.textContent.trim();
      if (!pw || pw === '—') { out.textContent = 'сначала сгенерируй пароль'; return; }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iter = 150000;
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
      const b = (a) => btoa(String.fromCharCode(...new Uint8Array(a)));
      out.textContent = `пароль:  ${pw}\nпроверка: pbkdf2$sha256$${iter}$${b(salt)}$${b(bits)}`;
    };
  };

  document.getElementById('tHook').onclick = () => {
    secret.style.display = 'block';
    secret.innerHTML = `
      <h2>Вебхук Make</h2>
      <div class="panel">
        <input class="field" id="hookUrl" placeholder="https://hook.eu2.make.com/..." value="">
        <input class="field" id="hookBody" style="margin-top:10px" placeholder='{"test":true}'>
        <div class="row">
          <button class="btn primary" id="hookGo">Отправить</button>
          <button class="btn" id="hookClr">Очистить</button>
        </div>
        <pre class="out" id="hookOut">ответ появится здесь</pre>
      </div>`;
    try {
      const saved = localStorage.getItem('td-hook');
      if (saved) document.getElementById('hookUrl').value = saved;
    } catch {}
    document.getElementById('hookGo').onclick = async () => {
      const url = document.getElementById('hookUrl').value.trim();
      const out = document.getElementById('hookOut');
      if (!url) { out.textContent = 'нужен URL вебхука'; return; }
      try { localStorage.setItem('td-hook', url); } catch {}
      const body = document.getElementById('hookBody').value.trim() ||
        JSON.stringify({ test: true, source: 'tools', ts: new Date().toISOString() });
      out.textContent = 'отправляю…';
      const t0 = performance.now();
      try {
        const r = await fetch(url, { method: 'POST', mode: 'cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
        const txt = await r.text();
        out.textContent = `HTTP ${r.status} · ${Math.round(performance.now() - t0)} мс\n\n${txt || '(пустой ответ — это нормально)'}`;
      } catch (e) {
        out.textContent = 'ошибка: ' + e.message +
          '\n\nВозможно CORS: Make не отдаёт Access-Control-Allow-Origin.';
      }
    };
    document.getElementById('hookClr').onclick = () => {
      document.getElementById('hookOut').textContent = '—';
    };
  };
})();

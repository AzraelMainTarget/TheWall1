
(() => {
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

  /* ============================================================
     Проверка кода — намеренно простыми средствами.
     WebCrypto с PBKDF2 в Safari падал с NotSupportedError, а мы
     потом врали «неверный код». Здесь ничего не может упасть:
     чистая арифметика над строкой, синхронная, без промисов.
     ============================================================ */
  const GATE_KEY = 0x5f3a91c7;          // контрольная константа

  /* простая, но не тривиальная свёртка строки (FNV-1a) */
  function fold(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /* ожидаемое значение для кода 'thatdarkness' */
  const WANT = fold('td|thatdarkness') ^ GATE_KEY;

  function normalise(raw) {
    return String(raw || '')
      .replace(/[\u0400-\u04FF]/g, '')   // выкидываем случайную кириллицу
      .replace(/[\s\u00A0\u2000-\u200F\uFEFF]/g, '')  // все виды пробелов и невидимки
      .toLowerCase();
  }

  function check(raw) {
    const v = normalise(raw);
    if (!v) return false;
    return (fold('td|' + v) ^ GATE_KEY) === WANT;
  }

  document.getElementById('gateBtn').onclick = () => {
    const msg = document.getElementById('gateMsg');
    const inp = document.getElementById('gatePass');
    const shown = (inp.value || '').trim();

    let ok = false;
    try {
      ok = check(inp.value);
    } catch (e) {
      msg.textContent = 'сбой проверки: ' + e.message;
      msg.className = 'bad';
      return;
    }

    if (ok) {
      try { localStorage.setItem(SESSION, String(Date.now())); } catch {}
      msg.textContent = '';
      open();
    } else {
      msg.textContent = 'не подошло «' + (shown || '—') + '» · длина ' +
        (inp.value || '').length;
      msg.className = 'bad';
      inp.value = '';
      inp.focus();
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

  document.getElementById('tTok').onclick = () => {
    secret.style.display = 'block';
    const saved = (() => { try { return localStorage.getItem('gh-voice-token') || ''; } catch { return ''; } })();
    secret.innerHTML = `
      <h2>Ключ GitHub</h2>
      <div class="panel">
        <input class="field" id="tokIn" type="password" placeholder="github_pat_..." autocomplete="off" spellcheck="false">
        <div class="row">
          <button class="btn primary" id="tokSave">Сохранить</button>
          <button class="btn" id="tokCheck">Проверить</button>
          <button class="btn" id="tokClear">Стереть</button>
        </div>
        <pre class="out" id="tokOut">ключ нужен для отправки голосовых с voice.html</pre>
      </div>`;
    const inp = document.getElementById('tokIn');
    const out = document.getElementById('tokOut');
    inp.value = saved;
    if (saved) out.textContent = 'ключ уже сохранён · длина ' + saved.length;

    document.getElementById('tokSave').onclick = () => {
      const v = inp.value.trim();
      if (!v) { out.textContent = 'пусто'; return; }
      try {
        localStorage.setItem('gh-voice-token', v);
        out.textContent = 'сохранён · длина ' + v.length + ' · теперь voice.html использует его';
      } catch (e) { out.textContent = 'не смог сохранить: ' + e.message; }
    };

    document.getElementById('tokCheck').onclick = async () => {
      const v = inp.value.trim();
      if (!v) { out.textContent = 'вставь ключ'; return; }
      out.textContent = 'проверяю…';
      try {
        const r = await fetch('https://api.github.com/user', {
          headers: { 'Authorization': 'Bearer ' + v, 'Accept': 'application/vnd.github+json' }
        });
        if (r.status === 401) { out.textContent = 'ключ не принят (401) — скопируй заново'; return; }
        const d = await r.json();
        const rr = await fetch('https://api.github.com/repos/AzraelMainTarget/TheWall1', {
          headers: { 'Authorization': 'Bearer ' + v, 'Accept': 'application/vnd.github+json' }
        });
        const perms = rr.ok ? (await rr.json()).permissions || {} : {};
        out.textContent = 'ключ рабочий\nпользователь: ' + d.login +
          '\nдоступ к TheWall1: ' + (rr.ok ? (perms.push ? 'запись есть' : 'только чтение') : 'нет (HTTP ' + rr.status + ')');
      } catch (e) { out.textContent = 'ошибка: ' + e.message; }
    };

    document.getElementById('tokClear').onclick = () => {
      try { localStorage.removeItem('gh-voice-token'); } catch {}
      inp.value = '';
      out.textContent = 'ключ стёрт';
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

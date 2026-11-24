(() => {
  const O = 'AzraelMainTarget', R = 'TheWall1';
  const FEED = 'box/messages.md';
  const RAW = 'https://raw.githubusercontent.com/' + O + '/' + R + '/main/';
  const PAGES = 'https://azraelmaintarget.github.io/' + R + '/';
  const TS = 'gh-voice-token';
  const PEND = 'box-pending';

  const st = document.getElementById('st');
  const feed = document.getElementById('feed');
  const tok = document.getElementById('tok');
  const msg = document.getElementById('msg');
  const recBtn = document.getElementById('rec');

  const token = () => { try { return (localStorage.getItem(TS) || '').trim(); } catch { return ''; } };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const linkify = (t) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const show = (t) => { st.textContent = t; };

  /* «трекер»: что происходит прямо сейчас */
  const tracker = document.getElementById('tracker');
  let idleTimer = null;
  function track(text, busy) {
    if (!tracker) return;
    tracker.innerHTML = busy ? '<span class="dot"></span>' + text : (text || 'тишина');
    tracker.classList.toggle('act', !!busy);
    clearTimeout(idleTimer);
    if (busy) idleTimer = setTimeout(() => track('тишина', false), 6000);
  }

  /* ---------- локальная очередь: сообщение видно сразу и не пропадает ---------- */
  const readPend = () => { try { return JSON.parse(localStorage.getItem(PEND) || '[]'); } catch { return []; } };
  const writePend = (arr) => { try { localStorage.setItem(PEND, JSON.stringify(arr.slice(-40))); } catch {} };
  const addPend = (item) => { const a = readPend(); a.push(item); writePend(a); };

  tok.value = token();
  document.getElementById('saveTok').onclick = () => {
    try { localStorage.setItem(TS, tok.value.trim()); show('ключ сохранён'); load(true); }
    catch { show('не сохранилось'); }
  };

  const api = (p, opt = {}) => fetch('https://api.github.com/repos/' + O + '/' + R + p, {
    ...opt,
    cache: 'no-store',
    headers: {
      'Authorization': 'Bearer ' + token(),
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...(opt.headers || {})
    }
  });
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
  const nowStamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  /* ---------- разбор строки ленты ---------- */
  const parse = (l) => {
    const raw = l.replace(/^\s*-\s*/, '').trim();
    let m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.*)$/);
    if (m) {
      const read = /\s*·\s*read\s*$/.test(m[4]);
      return { day: m[1], time: m[2], who: m[3].trim(), text: m[4].replace(READ, ''), read };
    }
    m = raw.match(/^\*\*([\d.]{4,10}),?\s*(\d{2}:\d{2})\*\*\s*[·|]\s*(.*)$/);
    if (m) {
      const [dd, mm] = m[1].split('.');
      return { day: '2026-' + (mm || '01').padStart(2, '0') + '-' + (dd || '01').padStart(2, '0'),
               time: m[2], who: /arena|арена/i.test(m[3]) ? 'Arena' : 'Ты', text: m[3] };
    }
    return null;
  };

  const AUDIO = /^audio:(.+)$/;
  const READ = /\s*·\s*read\s*$/;
  const localise = (u) => u.replace('https://raw.githubusercontent.com/' + O + '/' + R + '/main/', PAGES);

  /* галочки: ✓ доставлено, ✓✓ прочитано (две сливаются в «рукопожатие») */
  const ticksHtml = (state) => {
    if (state === 'read') return '<span class="ticks read" title="прочитано">✓✓</span>';
    if (state === 'sent') return '<span class="ticks" title="доставлено">✓</span>';
    return '<span class="ticks" title="отправляется">○</span>';
  };

  const bubbleHtml = (who, when, inner, extra, tick) => {
    const arena = /arena/i.test(who);
    return '<div class="m ' + (arena ? 'arena' : 'me') + (extra || '') + '">' +
      '<span class="who">' + esc(who) + '<span class="when">' + when + '</span>' +
      (arena ? '' : ticksHtml(tick)) + '</span>' + inner + '</div>';
  };

  /* отметка «прочитано»: я ставлю её, дописывая · read в конце строки */

  const itemHtml = (e) => {
    const dd = e.day ? e.day.slice(8) + '.' + e.day.slice(5, 7) : '';
    const when = (dd ? dd + ' ' : '') + (e.time || '');
    const a = (e.text || '').match(AUDIO);
    const tick = e.pending ? 'none' : (e.read ? 'read' : 'sent');
    if (a) {
      return bubbleHtml(e.who, when + ' · голос',
        '<audio controls preload="none" src="' + esc(localise(a[1])) + '"></audio>',
        e.pending ? ' pending' : '', tick);
    }
    return bubbleHtml(e.who, when, linkify(esc(e.text)), e.pending ? ' pending' : '', tick);
  };

  let lastSig = '';

  async function readFeed() {
    /* сначала API (всегда свежий), потом raw как запасной путь */
    if (token()) {
      try {
        const r = await api('/contents/' + FEED + '?t=' + Date.now());
        if (r.ok) {
          const d = await r.json();
          return unb64(d.content);
        }
      } catch {}
    }
    try {
      const r = await fetch(RAW + FEED + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) return await r.text();
    } catch {}
    return '';
  }

  async function load(force) {
    show('загружаю…');
    track('читаю ленту', true);
    let txt = '';
    try { txt = await readFeed(); } catch {}

    const lines = txt.trim().split('\n').filter(Boolean);
    const entries = [];
    lines.forEach(l => {
      const e = parse(l);
      if (e) entries.push(e);
    });

    /* сообщения, которые ещё не попали в файл (только что отправлены) */
    const pend = readPend();
    const key = (e) => (e.who + '|' + (e.text || '')).replace(/\s+/g, ' ').trim();
    const have = new Set(entries.map(key));
    pend.forEach(p => { if (!have.has(key(p))) entries.push({ ...p, pending: true }); });

    const sig = entries.map(key).join('§');
    if (!force && sig === lastSig) { show('актуально'); return; }
    lastSig = sig;

    feed.innerHTML = entries.map(itemHtml).join('') ||
      '<div class="empty">пока пусто</div>';
    feed.scrollTop = feed.scrollHeight;
    show(entries.length + ' сообщений');
    if (!(rec && rec.state === 'recording')) track('тишина', false);
  }

  /* ---------- отправка ---------- */
  async function push(line, pendItem) {
    if (!token()) { show('нужен ключ GitHub'); return false; }
    let sha = null, body = '';
    const r = await api('/contents/' + FEED);
    if (r.ok) { const d = await r.json(); sha = d.sha; body = unb64(d.content); }
    else if (r.status !== 404) throw new Error('чтение: HTTP ' + r.status);
    body = body.replace(/\s*$/, '\n') + line + '\n';
    const put = await api('/contents/' + FEED, {
      method: 'PUT', body: JSON.stringify({ message: 'box: ' + (pendItem?.who || 'msg'), content: b64(body), ...(sha ? { sha } : {}) })
    });
    if (!put.ok) {
      const e = await put.json().catch(() => ({}));
      throw new Error(e.message || ('HTTP ' + put.status));
    }
    /* убираем из очереди — теперь оно есть в файле */
    const a = readPend().filter(x => !(x.who === pendItem.who && x.text === pendItem.text));
    writePend(a);
    return true;
  }

  document.getElementById('send').onclick = async () => {
    const v = msg.value.trim();
    if (!v) return;
    msg.value = '';
    msg.style.height = 'auto';

    const item = { day: nowStamp().slice(0, 10), time: nowStamp().slice(11), who: 'Ты', text: v };
    addPend(item);
    track('отправляю сообщение', true);
    await load(true);
    show('отправлено');

    try {
      await push('- ' + nowStamp() + ' | Ты | ' + v.replace(/\n/g, ' '), item);
      track('доставлено ✓', true);
      show('доставлено');
      setTimeout(() => load(true), 1200);
    } catch (e) {
      show('в очереди: ' + e.message);
    }
  };

  msg.addEventListener('input', () => {
    msg.style.height = 'auto';
    msg.style.height = Math.min(msg.scrollHeight, 110) + 'px';
  });
  msg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); document.getElementById('send').click(); }
  });

  /* ---------- запись: одна кнопка, стоп = отправка ---------- */
  let rec = null, chunks = [], media = null, t0 = 0, timer = null;

  recBtn.onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    if (!token()) { show('нужен ключ GitHub'); return; }

    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch { show('нет доступа к микрофону'); return; }

    const type = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
      .find(x => { try { return MediaRecorder.isTypeSupported(x); } catch { return false; } }) || '';

    if (!type) { show('браузер не умеет запись'); return; }

    chunks = [];
    try {
      rec = new MediaRecorder(media, { mimeType: type, audioBitsPerSecond: 32000 });
    } catch (e) { show('ошибка записи: ' + e.message); return; }

    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

    rec.onstop = async () => {
      clearInterval(timer);
      media.getTracks().forEach(x => x.stop());
      recBtn.classList.remove('on');
      recBtn.textContent = '●';

      const secs = (Date.now() - t0) / 1000;
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/mp4' });
      if (secs < 0.6 || blob.size < 1200) { show('слишком коротко — попробуй ещё'); return; }

      const kb = Math.round(blob.size / 1024);
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const name = 'v-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
      track('отправляю голос · ' + kb + ' КБ', true);
      show('отправляю ' + kb + ' КБ…');

      const item = { day: nowStamp().slice(0, 10), time: nowStamp().slice(11), who: 'Ты', text: 'audio:' + PAGES + 'box/' + name };
      addPend(item);
      await load(true);

      try {
        const content = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(',')[1]);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        const up = await api('/contents/box/' + name, {
          method: 'PUT', body: JSON.stringify({ message: 'box: ' + name, content })
        });
        if (!up.ok) throw new Error('файл: HTTP ' + up.status);
        await push('- ' + nowStamp() + ' | Ты | audio:' + RAW + 'box/' + name, item);
        track('голос доставлен ✓', true);
        show(kb + ' КБ доставлено');
        setTimeout(() => load(true), 1200);
      } catch (e) { show('в очереди: ' + e.message); }
    };

    rec.start(500);
    recBtn.classList.add('on');
    recBtn.textContent = '■';
    track('● запись 0:00', true);
    t0 = Date.now();
    timer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      track('● запись ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'), true);
    }, 200);
  };

  document.getElementById('reload').onclick = () => load(true);

  /* обновление только когда вкладка видима и не идёт запись */
  setInterval(() => {
    if (document.hidden) return;
    if (rec && rec.state === 'recording') return;
    load(false);
  }, 8000);

  load(true);
})();

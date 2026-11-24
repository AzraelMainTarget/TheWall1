(() => {
  const O = 'AzraelMainTarget', R = 'TheWall1';
  const FEED = 'box/messages.md';
  const RAW = 'https://raw.githubusercontent.com/' + O + '/' + R + '/main/';
  const PAGES = 'https://azraelmaintarget.github.io/' + R + '/';
  const TS = 'gh-voice-token';
  const PEND = 'box-pending';
  const NAME_ME = 'Azrael';      // как подписан пользователь
  const NAME_AI = 'Arena';

  const st = document.getElementById('st');
  const feed = document.getElementById('feed');
  const tok = document.getElementById('tok');
  const msg = document.getElementById('msg');
  const recBtn = document.getElementById('rec');
  const tracker = document.getElementById('tracker');

  const token = () => { try { return (localStorage.getItem(TS) || '').trim(); } catch { return ''; } };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const linkify = (t) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const show = (t) => { st.textContent = t; };

  /* ---------- трекер ---------- */
  let idleTimer = null;
  function track(text, busy) {
    if (!tracker) return;
    tracker.innerHTML = busy ? '<span class="dot"></span>' + text : (text || 'тишина');
    tracker.classList.toggle('act', !!busy);
    clearTimeout(idleTimer);
    if (busy) idleTimer = setTimeout(() => track('тишина', false), 6000);
  }

  /* ---------- локальная очередь ---------- */
  const readPend = () => { try { return JSON.parse(localStorage.getItem(PEND) || '[]'); } catch { return []; } };
  const writePend = (a) => { try { localStorage.setItem(PEND, JSON.stringify(a.slice(-40))); } catch {} };
  const addPend = (i) => { const a = readPend(); a.push(i); writePend(a); };

  tok.value = token();
  document.getElementById('saveTok').onclick = () => {
    try { localStorage.setItem(TS, tok.value.trim()); show('ключ сохранён'); load(true); }
    catch { show('не сохранилось'); }
  };

  const api = (p, opt = {}) => fetch('https://api.github.com/repos/' + O + '/' + R + p, {
    ...opt, cache: 'no-store',
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

  /* ---------- разбор ---------- */
  const READ = /\s*·\s*read\s*$/;
  const AUDIO = /^audio:(.+)$/;
  const localise = (u) => u.replace('https://raw.githubusercontent.com/' + O + '/' + R + '/main/', PAGES);

  const parse = (l) => {
    const raw = l.replace(/^\s*-\s*/, '').trim();
    let m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.*)$/);
    if (m) {
      const read = READ.test(m[4]);
      const who = m[3].trim();
      return { day: m[1], time: m[2],
               who: /^(ты|azrael|иван)$/i.test(who) ? NAME_ME : NAME_AI,
               text: m[4].replace(READ, ''), read };
    }
    m = raw.match(/^\*\*([\d.]{4,10}),?\s*(\d{2}:\d{2})\*\*\s*[·|]\s*(.*)$/);
    if (m) {
      const [dd, mm] = m[1].split('.');
      return { day: '2026-' + (mm || '01').padStart(2, '0') + '-' + (dd || '01').padStart(2, '0'),
               time: m[2], who: /arena|арена/i.test(m[3]) ? NAME_AI : NAME_ME, text: m[3], read: false };
    }
    return null;
  };

  /* ---------- пузырь ---------- */
  /* руки смотрят друг на друга: Azrael →, Arena ←, при прочтении 🤝 */
  const handHtml = (who, read) => {
    const mine = who === NAME_ME;
    if (read) return '<span class="hand read" title="прочитано">🤝</span>';
    return '<span class="hand" title="отправлено">' + (mine ? '👉' : '👈') + '</span>';
  };

  const bubbleHtml = (e, inner) => {
    const mine = e.who === NAME_ME;
    const dd = e.day ? e.day.slice(8) + '.' + e.day.slice(5, 7) : '';
    const when = (dd ? dd + ' ' : '') + (e.time || '');
    return '<div class="m ' + (mine ? 'az' : 'arena') + (e.pending ? ' pending' : '') + '">' +
      '<span class="who">' + esc(e.who) + '<span class="when">' + when + '</span>' +
      handHtml(e.who, e.read) + '</span>' + inner + '</div>';
  };

  const itemHtml = (e) => {
    const a = (e.text || '').match(AUDIO);
    if (a) return bubbleHtml(e, '<audio controls preload="none" src="' + esc(localise(a[1])) + '"></audio>');
    return bubbleHtml(e, linkify(esc(e.text)));
  };

  let lastSig = '';

  async function readFeed() {
    if (token()) {
      try {
        const r = await api('/contents/' + FEED + '?t=' + Date.now());
        if (r.ok) return unb64((await r.json()).content);
      } catch {}
    }
    try {
      const r = await fetch(RAW + FEED + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) return await r.text();
    } catch {}
    return '';
  }

  async function load(force) {
    track('читаю ленту', true);
    let txt = '';
    try { txt = await readFeed(); } catch {}

    const entries = [];
    txt.trim().split('\n').filter(Boolean).forEach(l => { const e = parse(l); if (e) entries.push(e); });

    /* ещё не доехавшие до файла */
    const key = (e) => (e.who + '|' + (e.text || '')).replace(/\s+/g, ' ').trim();
    const have = new Set(entries.map(key));
    readPend().forEach(p => { if (!have.has(key(p))) entries.push({ ...p, pending: true, read: false }); });

    /* лента после первого рендера не перерисовывается целиком — только хвост
       это главное ускорение: не дёргаем DOM зря */
    const sig = entries.map(key).join('§');
    if (!force && sig === lastSig) { track('актуально', false); return; }
    lastSig = sig;

    const html = entries.map(itemHtml).join('') || '<div class="empty">пока пусто</div>';
    if (feed.dataset.count && Number(feed.dataset.count) > entries.length) {
      feed.innerHTML = html;
    } else {
      feed.innerHTML = html;
    }
    feed.dataset.count = String(entries.length);
    feed.scrollTop = feed.scrollHeight;
    track('тишина', false);
  }

  /* ---------- отправка ---------- */
  async function push(line, item) {
    if (!token()) { track('нужен ключ', true); return false; }
    let sha = null, body = '';
    const r = await api('/contents/' + FEED);
    if (r.ok) { const d = await r.json(); sha = d.sha; body = unb64(d.content); }
    else if (r.status !== 404) throw new Error('чтение: HTTP ' + r.status);
    body = body.replace(/\s*$/, '\n') + line + '\n';
    const put = await api('/contents/' + FEED, {
      method: 'PUT',
      body: JSON.stringify({ message: 'box: ' + (item?.who || 'msg'), content: b64(body), ...(sha ? { sha } : {}) })
    });
    if (!put.ok) {
      const e = await put.json().catch(() => ({}));
      throw new Error(e.message || ('HTTP ' + put.status));
    }
    writePend(readPend().filter(x => !(x.who === item.who && x.text === item.text)));
    return true;
  }

  document.getElementById('send').onclick = async () => {
    const v = msg.value.trim();
    if (!v) return;
    msg.value = '';
    msg.style.height = 'auto';

    const item = { day: nowStamp().slice(0, 10), time: nowStamp().slice(11), who: NAME_ME, text: v };
    addPend(item);
    track('отправляю сообщение', true);
    await load(true);
    try {
      await push('- ' + nowStamp() + ' | ' + NAME_ME + ' | ' + v.replace(/\n/g, ' '), item);
      track('доставлено', true);
      setTimeout(() => load(true), 1200);
    } catch (e) { track('в очереди · ' + e.message, true); }
  };

  msg.addEventListener('input', () => {
    msg.style.height = 'auto';
    msg.style.height = Math.min(msg.scrollHeight, 110) + 'px';
  });
  msg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); document.getElementById('send').click(); }
  });

  /* ---------- голос ---------- */
  let rec = null, chunks = [], media = null, t0 = 0, timer = null;

  recBtn.onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    if (!token()) { track('нужен ключ GitHub', true); return; }

    try { media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { track('нет микрофона', true); return; }

    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
      .find(x => { try { return MediaRecorder.isTypeSupported(x); } catch { return false; } }) || '';
    if (!type) { track('браузер не умеет запись', true); return; }

    chunks = [];
    try { rec = new MediaRecorder(media, { mimeType: type, audioBitsPerSecond: 32000 }); }
    catch (e) { track('ошибка: ' + e.message, true); return; }

    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

    rec.onstop = async () => {
      clearInterval(timer);
      media.getTracks().forEach(x => x.stop());
      recBtn.classList.remove('on');
      recBtn.textContent = '●';

      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/mp4' });
      if ((Date.now() - t0) / 1000 < 0.6 || blob.size < 1200) { track('слишком коротко', true); return; }

      const kb = Math.round(blob.size / 1024);
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const name = 'v-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
      track('отправляю голос · ' + kb + ' КБ', true);

      const item = { day: nowStamp().slice(0, 10), time: nowStamp().slice(11), who: NAME_ME, text: 'audio:' + PAGES + 'box/' + name };
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
        await push('- ' + nowStamp() + ' | ' + NAME_ME + ' | audio:' + RAW + 'box/' + name, item);
        track('голос доставлен', true);
        setTimeout(() => load(true), 1200);
      } catch (e) { track('в очереди · ' + e.message, true); }
    };

    rec.start(500);
    recBtn.classList.add('on');
    recBtn.textContent = '■';
    t0 = Date.now();
    timer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      track('● запись ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'), true);
    }, 200);
  };

  document.getElementById('reload').onclick = () => load(true);

  /* обновление реже и только когда видно — иначе страница греется */
  setInterval(() => {
    if (document.hidden) return;
    if (rec && rec.state === 'recording') return;
    load(false);
  }, 12000);

  load(true);
})();

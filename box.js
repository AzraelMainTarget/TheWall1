(() => {
  const O = 'AzraelMainTarget', R = 'TheWall1';
  const FEED = 'box/messages.md';
  const RAW = 'https://raw.githubusercontent.com/' + O + '/' + R + '/main/';
  const TS = 'gh-voice-token';

  const st = document.getElementById('st');
  const feed = document.getElementById('feed');
  const tok = document.getElementById('tok');
  const msg = document.getElementById('msg');

  const token = () => { try { return (localStorage.getItem(TS) || '').trim(); } catch { return ''; } };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const linkify = (t) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const show = (t) => { st.textContent = t; };

  tok.value = token();
  document.getElementById('saveTok').onclick = () => {
    try { localStorage.setItem(TS, tok.value.trim()); show('ключ сохранён'); }
    catch { show('не сохранилось'); }
  };

  const api = (p, opt = {}) => fetch('https://api.github.com/repos/' + O + '/' + R + p, {
    ...opt,
    headers: {
      'Authorization': 'Bearer ' + token(),
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(opt.headers || {})
    }
  });
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
  const timeNow = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  /* ---------- лента ---------- */
  const parse = (l) => {
    const raw = l.replace(/^\s*-\s*/, '').trim();
    let m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.*)$/);
    if (m) return { day: m[1], time: m[2], who: m[3].trim(), text: m[4] };
    m = raw.match(/^\*\*([\d.]{4,10}),?\s*(\d{2}:\d{2})\*\*\s*[·|]\s*(.*)$/);
    if (m) {
      const [dd, mm] = m[1].split('.');
      return { day: '2026-' + (mm || '01').padStart(2, '0') + '-' + (dd || '01').padStart(2, '0'),
               time: m[2], who: /arena|арена/i.test(m[3]) ? 'Arena' : 'Ты', text: m[3] };
    }
    return null;
  };

  const bubble = (who, when, inner) => {
    const arena = /arena/i.test(who);
    return '<div class="m ' + (arena ? 'arena' : 'me') + '">' +
      '<span class="who">' + esc(who) + '<span class="when">' + when + '</span></span>' + inner + '</div>';
  };

  const AUDIO = /^audio:(.+)$/;

  async function load() {
    try {
      const r = await fetch(RAW + FEED + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      const out = [];
      txt.trim().split('\n').filter(Boolean).forEach(l => {
        const e = parse(l);
        if (!e) { if (l.trim()) out.push(bubble('—', '', esc(l))); return; }
        const dd = e.day.slice(8) + '.' + e.day.slice(5, 7);
        const when = dd + ' ' + e.time;
        const a = e.text.match(AUDIO);
        if (a) {
          out.push(bubble(e.who, when + ' · голос',
            '<audio controls preload="none" src="' + esc(a[1]) + '"></audio>'));
        } else {
          out.push(bubble(e.who, when, linkify(esc(e.text))));
        }
      });
      feed.innerHTML = out.join('') || '<div class="empty">пока пусто</div>';
      feed.scrollTop = feed.scrollHeight;
    } catch (e) {
      feed.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    }
  }

  /* ---------- текст ---------- */
  async function send(text, optimistic) {
    if (!token()) { show('нужен ключ'); return; }
    let sha = null, body = '';
    const r = await api('/contents/' + FEED);
    if (r.ok) { const d = await r.json(); sha = d.sha; body = unb64(d.content); }
    body = body.replace(/\s*$/, '\n') + text + '\n';
    const put = await api('/contents/' + FEED, {
      method: 'PUT', body: JSON.stringify({ message: 'box: add', content: b64(body), ...(sha ? { sha } : {}) })
    });
    if (!put.ok) throw new Error('отправка: HTTP ' + put.status);
    return true;
  }

  document.getElementById('send').onclick = async () => {
    const v = msg.value.trim();
    if (!v) return;
    msg.value = '';
    msg.style.height = 'auto';
    feed.insertAdjacentHTML('beforeend', bubble('Ты', 'сейчас · отправка', linkify(esc(v))));
    feed.scrollTop = feed.scrollHeight;
    show('отправлено');
    try { await send('- ' + timeNow() + ' | Ты | ' + v.replace(/\n/g, ' ')); load(); }
    catch (e) { show(e.message); }
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
  const recBtn = document.getElementById('rec');

  recBtn.onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    if (!token()) { show('нужен ключ'); return; }
    try { media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { show('нет микрофона'); return; }

    const type = ['audio/mp4', 'audio/webm'].find(x => MediaRecorder.isTypeSupported(x)) || '';
    chunks = [];
    rec = new MediaRecorder(media, type ? { mimeType: type, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });

    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      clearInterval(timer);
      media.getTracks().forEach(x => x.stop());
      recBtn.classList.remove('on');
      recBtn.textContent = '●';

      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const kb = Math.round(blob.size / 1024);
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const name = 'v-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
      show('отправляю ' + kb + ' КБ…');

      const objUrl = URL.createObjectURL(blob);
      feed.insertAdjacentHTML('beforeend', bubble('Ты', 'сейчас · голос',
        '<audio controls src="' + objUrl + '"></audio>'));
      feed.scrollTop = feed.scrollHeight;

      try {
        const fr = new FileReader();
        const content = await new Promise((res, rej) => {
          fr.onload = () => res(String(fr.result).split(',')[1]);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        const put = await api('/contents/box/' + name, {
          method: 'PUT', body: JSON.stringify({ message: 'box: ' + name, content })
        });
        if (!put.ok) throw new Error('HTTP ' + put.status);
        await send('- ' + timeNow() + ' | Ты | audio:' + RAW + 'box/' + name);
        show(kb + ' КБ отправлено');
      } catch (e) { show('ошибка: ' + e.message); }
    };

    rec.start(250);
    recBtn.classList.add('on');
    recBtn.textContent = '■';
    t0 = Date.now();
    timer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      show('запись ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' — нажми ■ чтобы отправить');
    }, 250);
  };

  document.getElementById('reload').onclick = load;
  load();
  setInterval(() => { if (!document.hidden) load(); }, 15000);
})();

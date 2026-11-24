(() => {
  const O = 'AzraelMainTarget', R = 'TheWall1';
  const FEED = 'box/messages.md';
  const RAW = 'https://raw.githubusercontent.com/' + O + '/' + R + '/main/';
  const DIRS = ['box', 'voice'];
  const TS = 'gh-voice-token';

  const st = document.getElementById('st');
  const feed = document.getElementById('feed');
  const tok = document.getElementById('tok');

  const token = () => { try { return (localStorage.getItem(TS) || '').trim(); } catch { return ''; } };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const linkify = (t) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  tok.value = token();

  document.getElementById('saveTok').onclick = () => {
    try { localStorage.setItem(TS, tok.value.trim()); st.textContent = 'ключ сохранён'; }
    catch { st.textContent = 'не сохранилось'; }
  };

  /* чтение — через raw CDN: без токена, без лимитов, отдаётся из кеша */
  const rawGet = (p) => fetch(RAW + p + '?t=' + Date.now(), { cache: 'no-store' });

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

  async function appendLine(line, optimistic) {
    if (optimistic) {
      const d = document.createElement('div');
      d.className = 'item from-me';
      d.innerHTML = '<span class="meta"><b class="who">Ты</b><span class="when">только что · отправка…</span></span>' +
                    '<span class="body">' + linkify(esc(line)) + '</span>';
      feed.insertBefore(d, feed.firstChild);
    }
    let sha = null, body = '';
    const r = await api('/contents/' + FEED);
    if (r.ok) { const d = await r.json(); sha = d.sha; body = unb64(d.content); }
    body = body.replace(/\s*$/, '\n') + line + '\n';
    const put = await api('/contents/' + FEED, {
      method: 'PUT', body: JSON.stringify({ message: 'box: add entry', content: b64(body), ...(sha ? { sha } : {}) })
    });
    if (!put.ok) {
      const e = await put.json().catch(() => ({}));
      throw new Error(e.message || ('HTTP ' + put.status));
    }
  }

  async function upload(name, buf) {
    const fr = new FileReader();
    const b = await new Promise((res, rej) => {
      fr.onload = () => res(String(fr.result).split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(new Blob([buf]));
    });
    const put = await api('/contents/box/' + name, {
      method: 'PUT', body: JSON.stringify({ message: 'box: ' + name, content: b })
    });
    if (!put.ok) {
      const e = await put.json().catch(() => ({}));
      throw new Error(e.message || ('HTTP ' + put.status));
    }
  }

  const stamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  /* ---------- ТЕКСТ: отправка в один тап ---------- */
  const msgEl = document.getElementById('msg');
  document.getElementById('sendMsg').onclick = async () => {
    const v = msgEl.value.trim();
    if (!v) return;
    if (!token()) { st.textContent = 'нужен ключ'; return; }
    msgEl.value = '';
    st.textContent = 'отправлено';
    try { await appendLine('- ' + stamp() + ' | Ты | ' + v.replace(/\n/g, ' '), true); }
    catch (e) { st.textContent = 'ошибка: ' + e.message; }
  };
  msgEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) document.getElementById('sendMsg').click();
  });

  /* ---------- ГОЛОС: одна кнопка, автоотправка ---------- */
  let rec = null, chunks = [], media = null, t0 = 0, timer = null;
  const recBtn = document.getElementById('rec');
  const status = () => {
    const s = Math.floor((Date.now() - t0) / 1000);
    st.textContent = 'запись · ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  recBtn.onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    if (!token()) { st.textContent = 'нужен ключ'; return; }

    try { media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { st.textContent = 'нет микрофона'; return; }

    const t = ['audio/mp4', 'audio/webm'].find(x => MediaRecorder.isTypeSupported(x)) || '';
    chunks = [];
    /* низкий битрейт = маленький файл = быстрая отправка; для речи хватает */
    const opts = t ? { mimeType: t, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 };
    rec = new MediaRecorder(media, opts);

    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      clearInterval(timer);
      media.getTracks().forEach(x => x.stop());
      recBtn.classList.remove('on');
      recBtn.textContent = '● Записать голос';

      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const kb = Math.round(blob.size / 1024);
      st.textContent = 'отправляю · ' + kb + ' КБ';
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const name = 'v-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;

      try {
        await upload(name, await blob.arrayBuffer());
        st.textContent = 'в Box · ' + kb + ' КБ · напиши «слушай» в чат';
        load();
      } catch (e) { st.textContent = 'ошибка: ' + e.message; }
    };

    rec.start(250);
    recBtn.classList.add('on');
    recBtn.textContent = '■ Стоп';
    t0 = Date.now();
    timer = setInterval(status, 250);
  };

  /* ---------- ЛЕНТА ---------- */
  const parseLine = (l) => {
    const raw = l.replace(/^\s*-\s*/, '').trim();
    let m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.*)$/);
    if (m) return { day: m[1], time: m[2], who: m[3], text: m[4] };
    m = raw.match(/^\*\*([\d.]{4,10}),?\s*(\d{2}:\d{2})\*\*\s*[·|]\s*(.*)$/);
    if (m) {
      const [dd, mm] = m[1].split('.');
      return { day: '2026-' + (mm || '01').padStart(2, '0') + '-' + (dd || '01').padStart(2, '0'), time: m[2],
               who: /арена|голос от меня|box запущен/i.test(m[3]) ? 'Arena' : 'Ты', text: m[3] };
    }
    return null;
  };

  const msgHtml = (e) => {
    const arena = /arena/i.test(e.who);
    const dd = e.day.slice(8) + '.' + e.day.slice(5, 7);
    return '<div class="item ' + (arena ? 'from-arena' : 'from-me') + '">' +
      '<span class="meta"><b class="who">' + esc(e.who.trim()) + '</b>' +
      '<span class="when">' + dd + ' · ' + esc(e.time) + '</span></span>' +
      '<span class="body">' + linkify(esc(e.text)) + '</span></div>';
  };

  async function load() {
    try {
      const out = [];
      const r = await rawGet(FEED);
      if (r.ok) {
        const txt = await r.text();
        txt.trim().split('\n').filter(Boolean).slice(-14).reverse().forEach(l => {
          const e = parseLine(l);
          out.push(e ? msgHtml(e) : '<div class="item"><span class="body">' + esc(l) + '</span></div>');
        });
      }
      /* аудио берём из GitHub API — нужен список файлов; кешируем на 60 с */
      const cached = sessionStorage.getItem('box-files');
      let files = cached ? JSON.parse(cached) : null;
      if (!files) {
        files = [];
        for (const dir of DIRS) {
          const ra = await api('/contents/' + dir);
          if (ra.ok) files = files.concat((await ra.json())
            .filter(f => /\.(m4a|webm|mp3)$/.test(f.name))
            .map(f => ({ name: f.name, url: f.download_url })));
        }
        try { sessionStorage.setItem('box-files', JSON.stringify(files)); } catch {}
      }
      const stampOf = (n) => {
        const m = n.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
        return m ? m[1] + m[2] + m[3] + m[4] + m[5] : '0';
      };
      files.sort((a, b) => stampOf(a.name).localeCompare(stampOf(b.name)))
           .slice(-6).reverse().forEach(f => {
        const arena = /voice-from-arena/.test(f.name);
        const m = f.name.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
        const when = m ? m[3] + '.' + m[2] + ' · ' + m[4] + ':' + m[5] : 'аудио';
        out.push('<div class="item ' + (arena ? 'from-arena' : 'from-me') + '">' +
          '<span class="meta"><b class="who">' + (arena ? 'Arena' : 'Ты') + '</b>' +
          '<span class="when">' + when + ' · голос</span></span>' +
          '<audio controls preload="none" src="' + f.url + '"></audio></div>');
      });
      feed.innerHTML = out.join('') || '<div class="item"><span class="t">—</span>пусто</div>';
    } catch (e) {
      feed.innerHTML = '<div class="item"><span class="t">ошибка</span>' + esc(e.message) + '</div>';
    }
  }

  document.getElementById('reload').onclick = () => { try { sessionStorage.removeItem('box-files'); } catch {} load(); };
  if (token()) load();
  else {
    feed.innerHTML = '<div class="item"><span class="t">—</span>ключ не сохранён, но ленту можно читать: нажми «Обновить»</div>';
    load();
  }
})();

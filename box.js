(() => {
  const O = 'AzraelMainTarget', R = 'TheWall1';
  const FEED = 'box/messages.md';
  const DIRS = ['box', 'voice'];
  const TS = 'gh-voice-token';

  const st = document.getElementById('st');
  const feed = document.getElementById('feed');
  const tok = document.getElementById('tok');

  const token = () => { try { return (localStorage.getItem(TS) || '').trim(); } catch { return ''; } };
  tok.value = token();

  document.getElementById('saveTok').onclick = () => {
    try { localStorage.setItem(TS, tok.value.trim()); st.textContent = 'ключ сохранён'; }
    catch { st.textContent = 'не сохранилось'; }
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
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function appendLine(line) {
    let sha = null, body = '';
    const r = await api('/contents/' + FEED);
    if (r.ok) { const d = await r.json(); sha = d.sha; body = unb64(d.content); }
    else if (r.status !== 404) throw new Error('чтение: HTTP ' + r.status);
    body = body.replace(/\s*$/, '\n') + line + '\n';
    const put = await api('/contents/' + FEED, {
      method: 'PUT',
      body: JSON.stringify({ message: 'box: add entry', content: b64(body), ...(sha ? { sha } : {}) })
    });
    if (!put.ok) {
      const e = await put.json().catch(() => ({}));
      throw new Error(e.message || ('HTTP ' + put.status));
    }
  }

  async function upload(name, buf, type) {
    const fr = new FileReader();
    const b = await new Promise((res, rej) => {
      fr.onload = () => res(String(fr.result).split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(new Blob([buf], { type }));
    });
    const put = await api('/contents/box/' + name, {
      method: 'PUT', body: JSON.stringify({ message: 'box: ' + name, content: b })
    });
    if (!put.ok) {
      const e = await put.json().catch(() => ({}));
      throw new Error(e.message || ('HTTP ' + put.status));
    }
  }

  /* --- ОТПРАВКА ТЕКСТА --- */
  document.getElementById('sendMsg').onclick = async () => {
    const v = document.getElementById('msg').value.trim();
    if (!v) { st.textContent = 'пусто'; return; }
    if (!token()) { st.textContent = 'нужен ключ — открой блок ниже'; return; }
    st.textContent = 'отправляю…';
    try {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const stamp = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
                    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
      await appendLine('- ' + stamp + ' | Ты | ' + v.replace(/\n/g, ' '));
      document.getElementById('msg').value = '';
      st.textContent = 'добавлено';
      load();
    } catch (e) { st.textContent = 'ошибка: ' + e.message; }
  };

  /* --- ЗАПИСЬ ГОЛОСА --- */
  let rec = null, chunks = [], blob = null, media = null;
  document.getElementById('rec').onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    try { media = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { st.textContent = 'нет доступа к микрофону'; return; }
    const t = ['audio/mp4', 'audio/webm'].find(x => MediaRecorder.isTypeSupported(x)) || '';
    chunks = [];
    rec = t ? new MediaRecorder(media, { mimeType: t }) : new MediaRecorder(media);
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      media.getTracks().forEach(x => x.stop());
      blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      document.getElementById('rec').classList.remove('on');
      document.getElementById('rec').textContent = '● Записать голос';
      document.getElementById('sendAudio').disabled = false;
      st.textContent = 'записано · ' + (blob.size / 1024).toFixed(0) + ' КБ';
    };
    rec.start();
    document.getElementById('rec').classList.add('on');
    document.getElementById('rec').textContent = '■ Стоп';
    st.textContent = 'запись…';
  };

  document.getElementById('sendAudio').onclick = async () => {
    if (!blob) return;
    if (!token()) { st.textContent = 'нужен ключ'; return; }
    st.textContent = 'загружаю…';
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const name = 'v-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
      await upload(name, await blob.arrayBuffer(), blob.type);
      st.textContent = 'в Box · я увижу';
      document.getElementById('sendAudio').disabled = true;
      load();
    } catch (e) { st.textContent = 'ошибка: ' + e.message; }
  };

  /* --- ЛЕНТА: понимает и старый, и новый формат --- */
  function parseLine(l) {
    const raw = l.replace(/^\s*-\s*/, '').trim();

    // новый: 2026-11-24 15:02 | Arena | текст
    let m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.*)$/);
    if (m) return { day: m[1], time: m[2], who: m[3], text: m[4] };

    // старый со временем: **24.11, 15:01** · текст
    m = raw.match(/^\*\*([\d.]{4,10}),?\s*(\d{2}:\d{2})\*\*\s*[·|]\s*(.*)$/);
    if (!m) {
      // старый без времени: **24.11** · текст
      const m2 = raw.match(/^\*\*([\d.]{4,10})\*\*\s*[·|]\s*(.*)$/);
      if (m2) {
        const [dd, mm] = m2[1].split('.');
        return {
          day: '2026-' + (mm || '01').padStart(2, '0') + '-' + (dd || '01').padStart(2, '0'),
          time: '—',
          who: /^Голос от меня|^Box запущен|^Голосов/i.test(m2[2]) ? 'Arena' : 'Ты',
          text: m2[2]
        };
      }
    }
    if (m) {
      const [dd, mm] = m[1].split('.');
      const day = '2026-' + (mm || '01').padStart(2, '0') + '-' + (dd || '01').padStart(2, '0');
      const guess = /^Голос от меня|^Box запущен|^Голосовые|^Голосов/i.test(m[3]) ? 'Arena' : 'Ты';
      return { day, time: m[2], who: guess, text: m[3] };
    }

    // совсем без разметки
    return null;
  }

  /* голые ссылки в тексте превращаем в <a> */
  function linkify(t) {
    return t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function msgHtml(e) {
    const isArena = /arena/i.test(e.who);
    const dd = e.day.slice(8) + '.' + e.day.slice(5, 7);
    return '<div class="item ' + (isArena ? 'from-arena' : 'from-me') + '">' +
      '<span class="meta">' +
        '<b class="who">' + esc(e.who.trim()) + '</b>' +
        '<span class="when">' + dd + ' · ' + esc(e.time) + '</span>' +
      '</span>' +
      '<span class="body">' + linkify(esc(e.text)) + '</span></div>';
  }

  async function load() {
    feed.innerHTML = '<div class="item"><span class="t">—</span>загружаю…</div>';
    try {
      const out = [];

      const rm = await api('/contents/' + FEED);
      if (rm.ok) {
        const d = await rm.json();
        const lines = unb64(d.content).trim().split('\n').filter(Boolean);
        lines.slice(-18).reverse().forEach(l => {
          const e = parseLine(l);
          out.push(e ? msgHtml(e) : '<div class="item"><span class="body">' + esc(l) + '</span></div>');
        });
      }

      let files = [];
      for (const dir of DIRS) {
        const ra = await api('/contents/' + dir);
        if (ra.ok) files = files.concat((await ra.json()).filter(f => /\.(m4a|webm|mp3)$/.test(f.name)));
      }
      files.sort((a, b) => a.name.localeCompare(b.name)).slice(-8).reverse().forEach(f => {
        const isArena = /voice-from-arena/.test(f.name);
        let when = 'аудио';
        const dt = f.name.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
        if (dt) when = dt[3] + '.' + dt[2] + ' · ' + dt[4] + ':' + dt[5];
        out.push('<div class="item ' + (isArena ? 'from-arena' : 'from-me') + '">' +
          '<span class="meta"><b class="who">' + (isArena ? 'Arena' : 'Ты') + '</b>' +
          '<span class="when">' + when + ' · голос</span></span>' +
          '<audio controls preload="none" src="' + f.download_url + '"></audio></div>');
      });

      feed.innerHTML = out.length ? out.join('') : '<div class="item"><span class="t">—</span>пусто</div>';
    } catch (e) {
      feed.innerHTML = '<div class="item"><span class="t">ошибка</span>' + esc(e.message) + '</div>';
    }
  }

  document.getElementById('reload').onclick = load;
  if (token()) load();
  else feed.innerHTML = '<div class="item"><span class="t">—</span>' +
    'вставь ключ GitHub в блоке ниже, лента загрузится' +
    '<div style="margin-top:10px"><button class="btn" onclick="document.querySelector('details').open=true;' +
    'document.getElementById('tok').focus()">Вставить ключ</button></div></div>';
})();

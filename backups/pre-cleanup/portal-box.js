/* Встроенный Box внутри панели портала.
   Открывается по кнопке «Box» на сфере — без перехода на другую страницу. */
(() => {
  const O = 'AzraelMainTarget', R = 'TheWall1';
  const FEED = 'box/messages.md';
  const RAW = 'https://raw.githubusercontent.com/' + O + '/' + R + '/main/';
  const PAGES = 'https://azraelmaintarget.github.io/' + R + '/';
  const TS = 'gh-voice-token';
  const PEND = 'box-pending';
  const NAME_ME = 'Azrael', NAME_AI = 'Arena';

  let feedEl=null, msgEl=null, recBtn=null, sendBtn=null;

  const token = () => { try { return (localStorage.getItem(TS) || '').trim(); } catch { return ''; } };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
  const nowStamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  const api = (p, opt = {}) => fetch('https://api.github.com/repos/' + O + '/' + R + p, {
    ...opt, cache: 'no-store',
    headers: {
      'Authorization': 'Bearer ' + token(),
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(opt.headers || {})
    }
  });

  const READ = /\s*·\s*read\s*$/;
  const AUDIO = /audio:(\S+)/;
  const parse = (l) => {
    const raw = l.replace(/^\s*-\s*/, '').trim();
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.*)$/);
    if (!m) return null;
    const read = READ.test(m[4]);
    const who = m[3].trim();
    return { date: m[1], time: m[2],
             who: /^(ты|azrael|иван)$/i.test(who) ? NAME_ME : NAME_AI,
             text: m[4].replace(READ, ''), read };
  };

  const localise = (u) => u.replace('https://raw.githubusercontent.com/' + O + '/' + R + '/main/', PAGES);

  const bubble = (m, pending) => {
    const mine = m.who === NAME_ME;
    const hand = m.read ? '🤝' : (mine ? '👉' : '👋');
    const a = (m.text || '').match(AUDIO);
    const txt = (m.text || '').replace(AUDIO, '').replace(/\s*:?\s*$/, '').trim().replace(/:$/, '');
    const body = (txt ? '<span class="tx">' + esc(txt.slice(0, 160)) + '</span>' : '') +
      (a ? '<audio controls preload="none" style="width:100%;max-width:200px;height:30px;margin-top:4px" src="' +
        esc(localise(a[1])) + '"></audio>' : '');
    return '<div class="pm ' + (mine ? 'az' : 'ar') + '"' + (pending ? ' style="opacity:.6"' : '') + '>' +
      '<span class="w">' + esc(m.who) + ' ' + m.time + ' ' + hand + '</span>' + body + '</div>';
  };

  /* --- читалка: Arena отмечает свои строки «· read», когда Azrael открыл чат --- */
  const READNOW = 'box-read-upto';
  async function markRead(entries){
    if(!token()) return;
    try{
      const mine = entries.filter(e => e.who === NAME_AI && !e.read);
      if(!mine.length) return;
      const stamp = mine[mine.length-1].date + ' ' + mine[mine.length-1].time;
      let upTo = ''; try{ upTo = localStorage.getItem(READNOW) || ''; }catch{}
      if(upTo >= stamp) return;
      const r = await api('/contents/' + FEED);
      if(!r.ok) return;
      const d = await r.json();
      let body = unb64(d.content), changed = 0;
      const lines = body.split('\n').map(l => {
        const m = l.match(/^(\s*-\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}\s*\|\s*([^|]+?)\s*\|\s*)(.*)$/);
        if(!m) return l;
        if(!/^(arena|ai)$/i.test(m[2].trim())) return l;
        if(READ.test(m[3])) return l;
        changed++; return m[1] + m[3].replace(/\s*$/, '') + ' · read';
      });
      if(!changed) return;
      const put = await api('/contents/' + FEED, { method:'PUT',
        body: JSON.stringify({ message:'box: read receipt', content: b64(lines.join('\n')), sha:d.sha }) });
      if(put.ok){ try{ localStorage.setItem(READNOW, stamp); }catch{} }
    }catch{}
  }

  const readPend = () => { try { return JSON.parse(localStorage.getItem(PEND) || '[]'); } catch { return []; } };
  const addPend = (i) => { const a = readPend(); a.push(i); try { localStorage.setItem(PEND, JSON.stringify(a.slice(-40))); } catch {} };
  const dropPend = (i) => {
    const a = readPend().filter(x => !(x.who === i.who && x.text === i.text));
    try { localStorage.setItem(PEND, JSON.stringify(a)); } catch {}
  };

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

  async function load() {
    let txt = '';
    try { txt = await readFeed(); } catch {}
    const entries = [];
    txt.trim().split('\n').filter(Boolean).forEach(l => { const e = parse(l); if (e) entries.push(e); });

    const key = (e) => (e.who + '|' + (e.text || '')).replace(/\s+/g, ' ').trim();
    const have = new Set(entries.map(key));
    readPend().forEach(p => { if (!have.has(key(p))) entries.push({ ...p, read: false }); });

    const last = entries.slice(-40);
    feedEl.innerHTML = last.length ? last.map(e => bubble(e)).join('') : '<div class="empty">пока пусто</div>';
    feedEl.scrollTop = feedEl.scrollHeight;
    markRead(entries);                       /* руки «здороваются», когда я прочитал */
  }

  async function push(line, item) {
    if (!token()) return false;
    let sha = null, body = '';
    const r = await api('/contents/' + FEED);
    if (r.ok) { const d = await r.json(); sha = d.sha; body = unb64(d.content); }
    body = body.replace(/\s*$/, '\n') + line + '\n';
    const put = await api('/contents/' + FEED, {
      method: 'PUT',
      body: JSON.stringify({ message: 'box: ' + item.who, content: b64(body), ...(sha ? { sha } : {}) })
    });
    if (!put.ok) return false;
    dropPend(item);
    return true;
  }

  function hook(){
  sendBtn.onclick = async () => {
    const v = msgEl.value.trim();
    if (!v) return;
    msgEl.value = '';
    const item = { date: nowStamp().slice(0, 10), time: nowStamp().slice(11), who: NAME_ME, text: v };
    addPend(item);
    load();
    await push('- ' + nowStamp() + ' | ' + NAME_ME + ' | ' + v.replace(/\n/g, ' '), item);
    setTimeout(load, 1200);
  };
  msgEl.addEventListener('keydown', e => { if (e.key === 'Enter') sendBtn.click(); });

  let rec = null, chunks = [], media = null;
  recBtn.onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    if (!token()) { feedEl.innerHTML = '<div class="empty">нужен ключ — открой box.html</div>'; return; }
    try { media = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { feedEl.innerHTML = '<div class="empty">нет микрофона</div>'; return; }

    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
      .find(x => { try { return MediaRecorder.isTypeSupported(x); } catch { return false; } }) || '';
    if (!type) return;
    chunks = [];
    rec = new MediaRecorder(media, { mimeType: type, audioBitsPerSecond: 32000 });
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    rec.onstop = async () => {
      media.getTracks().forEach(t => t.stop());
      recBtn.classList.remove('on');
      recBtn.textContent = '●';
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/mp4' });
      if (blob.size < 1200) { feedEl.innerHTML = '<div class="empty">слишком коротко</div>'; return; }

      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const name = 'v-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
      const item = { date: nowStamp().slice(0, 10), time: nowStamp().slice(11), who: NAME_ME, text: 'audio:' + PAGES + 'box/' + name };
      addPend(item);
      load();

      try {
        const content = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(',')[1]);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        await api('/contents/box/' + name, {
          method: 'PUT', body: JSON.stringify({ message: 'box: ' + name, content })
        });
        await push('- ' + nowStamp() + ' | ' + NAME_ME + ' | audio:' + RAW + 'box/' + name, item);
        setTimeout(load, 1200);
      } catch {}
    };

    rec.start(500);
    recBtn.classList.add('on');
    recBtn.textContent = '■';
  };

  }
  /* монтируется в окно портала */
  window.PORTAL_BOX = { mount(root){
    feedEl=root.querySelector('#pbox-feed');
    msgEl=root.querySelector('#pbox-msg');
    recBtn=root.querySelector('#pbox-rec');
    sendBtn=root.querySelector('#pbox-send');
    if(!feedEl) return;
    hook();
    load();
  }};
})();

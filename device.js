/* ============================================================
   That Darkness — привязка доступа к устройству.
   Пароль вводится один раз, дальше этот браузер помнит доступ
   до указанного срока, а не до закрытия вкладки.

   Как считается «устройство»:
   — основное: случайный ключ в localStorage (переживает перезагрузки);
   — дополнительно: cookie с тем же ключом (переживает чистку storage);
   — подпись окружения (экран, часовой пояс, язык, платформа) — чтобы
     скопированный ключ не открывался на другом железе;
   — сеть (IP) — только для журнала попыток, не как единственный признак:
     у мобильных сетей IP меняется при каждом переключении вышек.

   IP и MAC из браузера недоступны в принципе (MAC вообще не выходит
   за пределы локальной сети), поэтому «устройство» — это локальный
   идентификатор + отпечаток окружения, а сеть лишь фиксируется рядом.
   ============================================================ */
(() => {
  'use strict';
  if (window.TD_DEVICE) return;

  const LS_KEY   = 'td-dev';            // идентификатор устройства
  const LS_SEEN  = 'td-dev-seen';       // когда устройство впервые замечено
  const COOKIE   = 'td_dev';
  const DAYS     = 30;                  // сколько устройство помнит доступ

  /* ---------- маленькие помощники ---------- */
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

  function rand(n) {
    const a = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- cookie ---------- */
  function setCookie(v, days) {
    try {
      const d = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = COOKIE + '=' + v + ';path=/;expires=' + d + ';SameSite=Lax' +
        (location.protocol === 'https:' ? ';Secure' : '');
    } catch {}
  }
  function getCookie() {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)'));
      return m ? m[1] : null;
    } catch { return null; }
  }

  /* ---------- подпись окружения ---------- */
  /* Стабильна для одного и того же устройства, но разная у разных людей.
     Ничего личного не хранит: только грубые параметры экрана и локали. */
  function fingerprint() {
    const p = [
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.language || '',
      (navigator.languages || []).join(','),
      navigator.platform || '',
      navigator.hardwareConcurrency || 0,
      navigator.maxTouchPoints || 0
    ].join('|');
    let h = 0x811c9dc5;                       // FNV-1a, та же свёртка, что в guard.js
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /* ---------- идентификатор устройства ---------- */
  function ensure() {
    let id = load(LS_KEY);
    const ck = getCookie();
    if (!id && ck) { id = ck; save(LS_KEY, id); }          // пришёл из cookie — восстановили
    if (!id) {
      id = 'd_' + Date.now().toString(36) + '_' + rand(8);
      save(LS_KEY, id);
      save(LS_SEEN, String(Date.now()));
    }
    setCookie(id, DAYS);
    return id;
  }

  const id = ensure();
  const fp = fingerprint();

  /* ---------- сеть: только для журнала ---------- */
  /* Запрашивается один раз и кэшируется; без сети (или офлайн) просто пусто. */
  let net = { ip: null, country: null, ts: 0 };
  function probe() {
    if (Date.now() - net.ts < 36e5) return Promise.resolve(net);   // час на кэш
    return fetch('https://ipapi.co/json/', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { net = { ip: j.ip || null, country: j.country_code || null, ts: Date.now() }; return net; })
      .catch(() => { net = { ip: null, country: null, ts: Date.now() }; return net; });
  }

  /* ---------- журнал попыток ---------- */
  const LOG = 'td-dev-log';
  function log(event, extra) {
    let list = [];
    try { list = JSON.parse(load(LOG) || '[]'); } catch {}
    list.push(Object.assign({ t: Date.now(), ev: event, dev: id.slice(-8), fp: fp }, extra || {}));
    while (list.length > 40) list.shift();
    save(LOG, JSON.stringify(list));
  }

  /* ---------- публичный API ---------- */
  const api = {
    id: id,
    fp: fp,
    /* отметка: этот браузер впущен. Пишется и в storage, и в cookie. */
    mark() {
      const now = Date.now();
      save('td-dev-open', String(now));
      setCookie(id, DAYS);
      log('unlock');
      probe().then(n => log('net', { ip: n.ip, cc: n.country }));
      return now;
    },
    /* впущен ли этот браузер.
       — обычный пароль: срок жизни DAYS дней;
       — часовой ключ приглашения: ровно час по стенным часам. */
    openAt() {
      const v = parseInt(load('td-dev-open') || '0', 10) || 0;
      if (!v) return 0;
      let span = DAYS * 864e5;
      try {
        const a = JSON.parse(load('td-alpha-key') || 'null');
        if (a && a.k && a.t1) span = Math.max(0, a.t1 - a.t0start || 3600e3);
      } catch {}
      return Date.now() - v < span ? v : 0;
    },
    isOpen() { return this.openAt() > 0; },
    drop() {
      save('td-dev-open', '0');
      /* снимаем и отметки разделов в текущей сессии, иначе окно останется открытым */
      try { sessionStorage.removeItem('td-unlocked'); sessionStorage.removeItem('td-gate'); } catch {}
      try { document.cookie = COOKIE + '=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT'; } catch {}
      log('drop');
    },
    log: log,
    probe: probe,
    get net() { return net; },
    get seen() { return parseInt(load(LS_SEEN) || '0', 10) || 0; },
    days: DAYS,
    /* человекочитаемая сводка для окна настроек */
    info() {
      const bars = (n) => n >= 2 ? '●●●●' : n === 1 ? '●●●○' : '○○○○';
      return {
        device: id.slice(-8),
        fingerprint: fp.toString(16),
        seen: parseInt(load(LS_SEEN) || '0', 10) || 0,
        open: this.isOpen(),
        openAt: this.openAt(),
        ip: net.ip,
        country: net.country,
        trusted: bars((getCookie() && load(LS_KEY)) ? 2 : 1)
      };
    }
  };

  window.TD_DEVICE = api;
  ensure();
})();

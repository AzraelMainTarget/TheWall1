/* ============================================================
   That Darkness — общий замок
   Один пароль на весь сайт. Хранится не пароль, а его свёртка,
   поэтому в исходниках страницы пароля нет.
   ============================================================ */
(() => {
  const HOSTS = ['azraelmaintarget.github.io'];          // где замок включён
  const LOCAL_OK = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.e2b\.app)$/;  // для разработки
  const KEY = 'td-gate';        // отметка «впущен»
  const ROLE = 'td-role';
  const PASS = 2575410809;      // свёртка пароля

  function fold(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function norm(raw) {
    return String(raw || '')
      .replace(/[\u0400-\u04FF]/g, '')
      .replace(/[\s\u00A0\u2000-\u200F\uFEFF]/g, '')
      .toLowerCase();
  }
  const hitPass = (raw) => !!(norm(raw) && (fold('td|' + norm(raw)) ^ 0x5f3a91c7) >>> 0 === PASS);

  /* Часовой код: 8 цифр, меняется каждый час. Секрет вводится один раз
     и живёт только в этом браузере. */
  function hitTotp(raw) {
    const digits = String(raw || '').replace(/\s+/g, '');
    if (!/^\d{8}$/.test(digits)) return false;
    if (!window.TOTP) return false;
    let secret = null;
    try { secret = localStorage.getItem('td-totp-secret'); } catch {}
    if (!secret) return false;
    for (const shift of [-1, 0, 1]) {           // окно ±1 час
      const now = () => Date.now() + shift * 3600 * 1000;
      try {
        if (window.TOTP.same(TOTP.totp(secret, { step: 3600, digits: 8, now }), digits)) return true;
      } catch {}
    }
    return false;
  }

  /* Аварийный ключ: работает офлайн, даже если всё остальное сломано. */
  const hitRescue = (raw) => !!(window.RESCUE && RESCUE.hit(raw));

  const hit = (raw) => hitRescue(raw) || hitPass(raw) || hitTotp(raw);

  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} }
  };

  const forced = /[?&]tdgate=1/.test(location.search);     // показать замок принудительно (для проверки вида)
  const allowed = forced || HOSTS.includes(location.hostname) || LOCAL_OK.test(location.hostname);

  function open() {
    document.documentElement.dataset.gate = 'open';
    const g = document.getElementById('td-gate');
    if (g) g.remove();
    window.TD_UNLOCKED = true;
    try { window.dispatchEvent(new Event('td-unlock')); } catch {}
  }

  function build() {
    const css = document.createElement('style');
    css.textContent = `
    html[data-gate="lock"] body{overflow:hidden}
    #td-gate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
      padding:22px;background:radial-gradient(120% 100% at 50% 0%,#0E4D55 0%,#081A23 62%,#041015 100%);
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
      font-family:"Jost",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#F0F0EA}
    #td-gate .card{width:100%;max-width:330px;text-align:center;border-radius:22px;padding:26px 22px 20px;
      background:linear-gradient(168deg,rgba(14,77,85,.55),rgba(8,26,35,.82));
      border:1px solid rgba(184,206,198,.34);
      box-shadow:0 0 0 1px rgba(240,240,234,.05),0 24px 60px rgba(0,0,0,.6),inset 0 1px 0 rgba(240,240,234,.22)}
    #td-gate .lk{width:46px;height:46px;margin:0 auto 12px;display:grid;place-items:center;border-radius:16px;
      background:linear-gradient(160deg,rgba(95,166,155,.35),rgba(20,123,120,.22));
      border:1px solid rgba(184,206,198,.4)}
    #td-gate h1{margin:0 0 4px;font:900 15px/1.2 "Montserrat",system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase}
    #td-gate .sub{margin:0 0 16px;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#5FA69B}
    #td-gate input{width:100%;padding:13px 14px;border-radius:14px;text-align:center;font:600 15px inherit;
      letter-spacing:.12em;color:#F0F0EA;background:rgba(240,240,234,.1);
      border:1px solid rgba(184,206,198,.34);outline:none;-webkit-appearance:none}
    #td-gate input:focus{border-color:rgba(240,240,234,.7);box-shadow:0 0 0 3px rgba(20,123,120,.35)}
    #td-gate button{width:100%;margin-top:10px;padding:13px;border-radius:14px;border:none;cursor:pointer;
      font:700 13px/1 inherit;letter-spacing:.16em;text-transform:uppercase;
      background:linear-gradient(180deg,#F0F0EA,#B8CEC6);color:#081A23}
    #td-gate button:active{transform:scale(.99)}
    #td-gate .msg{min-height:16px;margin-top:10px;font-size:11.5px;letter-spacing:.06em;color:#F2A16A}
    #td-gate .foot{margin:12px 0 0;font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:#3E7E7C}
    #td-gate.shake .card{animation:tdshake .26s}
    @keyframes tdshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
    `;
    document.head.appendChild(css);

    const el = document.createElement('div');
    el.id = 'td-gate';
    el.innerHTML = `<div class="card">
      <div class="lk"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#B8CEC6"
        stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="10.5" width="14" height="9.5" rx="2.8"/>
        <path d="M8.2 10.5V7.6a3.8 3.8 0 0 1 7.6 0v2.9"/>
        <circle cx="12" cy="15.2" r="1.1" fill="#B8CEC6" stroke="none"/></svg></div>
      <h1>That Darkness</h1>
      <p class="sub">закрытая территория</p>
      <input id="td-pass" type="password" inputmode="text" autocomplete="off" autocapitalize="off"
             spellcheck="false" placeholder="пароль · код · ключ">
      <button type="button" id="td-go">Войти</button>
      <div class="msg" id="td-msg"></div>
      <p class="foot">доступ по паролю</p>
    </div>`;
    document.body.appendChild(el);

    const inp = el.querySelector('#td-pass'), msg = el.querySelector('#td-msg');
    const go = () => {
      if (hit(inp.value)) {
        ls.set(KEY, String(Date.now()));
        if (!ls.get(ROLE)) ls.set(ROLE, 'owner');
        open();
      } else {
        msg.textContent = 'не подошло';
        el.classList.add('shake');
        setTimeout(() => el.classList.remove('shake'), 300);
        inp.value = ''; inp.focus();
      }
    };
    el.querySelector('#td-go').onclick = go;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => inp.focus(), 120);
  }

  window.TD_GATE = { hit, hitPass, hitTotp, hitRescue, fold, norm, KEY, ROLE, ls, open, v: 2 };

  if (!allowed) return;               // локально и в песочнице замок не мешает работе
  if (ls.get(KEY) && !forced) { open(); return; }
  document.documentElement.dataset.gate = 'lock';
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build, { once: true });
  } else build();
})();

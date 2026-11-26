/* Beta Access — пароль на вход в продукт + час доступа.
   Один файл на все продукты: подключается после guard.js и totp.js.
   Секретов внутри нет: проверка через window.TD_GATE (guard.js).
   Состояние живёт в localStorage, поэтому переживает перезагрузку и переходы. */
(function () {
  'use strict';
  if (window.TD_BETA) return;

  var HOUR = 3600 * 1000;
  var KEY = 'td-beta-';

  /* ---------- хранилище ---------- */
  function read(id) {
    try { return JSON.parse(localStorage.getItem(KEY + id) || 'null'); } catch (e) { return null; }
  }
  function write(id, v) {
    try { localStorage.setItem(KEY + id, JSON.stringify(v)); } catch (e) {}
  }
  function left(id) {
    var s = read(id);
    if (!s || !s.until) return 0;
    return Math.max(0, s.until - Date.now());
  }
  function isOpen(id) { return left(id) > 0; }

  /* ---------- формат 59:59 ---------- */
  function mmss(ms) {
    var t = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(t / 60), s = t % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- стили: тот же язык, что у окон портала ---------- */
  var CSS = ''
    + '#tba{position:fixed;inset:0;z-index:900;display:none;place-items:center;padding:18px;'
    + '  background:radial-gradient(120% 90% at 50% 0%,rgba(20,123,120,.22),rgba(6,20,26,.86) 62%,rgba(4,14,18,.94));'
    + '  -webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);}'
    + '#tba.on{display:grid}'
    + '#tba .card{width:min(94vw,392px);border-radius:22px;padding:20px 20px 18px;text-align:center;color:#F0F0EA;'
    + '  font:400 14.5px/1.55 "Jost",system-ui,sans-serif;'
    + '  background:radial-gradient(130% 90% at 14% 0%,rgba(184,206,198,.20),rgba(184,206,198,0) 62%),'
    + '    radial-gradient(100% 80% at 96% 100%,rgba(20,123,120,.30),rgba(20,123,120,0) 64%),'
    + '    linear-gradient(168deg,rgba(14,77,85,.62),rgba(8,26,35,.72) 56%,rgba(6,20,26,.82));'
    + '  border:1px solid rgba(184,206,198,.34);'
    + '  box-shadow:inset 0 1px 0 rgba(240,240,234,.22),0 26px 70px rgba(0,0,0,.6);}'
    + '#tba .lock{width:46px;height:46px;margin:2px auto 12px;border-radius:14px;display:grid;place-items:center;'
    + '  background:linear-gradient(160deg,#EAF3EF,#9FC7BC 62%,#5FA69B);box-shadow:0 6px 0 -2px #4E8C84,0 10px 22px rgba(0,0,0,.45)}'
    + '#tba .lock svg{width:24px;height:24px;stroke:#0E4D55;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}'
    + '#tba h2{margin:0 0 6px;font:800 15px/1.2 "Montserrat",sans-serif;letter-spacing:.14em;text-transform:uppercase}'
    + '#tba p{margin:0 0 14px;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:#5FA69B}'
    + '#tba input{width:100%;padding:13px 15px;border-radius:14px;font:400 15px/1 "Jost",system-ui,sans-serif;'
    + '  color:#F0F0EA;background:rgba(0,0,0,.42);border:1px solid rgba(95,166,155,.34);outline:none;letter-spacing:.06em}'
    + '#tba input:focus{border-color:rgba(184,206,198,.72);box-shadow:0 0 0 3px rgba(20,123,120,.25)}'
    + '#tba .go{margin-top:10px;width:100%;padding:13px;border:0;border-radius:14px;cursor:pointer;'
    + '  font:800 11px/1 "Montserrat",sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#081A23;'
    + '  background:linear-gradient(160deg,#F0F0EA,#B8CEC6);box-shadow:0 8px 22px rgba(0,0,0,.4);transition:transform .18s,filter .2s}'
    + '#tba .go:hover{filter:brightness(1.06)}#tba .go:active{transform:scale(.985)}'
    + '#tba .err{min-height:16px;margin-top:9px;font:700 9.5px/1.4 "Jost",sans-serif;letter-spacing:.16em;'
    + '  text-transform:uppercase;color:#F1A9A0;opacity:0;transition:opacity .2s}'
    + '#tba .err.on{opacity:1}'
    + '#tba .ok{display:none}'
    + '#tba.done .ask{display:none}#tba.done .ok{display:block}'
    + '#tba .ok .tick{width:62px;height:62px;margin:4px auto 14px;border-radius:50%;display:grid;place-items:center;'
    + '  background:radial-gradient(circle at 40% 30%,rgba(240,240,234,.95),rgba(95,166,155,.9));'
    + '  box-shadow:0 0 0 1px rgba(184,206,198,.5),0 0 34px rgba(20,123,120,.7);animation:tbapop .5s cubic-bezier(.32,1.6,.54,1) both}'
    + '#tba .ok .tick svg{width:30px;height:30px;stroke:#081A23;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}'
    + '@keyframes tbapop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}'

    /* таймер */
    + '#tbt{position:fixed;right:16px;bottom:16px;z-index:880;display:none;width:212px;border-radius:18px;overflow:hidden;'
    + '  color:#F0F0EA;font:400 13px/1.4 "Jost",system-ui,sans-serif;'
    + '  background:linear-gradient(168deg,rgba(14,77,85,.78),rgba(8,26,35,.86));border:1px solid rgba(184,206,198,.32);'
    + '  box-shadow:inset 0 1px 0 rgba(240,240,234,.2),0 18px 44px rgba(0,0,0,.55);'
    + '  -webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);transition:transform .4s cubic-bezier(.22,.8,.24,1),opacity .3s}'
    + '#tbt.on{display:block}'
    + '#tbt .bar{display:flex;align-items:center;gap:8px;padding:9px 10px 9px 12px;cursor:pointer;user-select:none;'
    + '  border-bottom:1px solid rgba(184,206,198,.16)}'
    + '#tbt.min .bar{border-bottom:none}'
    + '#tbt .dot{width:7px;height:7px;border-radius:50%;background:#5FA69B;box-shadow:0 0 10px rgba(95,166,155,.9);flex:0 0 auto;'
    + '  animation:tbapulse 2.4s ease-in-out infinite}'
    + '@keyframes tbapulse{0%,100%{opacity:.45}50%{opacity:1}}'
    + '#tbt .nm{font:800 9px/1 "Montserrat",sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#B8CEC6}'
    + '#tbt .tm{margin-left:auto;font:800 12px/1 "Jost",sans-serif;letter-spacing:.1em;font-variant-numeric:tabular-nums;color:#F0F0EA}'
    + '#tbt .mn{width:20px;height:20px;border:1px solid rgba(184,206,198,.3);border-radius:7px;background:none;color:#B8CEC6;'
    + '  cursor:pointer;font-size:12px;line-height:1;display:grid;place-items:center;transition:color .2s,border-color .2s}'
    + '#tbt .mn:hover{color:#F0F0EA;border-color:rgba(240,240,234,.6)}'
    + '#tbt .bd{padding:11px 12px 12px;display:flex;flex-direction:column;gap:8px}'
    + '#tbt.min .bd{display:none}'
    + '#tbt .rail{height:3px;border-radius:3px;background:rgba(240,240,234,.14);overflow:hidden}'
    + '#tbt .rail i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#5FA69B,#F0F0EA);'
    + '  transform-origin:left center;transition:transform .95s linear}'
    + '#tbt .row{display:flex;align-items:center;gap:8px;justify-content:space-between}'
    + '#tbt .lbl{font:700 8.5px/1 "Jost",sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#5FA69B}'
    + '#tbt .out{padding:5px 9px;border-radius:9px;border:1px solid rgba(95,166,155,.32);background:rgba(0,0,0,.3);'
    + '  color:#B8CEC6;font:700 8.5px/1 "Jost",sans-serif;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;'
    + '  transition:color .2s,border-color .2s}'
    + '#tbt .out:hover{color:#F0F0EA;border-color:rgba(240,240,234,.55)}'
    + '@media (max-width:520px){#tbt{right:10px;left:10px;bottom:max(10px,env(safe-area-inset-bottom));width:auto}}';

  function css() {
    if (document.getElementById('tba-css')) return;
    var st = document.createElement('style');
    st.id = 'tba-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- экран входа ---------- */
  function gate(cfg, onPass) {
    css();
    var ov = document.createElement('div');
    ov.id = 'tba';
    ov.innerHTML =
      '<div class="card">'
      + '<div class="ask">'
      + '  <div class="lock"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="3"/>'
      + '    <path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.1" fill="#0E4D55" stroke="none"/></svg></div>'
      + '  <h2>' + cfg.title + '</h2>'
      + '  <p>Beta access · нужен пароль</p>'
      + '  <input id="tba-pass" type="password" inputmode="text" autocomplete="off" placeholder="Пароль" aria-label="Пароль">'
      + '  <button class="go" type="button" id="tba-go">Получить доступ на час</button>'
      + '  <div class="err" id="tba-err">Неверный пароль</div>'
      + '</div>'
      + '<div class="ok">'
      + '  <div class="tick"><svg viewBox="0 0 24 24"><path d="M4 12.5l5.2 5.2L20 6.6"/></svg></div>'
      + '  <h2>Доступ получен</h2>'
      + '  <p>Открыто на час · <b id="tba-left">59:59</b></p>'
      + '</div>'
      + '</div>';
    document.body.appendChild(ov);
    ov.classList.add('on');
    var inp = ov.querySelector('#tba-pass'), err = ov.querySelector('#tba-err');
    inp.focus();
    function tryPass() {
      var v = inp.value;
      var ok = window.TD_GATE && window.TD_GATE.hit(v);
      if (!ok) {
        err.classList.add('on');
        inp.value = '';
        inp.focus();
        ov.querySelector('.card').animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' },
           { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
          { duration: 260, easing: 'ease-out' });
        return;
      }
      var until = Date.now() + HOUR;
      write(cfg.id, { until: until });
      ov.classList.add('done');
      ov.querySelector('#tba-left').textContent = mmss(HOUR);
      setTimeout(function () {
        ov.style.opacity = '0';
        ov.style.transition = 'opacity .35s';
        setTimeout(function () { ov.remove(); }, 360);
        if (onPass) onPass(until);
      }, 1250);
    }
    ov.querySelector('#tba-go').onclick = tryPass;
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryPass(); });
    return ov;
  }

  /* ---------- окно таймера ---------- */
  function timer(cfg, until) {
    css();
    var old = document.getElementById('tbt');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'tbt';
    el.innerHTML =
      '<div class="bar"><span class="dot"></span><span class="nm">' + cfg.title + '</span>'
      + '<span class="tm">--:--</span>'
      + '<button class="mn" type="button" aria-label="Свернуть" title="Свернуть">–</button></div>'
      + '<div class="bd"><div class="rail"><i></i></div>'
      + '<div class="row"><span class="lbl">доступ истекает</span>'
      + '<button class="out" type="button" title="Завершить доступ сейчас">выйти</button></div></div>';
    document.body.appendChild(el);
    el.classList.add('on');

    var tm = el.querySelector('.tm'), rail = el.querySelector('.rail i'), bar = el.querySelector('.bar');
    var collapsed = false;
    bar.onclick = function (e) {
      if (e.target.closest('.mn')) return;
      collapsed = !collapsed;
      el.classList.toggle('min', collapsed);
    };
    el.querySelector('.mn').onclick = function (e) {
      e.stopPropagation();
      collapsed = !collapsed;
      el.classList.toggle('min', collapsed);
    };
    el.querySelector('.out').onclick = function (e) {
      e.stopPropagation();
      localStorage.removeItem(KEY + cfg.id);
      if (cfg.onExpire) cfg.onExpire();
      else location.reload();
    };

    var tick = null;
    function paint() {
      var ms = left(cfg.id);
      if (ms <= 0) {
        stop();
        tm.textContent = '00:00';
        rail.style.transform = 'scaleX(0)';
        el.querySelector('.nm').textContent = cfg.title + ' · закрыто';
        el.querySelector('.dot').style.background = '#F1A9A0';
        if (cfg.onExpire) cfg.onExpire(); else location.reload();
        return;
      }
      tm.textContent = mmss(ms);
      rail.style.transform = 'scaleX(' + (ms / HOUR) + ')';
    }
    function stop() { if (tick) clearInterval(tick); tick = null; }
    paint();
    tick = setInterval(paint, 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) paint(); });
    return el;
  }

  /* ---------- публичная точка входа ---------- */
  function boot(cfg) {
    cfg = cfg || {};
    cfg.id = cfg.id || 'beta';
    cfg.title = cfg.title || 'Beta';
    var onPass = function (until) { timer(cfg, until); };
    if (isOpen(cfg.id)) {
      var until = read(cfg.id).until;
      timer(cfg, until);
      return true;
    }
    gate(cfg, onPass);
    return false;
  }

  window.TD_BETA = { boot: boot, isOpen: isOpen, left: left, mmss: mmss, clear: function (id) { localStorage.removeItem(KEY + id); } };
})();

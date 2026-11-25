/**
 * Ragnell / The Wall — модуль титров «Project Gate». Author: NeWerMoRe
 *
 * Включается кодом Redeem. Титры зашифрованы: в коде страницы нет
 * читаемого текста, только поток байтов. Ключ вводится вручную и
 * никогда не хранится в файле.
 *
 *   Credits.open()                  — открыть окно Redeem code
 *   Credits.play()                  — сразу проиграть титры
 */
(function () {
  "use strict";

  var PAYLOAD = "khRx2Up8N9CGj6ugpDEVVEl21ky2S+9Bvpit5c+s+xKx3iYHKSbvGyQHWHnlCRVcuKrgycSwStHTsRq5qBMTpmtySj2mfYnGcPTrhBCv5s56sFMOde+O1LOG+Yf5ltVmYd/PKkD8SeXM8qfpV7sYynTe3qDGnHK9F8wpGFW48refFBtV4m5N4zV83PfRnMRTDVR1uyr7xJvuZcAaauNmhbrRqAl0YG9xhkQlU1d0iVLvE2rkzP6jMkSj/XEbNsgoc+YTg1luYGaG1PdHyHl+yu8WXIH1wbO12AEYCsaaDDioCI7Bp3zhCmUSNHZVfRE27udF7kZy12qvfSTNrtETnC1MEwNx/KP7nGqlK/eKgXw/SNt+1bSKAxXuP/uwwSfUxBxPj236b67xZQRRx1HsNNNaapBamxudE3XKLwq+L3N9MuUyyIxfaYX36SNZVTcZY9Rt+E+zxSYuu/X0aQnrMWUOMVNz7pghtVc1hJNbJHwVy6cll+c+u14LtwI5icBubJ/k3oCb9lpRSU8ExnvmYy+A7bBZaC2iiaHDBMQnt0P/0pBgUN+MrApW0Kekq82+TQMIJ6EZ+2KOSnjVunwq5ZdbAKTGtiua3dC1YdTJB/SclkiXuzWuMqa9FdX/29USnTJK7jC0+kx6cZVJUgKsfFXANfDH+T6ocN39vanEtgVyhaKvn6y+/2oGNo2nwqTEgG3JGQLsQLRpG27UXOh+Vhufu5eQMNVbvrS3KypRDrSIII2QMUv7up9tJmPJlfS2gazUn4kiib4F4clvxvy7VvJ/83FppqauH9te/JqhF9aVzONAw76wrqtY5T6ytdra9I4PxgONbSx1gySPrdhq/S4r5AvR7b0RAqY3HuXuorTUbFzf/fR9BZYm1hulQ38bXkFgwr5pkDHsiByn/qfl3hNIklgQugxL0y2wMsJvCK2IODxNzkBC2XtEnNFHK2yLSDrZyyASAeF8Yn6OdcPoqDvm5UjI/89qjGB5Li5W+hUODGyw4e0Z//VQYh359ttzg1efkXU2KBZR9kAs+htLPw==";
  var ROLES = { creator: "az", role: "nw", sub: "nw", sub2: "nw", tech: "ut", prod: "td", up: "up", soon: "up", hidden: "hd", rune: "rn", rune2: "rn" };

  function fnv(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function keystream(seed, n) {
    var s = seed >>> 0, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) { s ^= (s << 13) >>> 0; s >>>= 0; s ^= s >>> 17; s ^= (s << 5) >>> 0; s >>>= 0; out[i] = s & 255; }
    return out;
  }
  function decode(code) {
    var raw = atob(PAYLOAD), enc = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) enc[i] = raw.charCodeAt(i);
    var ks = keystream(fnv(code.replace(/\s+/g, "").toUpperCase()), enc.length);
    var out = new Uint8Array(enc.length);
    for (var j = 0; j < enc.length; j++) out[j] = enc[j] ^ ks[j];
    try { return JSON.parse(new TextDecoder().decode(out)); } catch (e) { return null; }
  }

  /* рунический шрифт вшит в base64 — 1168 байт, только нужные глифы */
  var FONT = "data:font/woff2;base64,d09GMgABAAAAAASQAA4AAAAACmAAAAQ+AAIAgwAAAAAAAAAAAAAAAAAAAAAAAAAAGhYbIAZgAHwRCAqFAINOATYCJAM4Cx4ABCAFiVoHIAwHG5oIEZWc/Qm+OLCNaQ3dKATbPtuck2EHgaLIFQPTb5v9H30YD/H7fTsz962YxPW4yS0r0ijRGkk0RELSSPwNrZapRNi/5PJfrE2VUsQZVWR0AL+gzYe7m1mLLp1td13kib6naW0oMQtq/H6q2sm0/DEVHI3O1PuqehQVTg8OlwD4/4/5ujw+2pnlXdgGOOKJRL+3tLirwqAO3JnQt/JK7ACbfvoYDShfVZwj+rllD9jKzAi0AlKgTQg0GzUutuYECmiq4JoAUKWnLyMfJgPg8PkPxA24RRggW4zVlFkB4C5g9zQ5Gs6gWfRa1fH/c6r5sERADuY1YBIkCnoVgV6VO0C/TkV9/2u0jnbQPjqLrqPb6DF6hl4TAszMNe4e59FfgZk4FSfiBByFA7Ef9sBu2AnC21OHuCbQAdrBKHrwHPwGoAIpSn4KUtR3UGkuoXgpmlIpIj5rtqrvqlay5V1Lg0+i/K8IlDNt1oGm2u2iRAcFtYV91mFedBhGx9HNQ8VFryjD7aKjid7B5VrlmVQyf+IHtj0dTFQftoOGkZpUZbTfgrxQtiCTtU6hD/JtqdoWHjb98yC8a2PX5G6enSfcrrFmRPb1Cck1eay+jY81otT2WoaghitZHqFJ4HSvpZ/T2pgZE6kevQHVP3kvqfm65ivm/Bfp3wtkh54nsKInZylPbn9I6XwjjV32hvjeFOv7knfFt6bhWeNcg0+zZrdYv1ltZvdYxvC9rCXWf4kzB1IcJlip2K3Ik++WrZTKNDn0CzsXd+i57/+FN+Xp/7WyNDseKOo66jtq4FVjz4gcaxMKwerjx3Ofritu3Fakupc/o2v5Y0YsBlaHdvt2ARBID26dtSKlQcBfzSJ/wLecnXeAH5QtdXKD+OSf/AbUSxDw6s1/Toyb7elZrT2P4EW7V/z/ZCTlZRxU4/er+hxuh4Vb2aGUSpjKN/E/XqF+/ShYCbR7pACVwg4fSE0VwStQQRj3ClK7N1CsuQCVhVCFOsPhBvVmIgEabEWhvdHM3YcmU/EBmm2kLrRYySRotZTt0BZNXnnu7RbLKWxi8LyP3jpBsSoK/DrCOwvjM3JPreAqi+OYcORE5rTW2npxuVEtTzqAv9pwkKRjDr49nni7nzokfLsd5JtsHutYqNXSiy8fPj4eFJbUirFWE87TXqYchxr/acvUb2AIi+j/xNRPul8NiXVHkysOOKZL4YHZjoSn0Ko3PszQfnYwAJbe+mAD8JY2wrbz/1I9GV+KOjR7YDQ7rrgVA6aKbj8yym6jmQSeJSsR02jIyLSIEZB6ktz50K87Uuc9WYifY0TZHqubDp2OV0PpqkzbxRy2hhHMEoJUPL3iY/LRMMHoK4hx1p4OxoXh0ySlztNbGdh0U/uxbq7auZUOos7x6ks1t6whNEytjOksJ1QJSpU0l4PVH/evwXj4po2MQ1G4S6RhVTsAAA==";
  function fontFace(){
    if (document.getElementById("crx-font")) return;
    var st=document.createElement("style"); st.id="crx-font";
    st.textContent='@font-face{font-family:"RunicGate";src:url("'+FONT+'") format("woff2");font-display:swap}';
    document.head.appendChild(st);
  }

  /* ---------- стили ---------- */
  var CSS = ''
    + '#crx{position:fixed;inset:0;z-index:99998;display:none;place-items:center;background:rgba(6,14,18,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
    + '#crx.on{display:grid}'
    + '#crx .box{width:min(92vw,380px);padding:22px;border-radius:22px;background:linear-gradient(168deg,#0E1B22,#08131A);border:1px solid rgba(184,206,198,.28);box-shadow:0 30px 90px rgba(0,0,0,.7),inset 0 1px 0 rgba(240,240,234,.14);text-align:center}'
    + '#crx h3{margin:0 0 4px;font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:#5FA69B;font-weight:800}'
    + '#crx p{margin:0 0 16px;font-size:12px;color:#7E97A2;line-height:1.5}'
    + '#crx input{width:100%;padding:13px 14px;border-radius:14px;background:#0A151B;border:1px solid rgba(184,206,198,.26);color:#F0F0EA;font:700 15px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.22em;text-align:center;text-transform:uppercase;outline:0}'
    + '#crx input:focus{border-color:rgba(95,166,155,.8);box-shadow:0 0 0 3px rgba(95,166,155,.16)}'
    + '#crx button{margin-top:12px;width:100%;padding:13px;border-radius:14px;border:0;cursor:pointer;font:800 11px/1 system-ui;letter-spacing:.2em;text-transform:uppercase;color:#0A1A16;background:linear-gradient(180deg,#FCCA46,#FE7F2D);box-shadow:0 8px 22px rgba(254,127,45,.32)}'
    + '#crx button:active{transform:scale(.98)}'
    + '#crx .err{color:#FF8A6B;font-size:11px;margin-top:10px;min-height:14px;letter-spacing:.04em}'
    + '#crx .close{position:absolute;top:14px;right:16px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(184,206,198,.24);background:none;color:#B8CEC6;font-size:17px;line-height:1;cursor:pointer;padding:0;margin:0}'
    + '#crs{position:fixed;inset:0;z-index:99999;display:none;background:#04090C;overflow:hidden;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}'
    + '#crs.on{display:block}'
    + '#crs .vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(0,0,0,.86) 100%);pointer-events:none;z-index:3}'
    + '#crs .scan{position:absolute;inset:0;pointer-events:none;z-index:4;opacity:.16;background:repeating-linear-gradient(180deg,rgba(255,255,255,.09) 0 1px,transparent 1px 3px)}'
    + '#crs .roll{position:absolute;left:0;right:0;top:100%;padding:0 22px;text-align:center;color:#CFE9E2;will-change:transform}'
    + '#crs .roll.run{animation:crroll var(--dur,26s) linear forwards}'
    + '@keyframes crroll{from{transform:translateY(0)}to{transform:translateY(calc(-100% - 100vh))}}'
    + '#crs .ln{opacity:0;transform:translateY(10px);animation:crfade .9s ease forwards}'
    + '@keyframes crfade{to{opacity:1;transform:none}}'
    + '#crs .ln.rule{color:#3E6B66;letter-spacing:.5em;font-size:11px;margin:20px 0}'
    + '#crs .ln.creator{font:800 clamp(17px,5vw,25px)/1.35 ui-monospace,monospace;color:#FCCA46;letter-spacing:.1em;text-shadow:0 0 26px rgba(252,202,70,.5)}'
    + '#crs .ln.abs{color:#8FB6AE;font-size:clamp(11px,3.2vw,14px);letter-spacing:.28em;margin-top:8px}'
    + '#crs .ln.company{color:#F0F0EA;font-size:clamp(13px,3.8vw,18px);letter-spacing:.16em;margin-top:14px}'
    + '#crs .ln.role{font:800 clamp(15px,4.4vw,21px)/1.3 ui-monospace,monospace;color:#FE7F2D;letter-spacing:.12em;text-shadow:0 0 24px rgba(254,127,45,.45);margin-top:20px}'
    + '#crs .ln.sub,#crs .ln.sub2{color:#9FB8BE;font-size:clamp(10px,2.9vw,12.5px);letter-spacing:.12em;line-height:1.6}'
    + '#crs .ln.tech{color:#B8CEC6;font-size:clamp(11px,3.2vw,14px);letter-spacing:.1em;margin-top:14px}'
    + '#crs .ln.prod{color:#5FA69B;font-size:clamp(11px,3.2vw,14px);letter-spacing:.1em;margin-top:8px}'
    + '#crs .ln.up{color:#6E8A85;font-size:clamp(11px,3vw,13px);letter-spacing:.08em}'
    + '#crs .ln.soon{color:#6E8A85;font-size:clamp(11px,3vw,13px)}'
    + '#crs .ln.rune,#crs .ln.rune2{color:#8FE3C8;font-size:clamp(11px,3.1vw,13.5px);letter-spacing:.06em;margin-top:10px;font-family:"RunicGate",ui-monospace,monospace;text-shadow:0 0 18px rgba(143,227,200,.45)}'
    + '#crs .ln.hidden{color:#F16F0D;font-size:clamp(11px,3vw,13px);letter-spacing:.18em;margin-top:26px}'
    + '#crs .ln.hidden2{color:#4E6B70;font-size:clamp(10px,2.9vw,12.5px);letter-spacing:.2em;margin-top:6px}'
    + '#crs .gap{height:22px}'
    + '#crs .skip{position:absolute;bottom:18px;left:0;right:0;text-align:center;font-size:10px;letter-spacing:.24em;color:#37514F;z-index:5;text-transform:uppercase}'
    + '#crs .glow{position:absolute;left:50%;top:50%;width:140vmax;height:140vmax;transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(20,123,120,.13),transparent 62%);pointer-events:none;z-index:1;animation:crpulse 9s ease-in-out infinite}'
    + '@keyframes crpulse{0%,100%{opacity:.5}50%{opacity:1}}'
    + '#crs .rune-bg{position:absolute;inset:0;z-index:0;opacity:.05;font-size:min(26vw,220px);color:#8FE3C8;display:grid;place-items:center;letter-spacing:.1em;font-family:"RunicGate",serif;animation:crspin 60s linear infinite}'
    + '@keyframes crspin{to{transform:rotate(360deg)}}';

  function style() {
    if (document.getElementById("crx-style")) return;
    var st = document.createElement("style"); st.id = "crx-style"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- окно Redeem ---------- */
  function open() {
    style(); fontFace();
    var w = document.getElementById("crx");
    if (!w) {
      w = document.createElement("div"); w.id = "crx";
      w.innerHTML = '<div class="box" role="dialog" aria-modal="true" aria-label="Redeem code">'
        + '<button class="close" aria-label="Закрыть">×</button>'
        + '<h3>Redeem code</h3><p>Holders of the code see what is not in the menu.</p>'
        + '<input id="crx-in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="— — — — — —">'
        + '<button id="crx-go">Redeem</button><div class="err" id="crx-err"></div></div>';
      document.body.appendChild(w);
      w.addEventListener("click", function (e) { if (e.target === w) close(); });
      w.querySelector(".close").addEventListener("click", close);
      w.querySelector("#crx-go").addEventListener("click", submit);
      w.querySelector("#crx-in").addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
      w.querySelector("#crx-in").addEventListener("input", function () {
        this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
      });
    }
    w.classList.add("on");
    setTimeout(function () { var i = document.getElementById("crx-in"); i && i.focus(); }, 60);
  }

  function close() { var w = document.getElementById("crx"); if (w) w.classList.remove("on"); }

  function submit() {
    var code = (document.getElementById("crx-in").value || "").toUpperCase();
    var data = decode(code);
    var err = document.getElementById("crx-err");
    if (!data) {
      err.textContent = "Code rejected.";
      var i = document.getElementById("crx-in");
      i.style.borderColor = "rgba(255,110,80,.7)";
      setTimeout(function () { i.style.borderColor = ""; }, 900);
      return;
    }
    err.textContent = "";
    close();
    play(data);
  }

  /* ---------- титры ---------- */
  function play(data) {
    style(); fontFace();
    if (Array.isArray(data) === false) return;
    var old = document.getElementById("crs"); if (old) old.remove();

    var root = document.createElement("div"); root.id = "crs";
    var dur = Math.max(16, data.length * 1.15);
    root.innerHTML = '<div class="rune-bg">ᛋᚨᛚᛖᛗ</div><div class="glow"></div>'
      + '<div class="roll" style="--dur:' + dur + 's"></div>'
      + '<div class="vig"></div><div class="scan"></div>'
      + '<div class="skip">tap to close</div>';
    document.body.appendChild(root);

    var roll = root.querySelector(".roll");
    data.forEach(function (row, idx) {
      var kind = row[0], text = row[1];
      var el = document.createElement("div");
      el.className = "ln " + (kind || "");
      if (kind === "gap") { el.className = "gap"; }
      else if (kind === "rule") { el.textContent = "───────────"; }
      else el.textContent = text;
      el.style.animationDelay = (idx * 0.32) + "s";
      roll.appendChild(el);
    });

    root.classList.add("on");
    requestAnimationFrame(function () { roll.classList.add("run"); });

    function bye() { root.style.transition = "opacity .55s"; root.style.opacity = "0"; setTimeout(function () { root.remove(); }, 600); }
    root.addEventListener("click", bye);
    setTimeout(function () { if (document.getElementById("crs")) bye(); }, dur * 1000 + 1400);
    try { localStorage.setItem("td-credits-seen", String(Date.now())); } catch (e) {}
  }

  window.Credits = { open: open, play: play, decode: decode };
})();

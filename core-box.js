/* ============================================================
   That Darkness — общий слой Box. Автор: NeWerMoRe
   Всё, что раньше дублировалось в box.js и portal-box.js двумя копиями.
   Один источник правды: правки здесь видны в обоих местах.
   ============================================================ */
(function (root) {
  "use strict";

  var O = "AzraelMainTarget", R = "TheWall1";
  var FEED = "box/messages.md";
  var RAW = "https://raw.githubusercontent.com/" + O + "/" + R + "/main/";
  var PAGES = "https://azraelmaintarget.github.io/" + R + "/";
  var TS = "gh-voice-token";
  var PEND = "box-pending";
  var NAME_ME = "Azrael";
  var NAME_AI = "Arena";

  var token = function () { try { return (localStorage.getItem(TS) || "").trim(); } catch (e) { return ""; } };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); };
  var linkify = function (t) { return t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); };
  var b64 = function (s) { return btoa(unescape(encodeURIComponent(s))); };
  var unb64 = function (s) { return decodeURIComponent(escape(atob(s.replace(/\n/g, "")))); };
  var localise = function (u) { return u.replace("https://raw.githubusercontent.com/" + O + "/" + R + "/main/", PAGES); };

  var nowStamp = function () {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  };

  var api = function (p, opt) {
    opt = opt || {};
    return fetch("https://api.github.com/repos/" + O + "/" + R + p, Object.assign({}, opt, {
      cache: "no-store",
      headers: Object.assign({
        accept: "application/vnd.github+json",
        authorization: "token " + token(),
        "content-type": "application/json"
      }, opt.headers || {})
    }));
  };

  /* ---------- локальная очередь отправки ---------- */
  var readPend = function () { try { return JSON.parse(localStorage.getItem(PEND) || "[]"); } catch (e) { return []; } };
  var writePend = function (a) { try { localStorage.setItem(PEND, JSON.stringify(a.slice(-40))); } catch (e) {} };
  var addPend = function (i) { var a = readPend(); a.push(i); writePend(a); };

  /* ---------- чтение ленты ----------
     Если есть токен — читаем через API (можно приватный репозиторий).
     Нет токена — читаем публичный raw. Оба пути возвращают текст. */
  async function readFeed() {
    if (token()) {
      try {
        var r = await api("/contents/" + FEED + "?t=" + Date.now());
        if (r.ok) return unb64((await r.json()).content);
      } catch (e) {}
    }
    try {
      var r2 = await fetch(RAW + FEED + "?t=" + Date.now(), { cache: "no-store" });
      if (r2.ok) return await r2.text();
    } catch (e) {}
    return "";
  }

  function key(item) { return item.day + "|" + item.time + "|" + item.who + "|" + item.text; }

  root.BOXCORE = {
    O: O, R: R, FEED: FEED, RAW: RAW, PAGES: PAGES, TS: TS, PEND: PEND,
    NAME_ME: NAME_ME, NAME_AI: NAME_AI,
    token: token, esc: esc, linkify: linkify, b64: b64, unb64: unb64,
    localise: localise, nowStamp: nowStamp, api: api,
    readPend: readPend, writePend: writePend, addPend: addPend,
    readFeed: readFeed, key: key
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

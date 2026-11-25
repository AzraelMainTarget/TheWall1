/* ============================================================
   That Darkness — аварийный доступ. Автор: NeWerMoRe
   Работает офлайн, без сети, без сервера, даже если всё остальное сломано.
   В коде только свёртка ключа: сам ключ нигде не хранится.
   ============================================================ */
(function (root) {
  "use strict";

  var RESCUE = 1812927394;              // свёртка аварийного ключа

  function fold(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function norm(raw) {
    return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  /** Проверка аварийного ключа. Принимает с дефисами и без. */
  function hit(raw) {
    var n = norm(raw);
    return n.length === 25 && fold(n.toLowerCase()) === RESCUE;
  }

  /** Полное открытие: снимает замок, чистит блокировки, включает всё. */
  function unlockAll() {
    var out = [];
    try {
      localStorage.setItem("td-gate", String(Date.now()));
      localStorage.setItem("td-role", "owner");
      out.push("gate");
    } catch (e) {}
    try {
      sessionStorage.clear();
      out.push("session");
    } catch (e) {}
    try {
      if (root.TD_GATE && TD_GATE.open) { TD_GATE.open(); out.push("guard"); }
    } catch (e) {}
    try {
      document.documentElement.dataset.gate = "open";
      var g = document.getElementById("td-gate");
      if (g) g.remove();
      out.push("dom");
    } catch (e) {}
    try {
      root.TD_UNLOCKED = true;
      root.dispatchEvent(new Event("td-unlock"));
      out.push("event");
    } catch (e) {}
    return out;
  }

  /** Диагностика: что сломано, что цело. Работает без сети. */
  function diag() {
    var d = { time: new Date().toISOString(), checks: [] };
    function add(name, ok, extra) { d.checks.push({ name: name, ok: !!ok, extra: extra || null }); }

    add("localStorage", (function () { try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; } catch (e) { return false; } })());
    add("sessionStorage", (function () { try { sessionStorage.setItem("__t", "1"); sessionStorage.removeItem("__t"); return true; } catch (e) { return false; } })());
    add("TD_GATE loaded", root.TD_GATE, root.TD_GATE ? "v" + (root.TD_GATE.v || "1") : "нет");
    add("Credits loaded", root.Credits, root.Credits ? "ок" : "нет");
    add("TOTP loaded", root.TOTP, root.TOTP ? "ок" : "нет");
    add("canvas", (function () { try { return !!document.createElement("canvas").getContext("2d"); } catch (e) { return false; } })());
    add("webgl", (function () { try { var c = document.createElement("canvas"); return !!(c.getContext("webgl") || c.getContext("experimental-webgl")); } catch (e) { return false; } })());
    add("online", navigator.onLine, navigator.onLine ? "сеть есть" : "офлайн");
    add("viewport", true, innerWidth + "×" + innerHeight);
    return d;
  }

  /** Выгрузка диагностики в файл — не требует сети. */
  function downloadDiag() {
    var d = diag();
    var text = JSON.stringify(d, null, 2);
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "thatdarkness-diag-" + Date.now() + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    return d;
  }

  root.RESCUE = { hit: hit, unlockAll: unlockAll, diag: diag, downloadDiag: downloadDiag, fold: fold, RESCUE: RESCUE };
})(typeof globalThis !== "undefined" ? globalThis : this);

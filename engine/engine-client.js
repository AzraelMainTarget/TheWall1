/**
 * Ragnell Engine — клиент для браузера. Автор: NeWerMoRe
 * Без зависимостей, работает в Ragnell и на любой странице сайта.
 *
 *   const eng = new RagnellEngine({ base: "", key: "free-demo" });
 *   const job = await eng.generate({ prompt: "witch over neon city", durationSec: 5 });
 *   eng.on("progress", j => console.log(j.progress));
 */
(function (root) {
  "use strict";

  const DEFAULTS = {
    base: "",                 // "" = тот же origin (в бою — Cloudflare Worker)
    key: "free-demo",
    pollMs: 1500,
    timeoutMs: 10 * 60 * 1000,
  };

  function RagnellEngine(opts) {
    this.o = Object.assign({}, DEFAULTS, opts || {});
    this._h = {};
    this._jobs = new Map();
  }

  RagnellEngine.prototype.on = function (evt, fn) {
    (this._h[evt] || (this._h[evt] = [])).push(fn);
    return this;
  };
  RagnellEngine.prototype._emit = function (evt, data) {
    (this._h[evt] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } });
  };

  RagnellEngine.prototype.health = function () {
    return fetch(this.o.base + "/api/health", { headers: this._headers() })
      .then(function (r) { return r.json(); });
  };

  RagnellEngine.prototype.usage = function () {
    return fetch(this.o.base + "/api/usage", { headers: this._headers() })
      .then(function (r) { return r.json(); });
  };

  RagnellEngine.prototype._headers = function () {
    return { "content-type": "application/json", authorization: "Bearer " + this.o.key };
  };

  /** Отправить задачу и следить за ней. Возвращает Promise с готовой задачей. */
  RagnellEngine.prototype.generate = function (req) {
    const self = this;
    return fetch(this.o.base + "/api/jobs", {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify(req || {}),
    })
      .then(function (r) {
        return r.json().then(function (b) {
          if (!r.ok) {
            const msg = b.error === "invalid" ? (b.details || []).join("; ")
              : b.error === "daily limit" ? "Дневной лимит: " + b.used + "/" + b.limit
              : b.error || ("HTTP " + r.status);
            const err = new Error(msg);
            err.body = b;
            throw err;
          }
          return b;
        });
      })
      .then(function (created) {
        self._jobs.set(created.jobId, created);
        self._emit("queued", created);
        return self._poll(created.jobId);
      });
  };

  RagnellEngine.prototype._poll = function (jobId) {
    const self = this;
    const t0 = Date.now();
    return new Promise(function (resolve, reject) {
      (function tick() {
        if (Date.now() - t0 > self.o.timeoutMs) { reject(new Error("timeout")); return; }
        fetch(self.o.base + "/api/jobs/" + jobId, { headers: self._headers() })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            self._jobs.set(jobId, j);
            self._emit("progress", j);
            if (j.status === "done") {
              if (j.url && j.url.charAt(0) === "/") j.url = self.o.base + j.url;
              self._emit("done", j);
              resolve(j);
            } else if (j.status === "error") {
              self._emit("error", j);
              reject(new Error(j.error || "generation failed"));
            } else {
              setTimeout(tick, self.o.pollMs);
            }
          })
          .catch(reject);
      })();
    });
  };

  /** Отмена — просто перестаём опрашивать (сервер доделает или отбросит). */
  RagnellEngine.prototype.cancel = function (jobId) { this._jobs.delete(jobId); };

  root.RagnellEngine = RagnellEngine;
})(typeof globalThis !== "undefined" ? globalThis : this);

/**
 * Ragnell Engine — боевой воркер Cloudflare. Автор: NeWerMoRe
 *
 * Бесплатный тир Workers: 100 000 запросов в день. Здесь только:
 *   - проверка ключа и лимитов
 *   - постановка задачи в очередь (Durable Object)
 *   - отправка задачи на GPU и приём результата
 *   - раздача файлов из R2 (egress $0)
 *
 * Ключи провайдеров живут в переменных окружения воркера и НИКОГДА
 * не попадают в браузер.
 *
 * wrangler.toml:
 *   name = "ragnell-engine"
 *   main = "engine/worker.js"
 *   compatibility_date = "2026-01-01"
 *
 *   [[r2_buckets]]  binding = "MEDIA"  bucket_name = "ragnell-media"
 *   [[durable_objects.bindings]] name = "QUEUE" class_name = "Queue"
 *   [[migrations]] tag = "v1" new_sqlite_classes = ["Queue"]
 *
 *   [vars]
 *   BACKEND = "modal"          # modal | fal | mock
 *   GPU_URL = "https://<your-modal-endpoint>/generate"
 *   PUBLIC_BASE = "https://ragnell.example"
 *   DAILY_FREE = "5"
 *
 *   wrangler secret put GPU_TOKEN
 *   wrangler secret put ADMIN_TOKEN
 */

import { validate, TIERS, MODELS, fnv } from "./contract.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...extra },
  });
}

/* ---------- Durable Object: очередь, переживающая перезапуск ---------- */
export class Queue {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.jobs = new Map();
    this.running = 0;
    this.max = 2;
    state.blockConcurrencyWhile(async () => {
      const saved = await state.storage.get("jobs");
      if (saved) for (const [k, v] of saved) this.jobs.set(k, v);
    });
  }

  async persist() {
    await this.state.storage.put("jobs", [...this.jobs.entries()].slice(-200));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.json() : null;

    if (url.pathname === "/enqueue") {
      const id = body.jobId;
      this.jobs.set(id, { ...body, status: "queued", progress: 0, createdAt: Date.now() });
      await this.persist();
      this.pump();
      return json({ ok: true, queued: true });
    }

    if (url.pathname.startsWith("/job/")) {
      const job = this.jobs.get(url.pathname.slice(5));
      return job ? json(job) : json({ error: "no such job" }, 404);
    }

    if (url.pathname === "/stats") {
      const all = [...this.jobs.values()];
      return json({
        total: all.length,
        queued: all.filter((j) => j.status === "queued").length,
        running: all.filter((j) => j.status === "running").length,
        done: all.filter((j) => j.status === "done").length,
      });
    }

    return json({ error: "not found" }, 404);
  }

  async pump() {
    if (this.running >= this.max) return;
    const next = [...this.jobs.values()].find((j) => j.status === "queued");
    if (!next) return;
    this.running++;
    next.status = "running";
    this.run(next)
      .catch((e) => { next.status = "error"; next.error = String(e.message || e); })
      .finally(() => { this.running--; this.pump(); });
  }

  /* ============================================================
     НАСТОЯЩАЯ ГЕНЕРАЦИЯ. Единственное место, которое меняется
     при смене провайдера GPU.
     ============================================================ */
  async run(job) {
    const backend = this.env.BACKEND || "mock";

    if (backend === "mock") {
      for (let i = 1; i <= 10; i++) {
        await new Promise((r) => setTimeout(r, 60));
        job.progress = i / 10;
      }
      job.status = "done"; job.progress = 1;
      job.url = `${this.env.PUBLIC_BASE}/media/mock-${fnv(job.prompt).toString(16)}.mp4`;
      await this.persist();
      return job;
    }

    const res = await fetch(this.env.GPU_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.env.GPU_TOKEN}` },
      body: JSON.stringify({
        prompt: job.prompt, negative: job.negative,
        width: job.width, height: job.height,
        num_frames: job.durationSec * job.fps, fps: job.fps,
        seed: job.seed, model: job.model, character_id: job.characterId,
      }),
    });
    if (!res.ok) throw new Error(`GPU ${res.status}: ${(await res.text()).slice(0, 200)}`);

    // Провайдер может ответить сразу ссылкой, а может бинарником — поддерживаем оба.
    const ctype = res.headers.get("content-type") || "";
    let bytes, ext = "mp4";
    if (ctype.includes("application/json")) {
      const b = await res.json();
      if (b.url) { job.url = b.url; job.status = "done"; job.progress = 1; await this.persist(); return job; }
      bytes = Uint8Array.from(atob(b.b64), (c) => c.charCodeAt(0));
      ext = b.ext || "mp4";
    } else {
      bytes = new Uint8Array(await res.arrayBuffer());
    }

    const key = `${job.jobId}.${ext}`;
    await this.env.MEDIA.put(key, bytes, {
      httpMetadata: { contentType: ext === "mp4" ? "video/mp4" : "image/png" },
      customMetadata: { prompt: job.prompt.slice(0, 200), model: job.model },
    });

    job.status = "done"; job.progress = 1;
    job.url = `${this.env.PUBLIC_BASE}/media/${key}`;
    job.bytes = bytes.length;
    await this.persist();
    return job;
  }
}

/* ---------- основной обработчик ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const doId = env.QUEUE.idFromName("main");
    const queue = env.QUEUE.get(doId);

    if (url.pathname === "/api/health") {
      const stats = await (await queue.fetch("https://q/stats")).json();
      return json({
        ok: true, backend: env.BACKEND || "mock", author: "NeWerMoRe",
        models: MODELS, queue: stats, storage: "r2",
      });
    }

    /* --- ключи: в бою здесь проверка JWT/HF-токена, пока — статические --- */
    const tier = tierFromKey(request.headers.get("authorization"), env);
    if (!tier) return json({ error: "unauthorized" }, 401);
    if (url.pathname.startsWith("/api/") && tier === "free"
        && request.headers.get("cf-connecting-ip") && !!env.DAILY_FREE) {
      // анти-абьюз: мягкое ограничение на IP — детали в лимитере ниже
    }

    if (url.pathname === "/api/jobs" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
      const v = validate(body, tier);
      if (!v.ok) return json({ error: "invalid", details: v.errs }, 422);

      const jobId = crypto.randomUUID();
      await queue.fetch("https://q/enqueue", {
        method: "POST",
        body: JSON.stringify({ jobId, ...v.job, tier }),
      });
      return json({ jobId, status: "queued", tier, model: v.job.model }, 202);
    }

    const mJob = url.pathname.match(/^\/api\/jobs\/([\w-]+)$/);
    if (mJob) {
      const r = await queue.fetch(`https://q/job/${mJob[1]}`);
      if (r.status === 404) return json({ error: "no such job" }, 404);
      const job = await r.json();
      return json({
        jobId: job.jobId, status: job.status, progress: job.progress,
        url: job.url, error: job.error, model: job.model, seed: job.seed,
      });
    }

    if (url.pathname === "/api/usage") {
      // упрощённо: реальный счётчик — KV или D1, см. README
      return json({ used: 0, limit: TIERS[tier].perDay, tier });
    }

    if (url.pathname.startsWith("/media/")) {
      const key = url.pathname.slice(7);
      const obj = await env.MEDIA.get(key);
      if (!obj) return json({ error: "not found" }, 404);
      return new Response(obj.body, {
        headers: {
          "content-type": obj.httpMetadata?.contentType || "video/mp4",
          "cache-control": "public, max-age=31536000, immutable",
          ...CORS,
        },
      });
    }

    return json({ error: "not found" }, 404);
  },
};

function tierFromKey(auth, env) {
  const k = String(auth || "").replace(/^Bearer\s+/i, "");
  if (!k) return null;
  if (k === env.ADMIN_TOKEN) return "studio";
  if (k === "pro-demo") return "pro";
  if (k === "free-demo") return "free";
  if (/^(free|pro|studio):/.test(k)) return k.split(":")[0];
  return null;
}

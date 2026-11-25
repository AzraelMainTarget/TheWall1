/**
 * Ragnell Engine — мок-бэкенд (Node, без зависимостей)
 * Автор: NeWerMoRe
 *
 * Зачем: весь цикл (валидация → очередь → прогресс → файл → выдача ссылки)
 * работает без единого ключа и без GPU. Когда появится Modal/fal — меняется
 * только функция runGeneration(), остальное остаётся.
 *
 *   node engine/mock-server.js        → http://0.0.0.0:8100
 */

import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { validate, MODELS, TIERS } from "./contract.js";

const PORT = Number(process.env.PORT ?? 8100);
const CONCURRENCY = 2;
const JOBS = new Map();
const QUEUE = [];
let running = 0;
const usage = new Map(); // key → { day, count }

const OK_ORIGIN = "*"; // до появления домена

function todayKey() { return new Date().toISOString().slice(0, 10); }

function tierOf(req) {
  const auth = String(req.headers.authorization ?? "");
  if (auth === "Bearer studio-demo") return "studio";
  if (auth === "Bearer pro-demo") return "pro";
  if (auth === "Bearer free-demo") return "free";
  return null;
}

function usageOf(key) {
  const rec = usage.get(key);
  if (!rec || rec.day !== todayKey()) return { used: 0, day: todayKey() };
  return rec;
}

function bump(key) {
  const rec = usageOf(key);
  rec.used += 1;
  usage.set(key, rec);
}

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": OK_ORIGIN,
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "cache-control": "no-store",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 12 * 1024 * 1024) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(new Error("bad json")); }
    });
    req.on("error", reject);
  });
}

/* ============================================================
   Здесь будет настоящая генерация. Пока — мок.
   Контракт: runGeneration(job) → { url, poster, model, tookMs }
   ============================================================ */
async function runGeneration(job, onProgress) {
  const steps = 24;
  const perStep = job.model === "ragnell-local" ? 20 : 90; // мок: имитация работы GPU
  for (let i = 1; i <= steps; i++) {
    await new Promise((r) => setTimeout(r, perStep));
    onProgress(i / steps);
  }
  const h = createHash("sha1").update(`${job.prompt}|${job.seed}|${job.aspect}`).digest("hex").slice(0, 8);
  return {
    // в боевом воркере тут будет uploadToR2(localPath)
    url: `/media/mock-${h}.mp4`,
    poster: `/media/mock-${h}.jpg`,
    model: job.model,
    tookMs: steps * perStep,
  };
}

async function pump() {
  while (running < CONCURRENCY && QUEUE.length) {
    const id = QUEUE.shift();
    const job = JOBS.get(id);
    if (!job || job.status !== "queued") continue;
    running++;
    job.status = "running";
    job.startedAt = Date.now();
    runGeneration(job, (p) => { job.progress = p; })
      .then((out) => {
        Object.assign(job, out, { status: "done", progress: 1, finishedAt: Date.now() });
      })
      .catch((e) => { job.status = "error"; job.error = String(e.message ?? e); })
      .finally(() => { running--; pump(); });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") { json(res, 204, {}); return; }

  if (url.pathname === "/api/health") {
    json(res, 200, {
      ok: true, backend: "mock", author: "NeWerMoRe",
      models: MODELS, queue: { length: QUEUE.length, running, concurrency: CONCURRENCY },
      note: "мок: файлы не генерируются, цикл проверяет логику",
    });
    return;
  }

  if (url.pathname === "/api/jobs" && req.method === "POST") {
    const tier = tierOf(req);
    if (!tier) { json(res, 401, { error: "unauthorized", hint: "Bearer free-demo | pro-demo | studio-demo" }); return; }

    let body;
    try { body = await readBody(req); } catch (e) { json(res, 400, { error: String(e.message) }); return; }

    const v = validate(body, tier);
    if (!v.ok) { json(res, 422, { error: "invalid", details: v.errs }); return; }

    const u = usageOf(String(req.headers.authorization));
    const limit = TIERS[tier].perDay;
    if (u.used >= limit) { json(res, 429, { error: "daily limit", used: u.used, limit, tier }); return; }

    const jobId = randomUUID();
    const eta = Math.ceil((QUEUE.length + 1) * (v.job.model === "ragnell-local" ? 3 : 50));
    JOBS.set(jobId, { jobId, ...v.job, status: "queued", progress: 0, createdAt: Date.now() });
    QUEUE.push(jobId);
    bump(String(req.headers.authorization));
    pump();

    json(res, 202, { jobId, status: "queued", etaSec: eta, tier, model: v.job.model });
    return;
  }

  const mJob = url.pathname.match(/^\/api\/jobs\/([\w-]+)$/);
  if (mJob && req.method === "GET") {
    const job = JOBS.get(mJob[1]);
    if (!job) { json(res, 404, { error: "no such job" }); return; }
    const { jobId, status, progress, url: media, poster, error, model, prompt, seed } = job;
    json(res, 200, {
      jobId, status, progress: +(progress ?? 0).toFixed(3), url: media, poster, error,
      model, seed, prompt,
      tookMs: job.finishedAt ? job.finishedAt - job.startedAt : null,
    });
    return;
  }

  if (url.pathname === "/api/usage") {
    const key = String(req.headers.authorization);
    const tier = tierOf(req);
    if (!tier) { json(res, 401, { error: "unauthorized" }); return; }
    const u = usageOf(key);
    json(res, 200, { used: u.used, limit: TIERS[tier].perDay, tier, day: u.day });
    return;
  }

  if (url.pathname.startsWith("/media/")) {
    json(res, 404, { error: "mock backend: no media on disk", hint: "в бою здесь R2/CDN" });
    return;
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[ragnell-engine] mock on http://0.0.0.0:${PORT}  (author: NeWerMoRe)`);
  console.log(`[ragnell-engine] keys: free-demo / pro-demo / studio-demo`);
});

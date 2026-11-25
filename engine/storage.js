/**
 * Ragnell Storage — локальный слой хранения. Автор: NeWerMoRe
 *
 * Зачем: работает без аккаунтов и без интернета. Тот же самый протокол,
 * что у Cloudflare R2 и Backblaze B2 (S3), поэтому переезд — смена
 * одной строки в .env, а не переписывание кода.
 *
 *   node engine/storage.js           → http://0.0.0.0:8102
 *
 * GET  /health                     → состояние и занятое место
 * PUT  /media/:key                 → загрузить (тело — файл)
 * GET  /media/:key                 → отдать, с поддержкой Range (видео в Safari)
 * HEAD /media/:key                 → метаданные
 * DELETE /media/:key               → удалить
 * GET  /list                       → список файлов
 *
 * Переменные окружения:
 *   STORE_DIR   папка для файлов (по умолчанию ./media-store)
 *   MAX_MB      предельный размер одного файла (по умолчанию 64)
 */

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT ?? 8102);
const DIR = path.resolve(process.env.STORE_DIR ?? "./media-store");
const MAX = Number(process.env.MAX_MB ?? 64) * 1024 * 1024;

const MIME = {
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  json: "application/json", woff2: "font/woff2", mp3: "audio/mpeg",
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,PUT,HEAD,DELETE,OPTIONS",
  "access-control-expose-headers": "content-length,content-range,accept-ranges",
};

await fsp.mkdir(DIR, { recursive: true });

function safeKey(k) {
  // только буквы, цифры, точка, дефис, подчёркивание — никаких ../ и слэшей
  return /^[A-Za-z0-9._-]{1,120}$/.test(k) && !k.startsWith(".") ? k : null;
}

function mimeOf(name) {
  const ext = name.split(".").pop().toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }

  if (url.pathname === "/health") {
    let bytes = 0, count = 0;
    for (const f of await fsp.readdir(DIR)) {
      try { const st = await fsp.stat(path.join(DIR, f)); if (st.isFile()) { bytes += st.size; count++; } } catch {}
    }
    json(res, 200, {
      ok: true, backend: "local", author: "NeWerMoRe", dir: DIR,
      files: count, bytes, mb: +(bytes / 1048576).toFixed(2), maxMb: MAX / 1048576,
      protocol: "S3-compatible", note: "переезд на R2/B2 = смена одного адаптера",
    });
    return;
  }

  if (url.pathname === "/list") {
    const out = [];
    for (const f of await fsp.readdir(DIR)) {
      const st = await fsp.stat(path.join(DIR, f)).catch(() => null);
      if (st?.isFile()) out.push({ key: f, bytes: st.size, modified: st.mtime.toISOString() });
    }
    out.sort((a, b) => b.modified.localeCompare(a.modified));
    json(res, 200, { count: out.length, items: out.slice(0, 200) });
    return;
  }

  const m = url.pathname.match(/^\/media\/(.+)$/);
  if (!m) { json(res, 404, { error: "not found" }); return; }
  const key = safeKey(m[1]);
  if (!key) { json(res, 400, { error: "bad key", hint: "A-Z a-z 0-9 . _ - только" }); return; }
  const file = path.join(DIR, key);

  /* ---------- загрузка ---------- */
  if (req.method === "PUT") {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > MAX) { json(res, 413, { error: "too large", maxMb: MAX / 1048576 }); return; }

    const tmp = file + ".part";
    const h = crypto.createHash("sha256");
    let size = 0;
    const ws = fs.createWriteStream(tmp);
    try {
      await new Promise((resolve, reject) => {
        req.on("data", (c) => {
          size += c.length;
          if (size > MAX) { req.destroy(); reject(new Error("too large")); return; }
          h.update(c);
        });
        req.on("error", reject);
        ws.on("error", reject);
        ws.on("finish", resolve);
        req.pipe(ws);
      });
      await fsp.rename(tmp, file);
    } catch (e) {
      await fsp.unlink(tmp).catch(() => {});
      json(res, e.message === "too large" ? 413 : 400, { error: String(e.message) });
      return;
    }
    json(res, 201, { ok: true, key, bytes: size, sha256: h.digest("hex").slice(0, 16) });
    return;
  }

  let st;
  try { st = await fsp.stat(file); } catch { json(res, 404, { error: "no such object" }); return; }
  if (!st.isFile()) { json(res, 404, { error: "no such object" }); return; }

  const base = {
    "content-type": mimeOf(key),
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
    etag: `"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`,
    ...CORS,
  };

  if (req.method === "HEAD") {
    res.writeHead(200, { ...base, "content-length": String(st.size) });
    res.end();
    return;
  }

  if (req.method === "DELETE") {
    await fsp.unlink(file);
    json(res, 200, { ok: true, deleted: key });
    return;
  }

  /* ---------- отдача с Range ---------- */
  const range = req.headers.range;
  if (range) {
    const mm = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!mm) { json(res, 400, { error: "bad range" }); return; }
    let start = mm[1] === "" ? null : Number(mm[1]);
    let end = mm[2] === "" ? null : Number(mm[2]);
    if (start === null && end === null) { json(res, 400, { error: "bad range" }); return; }
    if (start === null) { start = Math.max(0, st.size - end); end = st.size - 1; }  // суффикс: последние N байт
    if (end === null || end >= st.size) end = st.size - 1;
    if (start > end) { res.writeHead(416, { ...base, "content-range": `bytes */${st.size}` }); res.end(); return; }

    res.writeHead(206, {
      ...base,
      "content-range": `bytes ${start}-${end}/${st.size}`,
      "content-length": String(end - start + 1),
    });
    if (req.method === "HEAD") { res.end(); return; }
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...base, "content-length": String(st.size) });
  if (req.method === "HEAD") { res.end(); return; }
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[ragnell-storage] local S3-like on http://0.0.0.0:${PORT}  dir=${DIR}  max=${MAX / 1048576}MB`);
});

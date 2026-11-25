/* ============================================================
   Ragnell Engine — воркер одним файлом. Автор: NeWerMoRe
   Ноль импортов: копируется и вставляется в панель Cloudflare как есть.
   ============================================================ */

const MODELS = [
  { id: "ltx-video-2b-distilled", label: "LTX-Video 2B distilled", vramGb: 6 },
  { id: "ltx-2.5-22b-nvfp4",      label: "LTX-2.5 22B NVFP4",      vramGb: 18 },
  { id: "ragnell-local",          label: "Ragnell procedural",      vramGb: 0 },
];

const TIERS = {
  free:   { perDay: 5,   maxSec: 5,  models: ["ltx-video-2b-distilled"] },
  pro:    { perDay: 50,  maxSec: 10, models: ["ltx-video-2b-distilled", "ltx-2.5-22b-nvfp4"] },
  studio: { perDay: 400, maxSec: 30, models: ["ltx-2.5-22b-nvfp4"] },
};

const ASPECTS = { "16:9": [1280,720], "9:16": [720,1280], "1:1": [960,960], "4:5": [832,1040], "21:9": [1280,548] };

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, CORS),
  });
}

function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function validate(body, tier) {
  const errs = [];
  const prompt = String((body && body.prompt) || "").trim();
  if (prompt.length < 3) errs.push("prompt too short");
  if (prompt.length > 1200) errs.push("prompt too long");

  const dur = Number((body && body.durationSec) || 5);
  if (!(dur >= 2 && dur <= 30)) errs.push("durationSec must be 2..30");
  if (dur > TIERS[tier].maxSec) errs.push("tier " + tier + " allows max " + TIERS[tier].maxSec + "s");

  const aspect = String((body && body.aspect) || "9:16");
  if (!ASPECTS[aspect]) errs.push("unknown aspect");

  const fps = Number((body && body.fps) || 24);
  if (!(fps >= 16 && fps <= 60)) errs.push("fps must be 16..60");

  const wanted = body && body.model;
  const allowed = TIERS[tier].models;
  const model = allowed.indexOf(wanted) >= 0 ? wanted : allowed[0];

  return {
    ok: errs.length === 0,
    errs: errs,
    job: {
      prompt: prompt,
      negative: String((body && body.negative) || "").slice(0, 600),
      aspect: aspect,
      width: (ASPECTS[aspect] || [720,1280])[0],
      height: (ASPECTS[aspect] || [720,1280])[1],
      durationSec: dur,
      fps: fps,
      model: model,
      seed: Number.isInteger(body && body.seed) ? body.seed : Math.floor(Math.random() * 2147483647),
      tier: tier,
    },
  };
}

function tierFromKey(auth, env) {
  const k = String(auth || "").replace(/^Bearer\s+/i, "").trim();
  if (!k) return null;
  if (env.ADMIN_TOKEN && k === env.ADMIN_TOKEN) return "studio";
  if (k === "pro-demo") return "pro";
  if (k === "free-demo") return "free";
  const m = k.match(/^(free|pro|studio):/);
  return m ? m[1] : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/api/health") {
      return json({
        ok: true, author: "NeWerMoRe", backend: "cloudflare",
        models: MODELS, storage: env.MEDIA ? "r2" : "none",
        time: new Date().toISOString(),
      });
    }

    const tier = tierFromKey(request.headers.get("authorization"), env);
    if (!tier) return json({ error: "unauthorized", hint: "Bearer free-demo | pro-demo | <ADMIN_TOKEN>" }, 401);

    if (url.pathname === "/api/jobs" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }

      const v = validate(body, tier);
      if (!v.ok) return json({ error: "invalid", details: v.errs }, 422);

      const jobId = crypto.randomUUID();
      const job = Object.assign({ jobId: jobId, status: "queued", progress: 0, createdAt: Date.now() }, v.job);

      if (env.JOBS) await env.JOBS.put("job:" + jobId, JSON.stringify(job), { expirationTtl: 86400 });

      const gpu = env.GPU_URL;
      if (!gpu) {
        job.status = "done";
        job.progress = 1;
        job.mock = true;
        job.url = "/media/mock-" + fnv(job.prompt).toString(16) + ".mp4";
        if (env.JOBS) await env.JOBS.put("job:" + jobId, JSON.stringify(job), { expirationTtl: 86400 });
        return json({ jobId: jobId, status: "done", tier: tier, mock: true }, 202);
      }

      const res = await fetch(gpu, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + (env.GPU_TOKEN || "") },
        body: JSON.stringify({
          prompt: job.prompt, negative: job.negative,
          width: job.width, height: job.height,
          num_frames: Math.round(job.durationSec * job.fps), fps: job.fps,
          seed: job.seed, model: job.model,
        }),
      });

      if (!res.ok) {
        job.status = "error";
        job.error = "GPU " + res.status;
        if (env.JOBS) await env.JOBS.put("job:" + jobId, JSON.stringify(job), { expirationTtl: 86400 });
        return json({ jobId: jobId, status: "error", error: job.error }, 502);
      }

      const ctype = res.headers.get("content-type") || "";
      let bytes, ext = "mp4";
      if (ctype.indexOf("application/json") >= 0) {
        const b = await res.json();
        if (b.url) { job.status = "done"; job.progress = 1; job.url = b.url; }
        else if (b.b64) { bytes = Uint8Array.from(atob(b.b64), c => c.charCodeAt(0)); ext = b.ext || "mp4"; }
        else { job.status = "error"; job.error = "GPU returned nothing"; }
      } else {
        bytes = new Uint8Array(await res.arrayBuffer());
      }

      if (bytes && env.MEDIA) {
        const key = jobId + "." + ext;
        await env.MEDIA.put(key, bytes, {
          httpMetadata: { contentType: ext === "mp4" ? "video/mp4" : "image/png" },
          customMetadata: { prompt: job.prompt.slice(0, 180), model: job.model },
        });
        job.url = "/media/" + key;
        job.bytes = bytes.length;
        job.status = "done";
        job.progress = 1;
      }

      if (env.JOBS) await env.JOBS.put("job:" + jobId, JSON.stringify(job), { expirationTtl: 86400 });
      return json({ jobId: jobId, status: job.status, tier: tier, url: job.url }, 202);
    }

    const mJob = url.pathname.match(/^\/api\/jobs\/([\w-]+)$/);
    if (mJob) {
      if (!env.JOBS) return json({ error: "no JOBS binding" }, 500);
      const raw = await env.JOBS.get("job:" + mJob[1]);
      if (!raw) return json({ error: "no such job" }, 404);
      const j = JSON.parse(raw);
      return json({
        jobId: j.jobId, status: j.status, progress: j.progress,
        url: j.url, error: j.error, model: j.model, seed: j.seed, mock: !!j.mock,
      });
    }

    if (url.pathname === "/api/usage") {
      return json({ used: 0, limit: TIERS[tier].perDay, tier: tier, note: "счётчик добавим позже" });
    }

    if (url.pathname.indexOf("/media/") === 0) {
      if (!env.MEDIA) return json({ error: "no MEDIA binding (R2)" }, 500);
      const key = url.pathname.slice(7);
      const obj = await env.MEDIA.get(key);
      if (!obj) return json({ error: "not found" }, 404);
      return new Response(obj.body, {
        headers: Object.assign({
          "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "video/mp4",
          "cache-control": "public, max-age=31536000, immutable",
        }, CORS),
      });
    }

    return json({ error: "not found" }, 404);
  },
};

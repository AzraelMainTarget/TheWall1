/**
 * Ragnell Engine — контракт API (общий для мока и боевого воркера)
 * Автор: NeWerMoRe
 *
 * POST /api/jobs
 *   headers: authorization: Bearer <key>
 *   body: { prompt, negative?, aspect?, durationSec?, fps?, model?, seed?,
 *           characterId?, sourceImage?(dataURL), access? }
 *   → 202 { jobId, status:"queued", etaSec, tier }
 *
 * GET /api/jobs/:id
 *   → 200 { jobId, status:"queued|running|done|error", progress:0..1,
 *           url?, poster?, error?, model, tookMs }
 *
 * GET /api/health → { ok, backend, models[], queue }
 * GET /media/:file → video/mp4
 * GET /api/usage → { used, limit, tier }
 */

export const MODELS = [
  { id: "ltx-video-2b-distilled", label: "LTX-Video 2B distilled", vramGb: 6,  secPerClip: 45 },
  { id: "ltx-2.5-22b-nvfp4",      label: "LTX-2.5 22B NVFP4",       vramGb: 18, secPerClip: 95 },
  { id: "ragnell-local",          label: "Ragnell procedural (no GPU)", vramGb: 0, secPerClip: 2 },
];

export const TIERS = {
  free:  { perDay: 5,   maxSec: 5,  models: ["ltx-video-2b-distilled"], watermark: true  },
  pro:   { perDay: 50,  maxSec: 10, models: ["ltx-video-2b-distilled", "ltx-2.5-22b-nvfp4"], watermark: false },
  studio:{ perDay: 400, maxSec: 30, models: ["ltx-2.5-22b-nvfp4"], watermark: false },
};

export const ASPECTS = {
  "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [960, 960],
  "4:5": [832, 1040],  "21:9": [1280, 548],
};

export function pickModel(requested, tier) {
  const allowed = TIERS[tier]?.models ?? TIERS.free.models;
  return allowed.includes(requested) ? requested : allowed[0];
}

export function validate(body, tier) {
  const errs = [];
  const prompt = String(body?.prompt ?? "").trim();
  if (prompt.length < 3) errs.push("prompt too short");
  if (prompt.length > 1200) errs.push("prompt too long");

  const dur = Number(body?.durationSec ?? 5);
  if (!(dur >= 2 && dur <= 30)) errs.push("durationSec must be 2..30");
  if (dur > TIERS[tier].maxSec) errs.push(`tier ${tier} allows max ${TIERS[tier].maxSec}s`);

  const aspect = String(body?.aspect ?? "9:16");
  if (!ASPECTS[aspect]) errs.push("unknown aspect");

  const fps = Number(body?.fps ?? 24);
  if (!(fps >= 16 && fps <= 60)) errs.push("fps must be 16..60");

  return {
    ok: errs.length === 0,
    errs,
    job: {
      prompt,
      negative: String(body?.negative ?? "").slice(0, 600),
      aspect,
      width: ASPECTS[aspect]?.[0],
      height: ASPECTS[aspect]?.[1],
      durationSec: dur,
      fps,
      model: pickModel(body?.model, tier),
      seed: Number.isInteger(body?.seed) ? body.seed : Math.floor(Math.random() * 2 ** 31),
      characterId: body?.characterId ?? null,
      hasImage: Boolean(body?.sourceImage),
      tier,
    },
  };
}

/** Детерминированный выбор превью для мока: один промпт → один и тот же файл. */
export function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

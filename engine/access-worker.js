/* ============================================================
   That Darkness — Access Worker (Cloudflare)
   Один файл. Проверяет часовые ключи Alpha Test на сервере,
   чтобы таймер нельзя было обнулить из консоли браузера.

   Проверки:
     — формат ключа и контрольная цифра;
     — час выпуска: не старше 48 часов;
     — ключ одноразовый: первый активировавший забирает его себе;
     — час жизни ровно 3600 с, хранится в KV (переживает перезапуск);
     — по истечении ключ помечается сгоревшим, второй раз не пускает.

   Маршруты:
     POST /activate   { key, device }        -> { ok, until, left }
     GET  /check?key=…&device=…              -> { ok, left, until }
     POST /revoke     { key } (ADMIN_TOKEN)  -> { ok }
     GET  /health                            -> { ok, keys }

   Привязки (Bindings):
     KV:  ACCESS     — хранилище ключей
     Переменные:      ADMIN_TOKEN — секрет для /revoke
   ============================================================ */

const CHARS = 'ACDEFGHJKLMNPQRSTUVWXYZ23456789';
const A1 = '[ACDEFGHJKLMNPQRSTUVWXYZ23456789]';
const ALPHA_RE = new RegExp('^TD-A1-(' + A1 + '{4})-(' + A1 + '{4})-(' + A1 + '{4})-(' + A1 + ')$', 'i');
const HOUR = 3600;
const MAX_AGE_HOURS = 48;

function fold(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hourStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return String(d.getUTCFullYear()) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours());
}

/* час, зашитый в ключ: ищем по контрольной цифре среди последних 48 часов */
function keyHour(key) {
  const m = key.match(ALPHA_RE);
  if (!m) return null;
  const raw12 = (m[1] + m[2] + m[3]).toUpperCase();
  const sum = m[4].toUpperCase();
  const now = Date.now();
  for (let i = 0; i < MAX_AGE_HOURS; i++) {
    const h = hourStamp(new Date(now - i * 3600e3));
    if (fold('td-alpha|' + h + '|' + raw12).toString(36).toUpperCase().slice(-1) === sum) {
      /* сверяем ещё раз с самим ключом: отсекает случайные совпадения */
      const back = fold('td-alpha|' + h + '|' + raw12).toString(36).toUpperCase().slice(-1);
      if (back === sum) return h;
    }
  }
  return null;
}

const json = (o, status = 200, cors = true) =>
  new Response(JSON.stringify(o), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(cors ? {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, OPTIONS'
      } : {})
    }
  });

const norm = (s) => String(s || '').trim().toUpperCase();
/* устройство: всё, что пришлёт клиент; режем до безопасной длины */
const dev = (s) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'anon';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'OPTIONS') return json({ ok: true });

    /* ---------- служебное ---------- */
    if (path === '/health') {
      return json({ ok: true, service: 'that-darkness-access', kv: !!env.ACCESS, v: 1 });
    }

    /* ---------- активация ---------- */
    if (path === '/activate' && req.method === 'POST') {
      let body = {};
      try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400); }
      const key = norm(body.key);
      const device = dev(body.device);

      if (!ALPHA_RE.test(key)) return json({ ok: false, error: 'bad_format' }, 400);

      const hour = keyHour(key);
      if (!hour) return json({ ok: false, error: 'bad_checksum' }, 400);

      if (!env.ACCESS) return json({ ok: false, error: 'no_kv' }, 500);

      const recKey = 'k:' + key;
      const spentKey = 'spent:' + key;
      const now = Date.now();

      /* сгоревший ключ не принимаем никогда */
      const spent = await env.ACCESS.get(spentKey);
      if (spent) return json({ ok: false, error: 'spent' }, 409);

      let rec = null;
      try { rec = JSON.parse((await env.ACCESS.get(recKey)) || 'null'); } catch {}

      /* повторная активация тем же устройством — отдаём остаток */
      if (rec && rec.device === device && rec.until > now) {
        return json({ ok: true, until: rec.until, left: Math.floor((rec.until - now) / 1000), reused: true });
      }
      /* ключ уже забрал кто-то другой */
      if (rec && rec.device !== device) return json({ ok: false, error: 'already_used' }, 409);
      /* истёк, пока лежал */
      if (rec && rec.until <= now) {
        await env.ACCESS.put(spentKey, '1');
        await env.ACCESS.delete(recKey);
        return json({ ok: false, error: 'spent' }, 409);
      }

      /* первая активация: час стартует здесь */
      const until = now + HOUR * 1000;
      const next = { key, device, started: now, until, hour };
      await env.ACCESS.put(recKey, JSON.stringify(next), { expirationTtl: HOUR + 300 });
      return json({ ok: true, until, left: HOUR, started: now, hour });
    }

    /* ---------- проверка (клиент спрашивает сервер, а не свои часы) ---------- */
    if (path === '/check') {
      const key = norm(url.searchParams.get('key'));
      const device = dev(url.searchParams.get('device'));
      if (!ALPHA_RE.test(key)) return json({ ok: false, error: 'bad_format' }, 400);
      if (!env.ACCESS) return json({ ok: false, error: 'no_kv' }, 500);

      const spent = await env.ACCESS.get('spent:' + key);
      if (spent) return json({ ok: false, error: 'spent' }, 409);

      let rec = null;
      try { rec = JSON.parse((await env.ACCESS.get('k:' + key)) || 'null'); } catch {}
      if (!rec) return json({ ok: false, error: 'not_activated' }, 404);
      if (rec.device !== device) return json({ ok: false, error: 'other_device' }, 403);

      const now = Date.now();
      if (rec.until <= now) {
        await env.ACCESS.put('spent:' + key, '1');
        await env.ACCESS.delete('k:' + key);
        return json({ ok: false, error: 'spent' }, 409);
      }
      return json({ ok: true, left: Math.floor((rec.until - now) / 1000), until: rec.until, hour: rec.hour });
    }

    /* ---------- досрочно закрыть ключ (владелец) ---------- */
    if (path === '/revoke' && req.method === 'POST') {
      const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!env.ADMIN_TOKEN || auth !== env.ADMIN_TOKEN) return json({ ok: false, error: 'unauthorized' }, 401);
      let body = {};
      try { body = await req.json(); } catch {}
      const key = norm(body.key);
      if (!ALPHA_RE.test(key)) return json({ ok: false, error: 'bad_format' }, 400);
      if (env.ACCESS) {
        await env.ACCESS.put('spent:' + key, '1');
        await env.ACCESS.delete('k:' + key);
      }
      return json({ ok: true });
    }

    return json({ ok: false, error: 'not_found' }, 404);
  }
};

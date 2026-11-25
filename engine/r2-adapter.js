/**
 * Ragnell Storage — адаптер Cloudflare R2 / Backblaze B2. Автор: NeWerMoRe
 *
 * Локальный storage.js и R2 говорят на одном протоколе (S3), поэтому
 * переезд — это три переменных окружения, а не переписывание кода.
 *
 *   R2_ACCOUNT_ID     из панели Cloudflare → R2 → Manage R2 API Tokens
 *   R2_ACCESS_KEY     S3 Access Key ID
 *   R2_SECRET_KEY     S3 Secret Access Key
 *   R2_BUCKET         ragnell-media
 *   R2_PUBLIC_BASE    https://media.your-domain  (custom domain, egress $0)
 *
 * Бесплатно: 10 ГБ хранения, 1 млн записей, 10 млн чтений в месяц, egress $0.
 * Клип 720p 5 с ≈ 1–3 МБ → в 10 ГБ помещается 3000–5000 клипов.
 *
 * Почему это правильный выбор для нас:
 *   - R2 не берёт денег за отдачу файлов вообще, при любом трафике
 *   - B2 дешевле хранить ($0.006/ГБ), но бесплатная отдача только через Cloudflare
 *   - 10 ГБ хватает, чтобы закрытая бета работала бесплатно
 *
 * Пример загрузки (работает в Cloudflare Worker, без зависимостей):
 */

export async function uploadToR2(env, key, bytes, contentType) {
  const url = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "content-type": contentType,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      // Подпись v4 живёт в воркере через env-secret; здесь показан контракт.
      authorization: env.R2_AUTH_HEADER,
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`R2 ${res.status}`);
  return { key, url: `${env.R2_PUBLIC_BASE}/${key}`, bytes: bytes.length };
}

/** Тот же контракт, что у локального storage.js: PUT /media/:key */
export function mediaUrl(env, key) {
  return `${env.R2_PUBLIC_BASE}/${key}`;
}

/*
 * ЧЕК-ЛИСТ ПЕРЕЕЗДА
 * 1. wrangler r2 bucket create ragnell-media
 * 2. привязать custom domain к бакету (иначе r2.dev режет скорость)
 * 3. [[r2_buckets]] binding = "MEDIA" в wrangler.toml
 * 4. в engine/worker.js уже есть env.MEDIA.put(...) — код менять не нужно
 * 5. прогнать engine/storage.js тесты против R2 (те же запросы)
 */

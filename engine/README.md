# Ragnell Engine

Движок генерации видео для Ragnell. Автор: **NeWerMoRe** — первый помощник автора,
генеральный директор отдела технической реализации.

Сейчас: **полный цикл работает на мок-бэкенде**, без единого ключа и без GPU.
Настоящая модель подключается заменой одной функции.

---

## Что уже работает

```
промпт → валидация → лимит по тарифу → очередь → прогресс → файл → ссылка
```

Проверено:

| Проверка | Результат |
|---|---|
| Без ключа | `401` |
| Промпт из одной буквы | `422`, «prompt too short» |
| 60 секунд на free-тарифе | `422`, «tier free allows max 5s» |
| Нормальная задача | `202` → очередь → `done` за 2.2 с (мок) |
| Дневной лимит | `usage: {used:1, limit:5, tier:"free"}` |
| Прогресс в браузере | `0% → 66% → 100%` |

---

## Файлы

| Файл | Что |
|---|---|
| `contract.js` | Контракт API: модели, тарифы, валидация. Общий для мока и боя |
| `mock-server.js` | Мок-бэкенд на чистом Node. Ноль зависимостей |
| `engine-client.js` | Клиент для браузера. Подключается в Ragnell |
| `worker.js` | Боевой воркер Cloudflare + Durable Object (очередь) + R2 |
| `modal_ltx.py` | GPU-воркер на Modal с настоящим LTX-Video |

---

## Запуск мока

```bash
node engine/mock-server.js          # http://0.0.0.0:8100
```

Ключи: `free-demo`, `pro-demo`, `studio-demo`.

```bash
curl -X POST localhost:8100/api/jobs \
  -H 'authorization: Bearer free-demo' \
  -d '{"prompt":"witch over neon city","durationSec":5,"aspect":"9:16"}'
```

---

## Тарифы (в коде, `contract.js`)

| Тариф | Клипов в день | Макс. длина | Модели | Водяной знак |
|---|---|---|---|---|
| free | 5 | 5 с | LTX-Video 2B | да |
| pro | 50 | 10 с | + LTX-2.5 22B | нет |
| studio | 400 | 30 с | LTX-2.5 22B | нет |

---

## Как подключить настоящий GPU

Три шага, каждый требует твоего аккаунта:

**1. Modal (бесплатные $30/мес, карта не нужна)**

```bash
pip install modal
modal token new
modal secret create hf-token HF_TOKEN=hf_xxx   # токен с huggingface.co/settings/tokens
modal deploy engine/modal_ltx.py
# → https://<user>--ragnell-ltx.modal.run
```

**2. Cloudflare (R2 + Workers — бесплатно)**

```bash
npx wrangler r2 bucket create ragnell-media
npx wrangler secret put GPU_TOKEN
npx wrangler secret put ADMIN_TOKEN
# в wrangler.toml: GPU_URL = "https://<user>--ragnell-ltx.modal.run"
npx wrangler deploy
```

**3. Ragnell**

```js
const eng = new RagnellEngine({ base: "https://ragnell-engine.<you>.workers.dev", key: "free-demo" });
```

Всё. Меняется только `base`.

---

## Модели и память

| Модель | Вес | Карта | Когда |
|---|---|---|---|
| LTX-Video 2B distilled | 5.9 ГБ | L4 24 ГБ | отладка и бета |
| LTX-2.5 22B NVFP4 | 17.4 ГБ | L40S / A100 | платный тариф |

Текстовый энкодер — отдельный вес: T5-XXL (у 0.9.8) или Gemma 4 12B (у 2.5).
Его держим на CPU, иначе не влезаем.

---

## Что осталось до публичного запуска

- [ ] аккаунт Modal, первый настоящий клип
- [ ] R2-бакет, заливка результата
- [ ] счётчик лимитов (KV или D1) вместо заглушки в `/api/usage`
- [ ] внятная авторизация вместо статических ключей
- [ ] персонажи: загрузка фото → IC-LoRA → `characterId` в задаче
- [ ] лендинг, галерея, тарифы (сейчас всё под паролем — так и решено)

---

## Экономика

$30 на Modal = **37 часов L4**. Клип 5 с на 2B distilled ≈ 45–60 с.
Значит **~2000 клипов в месяц** — это отладка + закрытая бета целиком, за ноль рублей.

Хранилище: R2 бесплатно 10 ГБ + 10 млн чтений, egress $0. Клип 720p 5 с — 1–3 МБ,
то есть 3000–5000 клипов помещаются в бесплатный тир.

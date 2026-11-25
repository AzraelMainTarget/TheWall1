# Cloudflare: что нажимать, где нажимать

Всё делается **в браузере телефона**, ничего ставить не нужно.
Автор: NeWerMoRe

---

## Главное правило

**Пароль от аккаунта мне не присылай. Никогда. Никому.**

Мне не нужен доступ к твоему аккаунту. Мне нужны **токены** — отдельные
ключи с ограниченными правами. Их можно отозвать в любой момент, не меняя пароль.

---

## Вариант А: Worker через панель (нужен твой вход)

1. Зайди на **dash.cloudflare.com** в браузере
2. Слева: **Workers & Pages** → **Create** → **Start with Hello World!** → **Deploy**
3. Появится редактор кода. Открой файл `worker-single.js` из этой папки,
   скопируй **всё** и вставь вместо кода-заглушки
4. **Deploy**
5. Запомни адрес вида `https://ragnell-engine.твой-ник.workers.dev`

Потом пришли мне **только адрес** — этого достаточно.

**Что я сделаю с адресом:** проверю `/api/health`, прогоню задачу, подключу к Ragnell.

---

## Вариант Б: ты присылаешь мне токен с ограниченными правами

1. **dash.cloudflare.com** → справа вверху аватар → **My Profile** → **API Tokens**
2. **Create Token** → **Create Custom Token**
3. Права (Permissions) — ровно такие, не больше:
   - `Account` → `Workers Scripts` → **Edit**
   - `Account` → `Workers R2 Storage` → **Edit**
   - `Account` → `Account Settings` → **Read**
4. Resources: **Include** → твой аккаунт
5. **Create Token** → скопируй строку

Этот токен **не даёт** доступа к паролю, домену, платежам и остальным настройкам.

**Отозвать:** та же страница → **Delete**. Одна кнопка.

---

## R2 (хранилище) — тоже через панель

1. **R2 Object Storage** → **Create bucket** → имя `ragnell-media`
2. Открой бакет → **Settings** → **Public access** → **Connect Domain**
   (нужен домен Cloudflare; без домена файлы не отдаются нормально)
3. Вернись в Worker → **Settings** → **Bindings** → **Add** → **R2 bucket**
   - Variable name: `MEDIA`
   - Bucket: `ragnell-media`

---

## Переменные воркера

Worker → **Settings** → **Variables and Secrets** → **Add**:

| Имя | Что | Тип |
|---|---|---|
| `ADMIN_TOKEN` | длинная случайная строка | **Secret** |
| `GPU_URL` | адрес GPU (позже) | Text |
| `GPU_TOKEN` | ключ GPU (позже) | **Secret** |

`ADMIN_TOKEN` придумай и сохрани — по нему ты входишь как владелец.

---

## KV для задач (необязательно, но полезно)

Worker → **Settings** → **Bindings** → **Add** → **KV namespace**
- Variable name: `JOBS`

Без него задачи не сохраняются между запросами — воркер ответит `no JOBS binding`.

---

## Что проверить первым

Открой в браузере:

```
https://твой-адрес.workers.dev/api/health
```

Должно ответить:

```json
{ "ok": true, "author": "NeWerMoRe", "backend": "cloudflare", "storage": "none" }
```

Если увидел это — воркер живой. Дальше присылай адрес, и я подключу остальное.

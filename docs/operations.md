# Production operations

## Docker Compose deployment

Для воспроизводимого запуска нужны Docker Engine и плагин Docker Compose v2 (`docker compose`).
Устаревший отдельный `docker-compose 1.x` не используйте для обновлений: он несовместим с новыми
версиями Docker Engine при пересоздании некоторых образов.

Подготовьте `.env` из примера и обязательно замените `TELEGRAM_INTERNAL_SECRET` случайным секретом.
Значение можно получить командой `openssl rand -hex 32`. Файл `.env` не попадает ни в git, ни в
Docker build context.

Минимальный стек без Telegram:

```bash
cp .env.example .env
docker compose build --pull api web smoke
docker compose up -d api web
docker compose ps
docker compose --profile operations run --rm smoke
```

Приложение доступно только на loopback-интерфейсе по адресу `http://127.0.0.1:8080`. Порт можно
изменить через `APP_PORT`. На публичном сервере поставьте перед ним TLS reverse proxy; не меняйте
loopback binding на `0.0.0.0`, если внешний доступ уже обеспечивает этот proxy.

В составе стека:

- `web` — непривилегированный nginx со SPA fallback, CSP и проксированием `/api`;
- `api` — непривилегированный Node.js-процесс, миграции и seed выполняются при старте;
- named volume `mentor-data` — постоянная SQLite-база, не зависящая от жизненного цикла контейнера;
- `smoke` — одноразовая проверка web, API, request ID, создания гостя и всех 60 материалов;
- `backup` — одноразовая проверенная копия базы в volume `mentor-backups`;
- `bot` и `scheduler` — опциональный Telegram profile.

API и web работают с read-only root filesystem, временными каталогами в `tmpfs`, без дополнительных
Linux privileges и не от root. Наружу опубликован только web-порт; API доступен внутри Compose-сети.
Healthchecks блокируют запуск web до готовности API и SQLite.

Для Telegram заполните `PUBLIC_APP_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL`,
`TELEGRAM_WEBHOOK_SECRET` и `VITE_TELEGRAM_BOT_USERNAME`. Webhook URL должен иметь вид
`https://example.com/telegram/webhook`; внешний TLS proxy должен передавать этот путь в web-контейнер.

```bash
docker compose --profile telegram up -d
docker compose --profile telegram ps
```

Обновление и проверка:

```bash
docker compose --profile operations run --rm backup
docker compose build --pull
docker compose up -d --remove-orphans
docker compose --profile operations run --rm smoke
docker compose logs --tail=200 api web
```

Не запускайте `docker compose down -v` в production: флаг `-v` удалит volumes базы и локальных
backup. Копии из `mentor-backups` всё равно необходимо регулярно выгружать на другой диск или во
внешнее хранилище.

## CI release gate

Workflow `.github/workflows/ci.yml` запускается для каждого push, pull request и вручную. Jobs
выполняются независимо:

- `Quality and unit tests` — Compose validation и полный `pnpm check`;
- `Browser E2E` — Chromium, desktop и mobile сценарии, с сохранением traces при ошибке;
- `Docker / api|web|bot|smoke` — BuildKit-сборка каждого runtime target без публикации.

Все сторонние actions закреплены по commit SHA. Dependabot еженедельно предлагает обновления npm,
Docker base images и GitHub Actions. Для основной ветки следует включить branch protection и сделать
все шесть CI checks обязательными: quality, E2E и четыре Docker targets.

CI намеренно не публикует образы и не выполняет production deployment. Это потребует отдельного
release workflow, registry credentials, выбранного окружения и ручного approval; добавлять такие
секреты до выбора registry и production-хоста не нужно.

## Конфигурация API

API валидирует конфигурацию до открытия порта. В `NODE_ENV=production` обязательны постоянный
`DATABASE_URL` (значение `:memory:` запрещено) и `TELEGRAM_INTERNAL_SECRET` длиной не менее 32
символов. `PORT` должен находиться в диапазоне 1–65535.

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATABASE_URL=/srv/frontend-mentor/data/mentor.db
TELEGRAM_INTERNAL_SECRET=replace-with-a-random-secret-of-32-characters
TRUST_PROXY_HOPS=1
```

`TRUST_PROXY_HOPS` по умолчанию равен `0`: заголовок `X-Forwarded-For` не считается доверенным.
Указывайте положительное число только когда API закрыт от прямого доступа и количество reverse
proxy перед ним фиксировано. Иначе клиент сможет подменить IP и обойти IP-based ограничения.

## Request ID, ошибки и rate limiting

API генерирует новый UUID для каждого запроса и возвращает его в `x-request-id`. Входящий
`x-request-id` намеренно игнорируется. Неожиданные `5xx` записываются в JSON-лог с request ID,
HTTP-методом и шаблоном маршрута; stack trace, путь базы и другие внутренние детали клиенту не
возвращаются. Тела запросов и `x-guest-token` в прикладной лог не добавляются.

Ограничения одного процесса:

- создание гостя — 30 запросов в минуту на IP;
- код привязки Telegram — 10 запросов за 10 минут на гостя;
- создание practice или interview-сессии — 30 запросов в минуту;
- сохранение настроек — 30 запросов в минуту;
- прогресс теории — 60 запросов в минуту;
- ответы и действия внутри интервью — 120 запросов в минуту.

При превышении возвращаются `429 RATE_LIMITED`, `retry-after` и `x-ratelimit-*`. Идентификаторы
гостя и IP хранятся в limiter только в виде SHA-256. Limiter находится в памяти процесса: для
нескольких реплик потребуется общий Redis-backed limiter, а на публичном reverse proxy всё равно
следует настроить отдельный грубый IP-limit.

Production-логи следует собирать из stdout как JSON. Для алертов полезны всплески `5xx`,
`DATABASE_BUSY` и неуспешный `/health`; одиночный `429` сам по себе не является аварией.

## SQLite backup

Команда создаёт согласованный снимок работающей SQLite-базы через `VACUUM INTO`, затем обязательно
проверяет `PRAGMA integrity_check` и `PRAGMA foreign_key_check`. Неуспешная или повреждённая копия
удаляется и не участвует в ротации.

```bash
DATABASE_URL=/srv/frontend-mentor/data/mentor.db \
BACKUP_DIR=/srv/frontend-mentor/backups \
BACKUP_KEEP=14 \
corepack pnpm@9.15.4 db:backup
```

`BACKUP_KEEP` — количество последних копий, минимум одна. Ротация затрагивает только файлы,
созданные приложением по шаблону `mentor-*.db`; посторонние файлы в каталоге сохраняются.
Каталог backup должен находиться вне public web-root, иметь отдельные права доступа и, желательно,
копироваться на другой диск или в удалённое хранилище.

Для ежедневного запуска используйте systemd timer или cron от отдельного системного пользователя.
Запускайте команду после `pnpm build`, поскольку production-команда использует собранный код из
`apps/api/dist`.

## Проверка копии

Любую SQLite-базу можно проверить без запуска API:

```bash
corepack pnpm@9.15.4 --filter @mentor/api db:verify /srv/frontend-mentor/backups/mentor-....db
```

Нулевой exit code означает, что структура SQLite читается, integrity check равен `ok`, а нарушений
foreign keys нет. Эту проверку следует периодически выполнять уже после копирования backup во
внешнее хранилище.

## Restore drill

Восстановление выполняется только при остановленных API и scheduler, чтобы старый WAL не записал
данные поверх восстановленного файла.

1. Остановить API и scheduler; убедиться, что процессы завершились.
2. Проверить выбранную копию командой `db:verify`.
3. Сохранить текущие `mentor.db`, `mentor.db-wal` и `mentor.db-shm` в отдельный аварийный каталог.
4. Скопировать backup на новый временный путь и ещё раз выполнить `db:verify`.
5. Заменить основной `mentor.db`; рядом не должно остаться старых `-wal` и `-shm` файлов.
6. Запустить API. При старте он применит только отсутствующие миграции.
7. Проверить `GET /health`, вход существующего тестового пользователя и дневную сессию.
8. Только после проверки запустить scheduler и Telegram webhook.

Не проверяйте restore поверх живой production-базы. Регулярный restore drill выполняйте на
отдельном временном пути или отдельном сервере.

## Release order

Безопасная последовательность обновления:

1. создать и проверить backup;
2. остановить процессы;
3. развернуть новую сборку;
4. запустить API и проверить `/health`;
5. запустить scheduler и bot webhook;
6. проверить логи первой отправки и отсутствие дублей.

# Развёртывание ZAMOVO на Cloudflare

Все файлы проекта находятся в корне GitHub-репозитория. В Cloudflare Workers Builds укажите Root directory = `/` (или оставьте пустым, если Cloudflare трактует пустое значение как корень репозитория). Это именно Worker со Static Assets, не Pages.

## 1. Подключить репозиторий

1. Cloudflare Dashboard → Workers & Pages → Create application → Workers.
2. Создайте Worker с именем `zamovo` либо подключите GitHub к существующему Worker.
3. Подключите `stroldek/LD_software`, production branch `main`.
4. Build command оставьте пустой. Deploy command: `npx wrangler deploy`.
5. Root directory — корень репозитория, не указывайте вложенную папку.

## 2. Создать D1

1. Cloudflare Dashboard → Storage & databases → D1 SQL Database → Create.
2. Имя базы: `zamovo-db`.
3. Скопируйте Database ID.
4. Откройте `wrangler.jsonc` в GitHub и замените `REPLACE_WITH_D1_DATABASE_ID` на реальный ID. Сохраните изменение в `main`. Это единственное значение инфраструктуры, которое не является секретом.
5. В настройках Worker проверьте D1 binding: variable name `DB`, database `zamovo-db`. Конфигурация Wrangler создаёт binding при deploy.

## 3. Добавить секрет входа

Worker → Settings → Variables and Secrets → Add → Secret:
- Name: `ADMIN_TOKEN`
- Value: длинный уникальный пароль (лучше 32+ случайных символа).

Не добавляйте токен в GitHub, код или обычные Variables. После сохранения выполните новый deploy, если Cloudflare этого требует.

## 4. Применить миграцию

В терминале Cloudflare Workers Build / локальном терминале с Wrangler выполните:

`npx wrangler d1 migrations apply zamovo-db --remote`

Миграция создаёт таблицы лидов, разделов, связей, истории заданий, очереди, журнала и индексы. Повторное применение уже применённой миграции безопасно.

## 5. Проверить запуск

Откройте адрес Worker:
- `/api/health` — публичная проверка Worker, версии и наличия D1 binding.
- `/` — интерфейс входа.

Войдите с `ADMIN_TOKEN`. Добавьте тестового лида с числовым Telegram ID, создайте раздел и проверьте, что счётчики обновились.

## Важно

- Не создавайте Pages-проект для этой конфигурации. Используется Cloudflare Worker + Static Assets.
- Не публикуйте `ADMIN_TOKEN`, Telegram API hash или пользовательскую Telegram-сессию.
- Telegram-подключение ещё не входит в этот фундаментальный этап. Не добавляйте Telegram API credentials до отдельного этапа интеграции.
- До применения миграции D1 таблиц не будет, поэтому API после авторизации вернёт ошибку базы.

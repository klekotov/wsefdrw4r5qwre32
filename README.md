# Multi Tool Relay

Небольшой relay-сервер для Bothost:

```text
Multi Tool → Bothost Relay → Webshare → Cloudflare Worker
```

Сервер не принимает произвольный URL, поэтому его нельзя использовать как
открытый прокси. Он пересылает только заранее заданные маршруты лицензии.

## Маршруты

- `GET /health` — проверка доступности relay без авторизации.
- `POST /api/license/check` — пересылается в Worker на `/api/license/check`.
- `POST /api/license/activate` — пересылается в Worker на `/api/license/activate`.

Для двух маршрутов лицензии нужен заголовок:

```text
X-Relay-Token: значение-RELAY_TOKEN
```

## Запуск в Bothost

1. Создайте отдельный GitHub/GitLab-репозиторий.
2. Загрузите в корень репозитория файлы из этой папки:
   - `index.js`
   - `package.json`
3. При создании проекта Bothost выберите Node.js.
4. Добавьте переменные окружения из `.env.example` в настройках Bothost.
5. Включите домен и порт проекта.
6. После запуска проверьте:

```text
https://ваш-домен.bothost.ru/health
```

Ожидаемый ответ:

```json
{"ok":true,"service":"multi-tool-relay"}
```

## Безопасность

- Не добавляйте `.env` и настоящие значения переменных в Git.
- Не отправляйте токен Telegram, пароль Webshare или `RELAY_TOKEN` в чат.
- `WEBSHARE_*` должны храниться только в переменных окружения Bothost.
- Текущая версия рассчитана на HTTP/HTTPS-прокси Webshare. Для SOCKS5 понадобится другой сетевой адаптер.
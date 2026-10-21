# 🔗 Настройка Telegram Webhooks

**Последнее обновление:** 20 октября 2026  
**Статус:** ✅ Исправлено (error handling)

## Проблема: Скрипт падает при проверке статуса вебхука

**Ошибка была:** При выполнении `_setup-webhooks.sh` скрипт падал с exit code 1 при проверке статуса вебхука.

**Причина:** В скрипте использовалось `set -e`, которое вызывает выход при любой ошибке команды. Функция `check_webhook_status()` использовала `grep` без обработки случаев, когда grep не находит совпадений.

**Исправление:** 
1. Заменено `set -e` на `set -u` (только для неопределённых переменных)
2. Добавлена обработка ошибок в `grep` с помощью `|| true`
3. Обработка ошибок curl с fallback `2>/dev/null || echo '{"ok":false}'`
4. Проверки теперь явные с `if [ -n "$var" ]` вместо неявных

---

## 🚀 Как Использовать

### Вариант 1: Автоматический (Рекомендуемый)

```bash
# Переходи в папку скриптов
cd specs/002-service-cart-and-staff-bot/checklists/scripts

# Запусти скрипт (переменные возьмутся из .env)
bash _setup-webhooks.sh
```

**Требования:**
- `.env` файл должен содержать:
  - `TELEGRAM_BOT_TOKEN` — реальный токен от @BotFather
  - `STAFF_BOT_TOKEN` — второй бот от @BotFather
  - `PUBLIC_URL` — публичный URL сервера (cloudflared/ngrok)
  - `TELEGRAM_WEBHOOK_SECRET` — произвольная строка для подписи
  - `STAFF_WEBHOOK_SECRET` — произвольная строка для подписи

### Вариант 2: С Переменной Окружения

```bash
PUBLIC_URL=https://myserver.com bash _setup-webhooks.sh
```

Если `TELEGRAM_BOT_TOKEN` не в `.env`, задай её:
```bash
export TELEGRAM_BOT_TOKEN="7965572993:ABC-DEF1234567890XYZ"
export STAFF_BOT_TOKEN="8298336741:XYZ-ABC9876543210DEF"
export PUBLIC_URL="https://underundre.undrexplorer-4g.netcraze.pro/"
bash _setup-webhooks.sh
```

### Вариант 3: Ручная Регистрация (Для Troubleshooting)

Если скрипт не работает, зарегистрируй вебхуки вручную:

```bash
# Для Client Bot
curl -X POST \
  "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://yourserver.com/api/bot/telegram/webhook" \
  -d "secret_token=test_telegram_secret"

# Для Staff Bot
curl -X POST \
  "https://api.telegram.org/bot<STAFF_BOT_TOKEN>/setWebhook" \
  -d "url=https://yourserver.com/api/bot/staff/webhook" \
  -d "secret_token=test_staff_webhook_secret"
```

Заменить:
- `<TELEGRAM_BOT_TOKEN>` на реальный токен от @BotFather
- `<STAFF_BOT_TOKEN>` на второй токен
- `https://yourserver.com` на публичный URL

---

## ✅ Проверка Статуса

### Через Скрипт (Автоматически)

```bash
bash _setup-webhooks.sh
```

Скрипт сам проверит статус обоих вебхуков.

### Через curl (Вручную)

```bash
# Проверить Client Bot
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | jq .

# Проверить Staff Bot
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | jq .
```

Ожидаемый ответ:
```json
{
  "ok": true,
  "result": {
    "url": "https://yourserver.com/api/bot/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0,
    "last_error_message": "",
    "last_synchronization_error_date": 0,
    "max_connections": 40,
    "allowed_updates": []
  }
}
```

---

## 🔧 Что Делает Скрипт

1. **Загружает .env** — если переменные не в окружении
2. **Проверяет обязательные переменные:**
   - `PUBLIC_URL` — должна быть полный URL вида `https://example.com`
   - `TELEGRAM_BOT_TOKEN` — токен от @BotFather
   - `STAFF_BOT_TOKEN` — второй токен
3. **Регистрирует вебхуки:**
   - Отправляет запрос `setWebhook` для каждого бота
   - Устанавливает `secret_token` для верификации
4. **Проверяет статус:**
   - Вызывает `getWebhookInfo` для каждого бота
   - Выводит URL вебхука и статус сертификата

---

## ⚠️ Частые Проблемы

### 1. "FAIL" при регистрации

```
[*]   Registering Client Bot webhook... [FAIL]
       Response: {"ok":false,"error_code":404,"description":"Not Found"}
```

**Решение:**
- Проверь, что `TELEGRAM_BOT_TOKEN` правильный (начинается с цифр, содержит `:`)
- Проверь у @BotFather: `/mybots` → выбери бота → `API Token`
- Скопируй ровно, без пробелов в начале/конце

### 2. "FAIL" при проверке статуса

```
[*]   Checking Client Bot webhook status... [FAIL]
       Response: {"ok":false}
```

**Решение:**
- Сервер может быть недоступен — проверь `npm run dev`
- Проверь что `PUBLIC_URL` доступен: `curl https://yourserver.com`
- Cloudflared/ngrok может упасть — перезапусти туннель

### 3. Webhook registered но не работает

Если вебхук зарегистрирован, но боты не отвечают:
- Убедись что сервер запущен: `npm run dev`
- Проверь firewall/NAT — 443 порт открыт
- Проверь логи: `npm run dev` должен печатать входящие вебхуки

### 4. "No webhook registered yet"

```
[*]   Checking Client Bot webhook status... [INFO] No webhook registered yet
```

Это **нормально** если вебхук не был зарегистрирован. Следующий запуск скрипта его зарегистрирует.

---

## 🔒 Безопасность

### Secret Token

Скрипт устанавливает `secret_token` для каждого вебхука. Telegram будет отправлять этот токен в заголовке `X-Telegram-Bot-Api-Secret-Token`.

**Важно:** Сервер должен проверять этот токен перед обработкой запроса!

```javascript
// В lib/api/telegram/webhook.ts должна быть проверка:
const secret = req.get('X-Telegram-Bot-Api-Secret-Token');
if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

### HTTPS Требование

Telegram требует HTTPS для всех вебхуков. Используй:
- **cloudflared** (встроена в Docker)
- **ngrok** (также поддерживает HTTPS)

Не используй обычный HTTP — Telegram отклонит регистрацию.

---

## 📋 Чеклист Перед Тестированием

- [ ] `TELEGRAM_BOT_TOKEN` задана в `.env` (реальный токен)
- [ ] `STAFF_BOT_TOKEN` задана в `.env` (реальный токен)
- [ ] `PUBLIC_URL` задана и доступна из интернета
- [ ] Сервер запущен: `npm run dev` в отдельном терминале
- [ ] БД запущена: `docker-compose up -d db`
- [ ] Скрипт выполнен: `bash _setup-webhooks.sh`
- [ ] Оба вебхука показывают `[OK]`
- [ ] Статус: `URL: https://...` и никаких `[FAIL]`

---

## 🧪 Тестирование Вебхука

После регистрации проверь что вебхук работает:

### Через Telegram Бот

1. Открой чат с ботом `@underundre_bot` (client bot)
2. Отправь `/start`
3. Проверь консоль сервера — должно быть что-то вроде:
   ```
   [webhook] Received update from client bot: user_id=123456789 message_id=456
   ```

### Через curl

```bash
# Имитируй вебхук запрос
curl -X POST https://underundre.undrexplorer-4g.netcraze.pro/api/bot/telegram/webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: test_telegram_secret" \
  -d '{
    "update_id": 123456789,
    "message": {
      "message_id": 1,
      "from": {"id": 123, "is_bot": false, "first_name": "Test"},
      "chat": {"id": 123, "type": "private"},
      "date": 1234567890,
      "text": "/start"
    }
  }'
```

Ожидаемый ответ: `200 OK` и логирование на сервере.

---

## 📚 Полезные Ссылки

- **Telegram Bot API Webhooks:** https://core.telegram.org/bots/api#setwebhook
- **Cloudflared Setup:** https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **ngrok:** https://ngrok.com/
- **BotFather Commands:** https://core.telegram.org/bots/features#botfather

---

## ✨ Итоговый Результат

После успешного выполнения скрипта:

```
╔════════════════════════════════════════════════════════════════════════════╗
║                      ✓ Webhooks registered                                  ║
╚════════════════════════════════════════════════════════════════════════════╝

Next steps:
1. Make sure the server is running: npm run dev
2. Run tests: bash run-all.sh
3. Test live interaction in browser or via @userinfobot
```

Все! Теперь можешь запускать тесты. 🚀

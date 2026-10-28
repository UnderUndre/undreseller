# Quickstart: 006 Tracer Bullet

> Минимальный end-to-end путь: интерфейс → сервис → БД → внешний Google. Локально, test-проект Google Cloud + test-данные (без реальных денег).

## 0. Пререквизиты

```bash
# .env дополнения (локально)
INTEGRATION_ENCRYPTION_KEY="<openssl rand -base64 32>"
PUBLIC_API_KEY="<openssl rand -hex 32>"
GOOGLE_OAUTH_CLIENT_ID="<...>.apps.googleusercontent.com"     # test-проект Google Cloud
GOOGLE_OAUTH_CLIENT_SECRET="<...>"
npx prisma migrate deploy             # 20270201000000_006_integrations — expand
```

Google Cloud Console (test-проект): OAuth consent screen (external, test-users), Credentials → OAuth Client (Web): authorized redirect `http://localhost:3000/api/admin/integrations/gcal/callback`. Scope'ы: `calendar.events`, `calendar.readonly`.

## 1. Трейсер (≤20 минут)

1. **Connect**: `/admin/settings` → секция Integrations → «Connect Google Calendar» (OWNER) → consent → статус `CONNECTED`; в БД `IntegrationCredential.encryptedPayload` не содержит открытого текста, `resourceId` = выбранный ресурс.
2. **Push**: создать бронь (book → confirm) → ≤60 с в GC появляется событие `"<услуга> — <orderNumber>"` с контактом; `stripe listen`-аналог не нужен — Google-side проверка глазами. Повторить тот же переход (реплей) → дубля нет.
3. **Meet**: включить `remoteMeetingEnabled` у услуги → новая бронь → событие GC содержит Meet-ссылку.
4. **Import**: в GC создать стороннее событие на ближайший час → дождаться sync-цикла (≤15 мин) → слот на витрине исчез; busy-строка в `ExternalBusyBlock` без названий/гостей. Удалить событие в GC → после цикла busy-строка исчезла, слот вернулся.
5. **Cancel**: отменить бронь в Staff-боте → событие в GC удалено; статус в админке `CONNECTED`.
6. **Reauth**: удалить доступ приложения в Google-аккаунте (Security → Third-party) → следующий цикл → статус `NEEDS_REAUTH` + баннер в админке; брони при этом продолжают создаваться (fail-open).
26	7. **Webhook**: `POST /api/admin/webhooks` с URL тест-бина (webhook.site) → ответ возвращает полный `secret` единожды и `secretPrefix`; событие `booking.created` пришло ≤5 с, подпись `X-Undreseller-Signature` валидна (проверить HMAC вручную по формуле контракта); выключить бин → 5 ретраев → `failureCount=1`, audit `WEBHOOK_DELIVERY_FAILED`.
27	8. **Public API**: `curl -H "Authorization: Bearer $PUBLIC_API_KEY" localhost:3000/api/public/bookings?from=...&to=...` → 200 JSON со структурой `{ data: [...], nextCursor }`; без ключа → 401; 31-й запрос в минуту → 429.
9. **ICS**: оформить бронь с email → письмо содержит валидный `booking-<orderNumber>.ics` (импорт в GC открывает корректное событие с TZID).
10. **zod**: `npm audit --audit-level=high` → 0 H/C; `npm test` → 50+ suites зелёные; снапшоты 400-форм идентичны.

## 2. Критерий прохождения

Все 10 шагов дают точные ожидаемые состояния БД/UI/GC выше; `npm run validate` + `npm test` зелёные. Трейсер гоняется на свежем клоне до старта tasks-фазы (интеграционные дыры ловим до распила на задачи).

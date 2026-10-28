# Contract: Outbound Webhooks & Public Read API (FR-606..FR-608)

> Инфраструктурный контур (лимит «≤1 бизнес-интеграция» не расходует — классификация requirements.md §3). Доставка через Inngest (канон 004).

## 1. Event Envelope

```jsonc
POST <endpoint-url>
Headers:
  Content-Type: application/json
  X-Undreseller-Signature: t=<unixSeconds>, v1=<hex>
  X-Undreseller-Timestamp: <unixSeconds>
Body:
{
  "eventId": "<uuid>",            // idempotency key для приёмника
  "type": "booking.created",      // закрытый список ниже
  "occurredAt": "<ISO-8601 UTC>",
  "data": {
    "orderId": "<uuid>",
    "orderNumber": "ORD-...",
    "status": "BOOKED",            // DB-термины 004
    "serviceTitle": "...",
    "startsAt": "<ISO UTC>", "endsAt": "<ISO UTC>",
    "fulfillmentMode": "IN_CALL | OUT_CALL",
    "totalMinor": 15000, "currency": "USD",
    "customer": { "name": "[MASKED]", "phone": "[MASKED]" }  // pii=masked по умолчанию
  }
}
```

**События (закрытый список)**: `booking.created`, `booking.confirmed`, `booking.cancelled`, `booking.paid`, `booking.rescheduled`.

## 2. Подпись (HMAC-SHA256)

- `v1 = HMAC_SHA256(secret, `${t}.${rawBody}`)`; приёмник обязан проверить `t` ±5 мин (анти-replay) и сравнение constant-time.
- Секрет генерируется системой (32B random, base64url, формат `whsec_<base64url>`), показывается **однократно** при создании.
- **Хранение секрета**: хранится зашифрованным AES-256-GCM в `WebhookEndpoint.encryptedSecret` (`lib/integrations/secretVault.ts`). Для UI админки открыто хранится `secretPrefix` (`whsec_` + первые 6 hex-символов). Воркер доставки расшифровывает секрет в памяти непосредственно перед вычислением HMAC.

## 3. Доставка (FR-606)

- Публикация: FSM-переходы → Inngest event → fan-out fn по активным (`active=true`) эндпоинтам, подписанным на тип события.
- Ретраи: Inngest `retries: 5` (экспоненциальный backoff). Исчерпание → `failureCount += 1`, audit `WEBHOOK_DELIVERY_FAILED`, алерт в `STAFF_CHAT_ID`. **Счётчик «подряд» (F7-семантика): успешная доставка (2xx) → `failureCount = 0`** — breaker срабатывает только на 10 последовательных неудачах, кумулятивные сбои за месяцы его не выстреливают.
- **Circuit Breaker (F7)**: при достижении `failureCount >= 10` подряд эндпоинт автоматически переводится в `active = false`, логируется audit `WEBHOOK_DISABLED` и отправляется критический алерт в `STAFF_CHAT_ID`. Реактивация и сброс `failureCount` производятся OWNER'ом в `/admin/settings`.
- **SSRF-гейт и защита от DNS Rebinding (F4)**:
  - Регистрация: только схема `https:`, валидация домена/IP по дени-листу приватных сетей (`127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fc00::/7`).
  - Вызов: отправка через кастомный HTTP Dispatcher (`undici.Agent` / socket connect hook) с валидацией IP-адреса непосредственно в момент установки TCP/TLS-соединения (pinning resolved IP). При попытке резолва в запрещенный IP соединение мгновенно сбрасывается. Редиректы категорически не следуются (`maxRedirections: 0`).
- Test ping: `POST { type: "ping", data: { sentBy, at } }` с валидной подписью.
- Timeout вызова: 5 с.

## 4. Registry API (OWNER, `/api/admin/webhooks`)

| Метод | Поведение |
|---|---|
| `GET` | список (url, events, active, failureCount, secretPrefix, lastDeliveryStatus; полный секрет не отдается) |
| `POST` | создать (≤5 активных — иначе 422; url — SSRF-гейт; events — валидация по списку) → ответ содержит полный `secret` единожды + `secretPrefix` |
| `PATCH /:id` | реактивация эндпоинта (`active = true`, сброс `failureCount = 0`) после срабатывания circuit breaker |
| `DELETE /:id` | деактивировать/удалить + audit `WEBHOOK_DELETED` |

## 5. Public Read API (FR-608, `GET /api/public/bookings`)

- Auth: `Authorization: Bearer <PUBLIC_API_KEY>` (env per-instance); невалидный/отсутствующий → 401 (constant-time compare).
- Query: `from`, `to` (ISO UTC, окно ≤31 день), `status` (опц.), `cursor` (пагинация, ≤100/стр).
- **Контракт ответа и пагинация (F10)**:
  ```jsonc
  {
    "data": [ /* массив PublicBooking с маскированными ПДн */ ],
    "nextCursor": "<base64_compound_cursor>" // opaque строка "createdAt_id" или null, если последняя страница
  }
  ```
- Rate limit: 30 req/min (канон `enforceRateLimit` 004).
- Мутации: 405. Логирование: `API_KEY_USED` (без ключа в логах).

## 6. Consumer-driven contract tests (T041/T042)

| Сценарий | Ожидание |
|---|---|
| валидная подпись, живой timestamp | приёмник принимает |
| подменённое тело | подпись не сходится |
| timestamp ±6 мин | reject (анти-replay) |
| сбойный эндпоинт 5xx ×6 | 5 ретраев → `failureCount += 1`, audit, алерт |
| сбойный эндпоинт 9 раз подряд, затем успех, затем ещё 9 сбоев | breaker НЕ сработал (успех сбросил счётчик: `failureCount = 0` после 2xx) |
| сбойный эндпоинт 10 раз подряд | circuit breaker: `active = false`, audit `WEBHOOK_DISABLED` |
| 6-й эндпоинт | 422 |
| `http://` / `localhost` / `169.254.x` / DNS Rebinding | 422 при регистрации / мгновенный abort при вызове (SSRF-гейт) |
| API без ключа / кривой ключ | 401 |
| 31-й запрос в минуту | 429 |
| write-метод на public API | 405 |
| окно `from..to` > 31 дня | 422 |
| `pii=masked` | контакты `[MASKED]` в payload |
| пагинация по `nextCursor` | детерминированная выдача следующей страницы |

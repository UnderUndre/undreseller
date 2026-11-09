# Research: 005-google-calendar-sync (re-scope: Calendar Feed)

> Plan Phase 0 — Engineering Decisions (D1–D6). Grounding: RFC 5545 (L2), 002/003/004 as-built (`c5f3bf1`, `3697b3d`, `9efe76a`) + Review fixes (rev 2.1).

## D1. Сериализация ICS: **hand-rolled RFC 5545 писатель** (0 deps)

- **Decision**: `src/lib/calendar/ics.ts` — чистая функция `buildFeed({ resourceName, bookings, host })` → RFC 5545 `string`.
  - **Обязательные заголовки VCALENDAR**:
    - `PRODID:-//UnderUndre//undreseller//EN` (MANDATORY по RFC 5545 §3.6);
    - `VERSION:2.0` (MANDATORY по RFC 5545 §3.6);
    - `CALSCALE:GREGORIAN`;
    - `METHOD:PUBLISH`;
    - `X-WR-CALNAME:<resourceName>`;
    - `REFRESH-INTERVAL;VALUE=DURATION:PT15M`.
  - **Инвариант окончаний строк CRLF**: Все строки разделяются строго последовательностью `\r\n` (CRLF), одиночные `\n` запрещены RFC 5545 §3.1.
  - **RFC 5545 §3.1 Line Folding (> 75 octets)**:
    - Любая строка, чья длина в байтах превышает 75 октетов (без учета CRLF), переносится: на границе ≤ 75 байт вставляется `\r\n ` (CRLF и пробел).
    - Перенос обязан быть безопасным для UTF-8: граница переноса не может разделять байты одного многобайтового символа.
  - **Экранирование символов RFC 5545 §3.3.11**:
    - Запятые `,` → `\,`, точки с запятой `;` → `\;`, обратные слэши `\` → `\\`, переводы строк `\n` → `\n`.
  - **Фоллбэки для SUMMARY**:
    - `serviceName = booking.serviceName || 'Запись'`;
    - `customerName = booking.customerName?.trim() || 'Клиент'`;
    - `SUMMARY:${escapeText(serviceName)} — ${escapeText(customerName)}`.
- **Rationale**: 0 новых зависимостей (NFR-502). Собственный легковесный генератор с полным соответствием RFC гарантирует отсутствие конфликтов с парсерами Google Calendar, Apple iCal и Microsoft Outlook.

## D2. Токен фида и безопасность полей: **вычислимый HMAC + adminOnlyFieldAccess**

- **Decision**:
  - Токен = `hashToken('calendar-feed:v' + version + ':' + resourceId)` — вычисляемый HMAC-SHA256 на ключе `PAYLOAD_SECRET` (канон `src/lib/booking/tokens.ts`);
  - Токен **не хранится в базе данных**, сверка производится через `timingSafeEqual`;
  - Версия хранится в поле `Resources.feedTokenVersion` (integer, defaultValue: 1, min: 1);
  - **Безопасность полей**: Поле `feedTokenVersion` в `src/collections/Resources.ts` закрыто через `access: { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess }`, что исключает утечку внутренней соли версий токенов через публичный REST API `/api/resources`.
  - Ротация: инкремент `feedTokenVersion = feedTokenVersion + 1` в транзакции + фиксация в `AuditEvents` (D6). Webcal URL формируется как: `webcal://<host>/api/calendar/feed/<resourceId>?token=<hmac>`.
- **Rationale**: Ноль дополнительных таблиц, невозможность подделки без знания `PAYLOAD_SECRET` (256-bit стойкость), мгновенная инвалидация скомпрометированных ссылок.

## D3. DTSTAMP и детерминизм: **из `updated_at` брони**

- **Decision**: `DTSTAMP` каждого `VEVENT` формируется строго из `slot_reservations.updated_at` в формате UTC `YYYYMMDDTHHMMSSZ`.
- **Rationale**: Обеспечивает абсолютную детерминированность сгенерированного тела фида при неизменных данных броней. Позволяет надежно вычислять `ETag` и возвращать `304 Not Modified`.

## D4. Полная матрица статусов и SEQUENCE

- **Decision**:
  - Полный маппинг статусов `slot_reservations.status` в RFC 5545 `STATUS` и `SEQUENCE`:
    | DB Status (`slot_reservations`) | RFC 5545 `STATUS` | RFC 5545 `SEQUENCE` | Отображение в календаре |
    | :--- | :--- | :--- | :--- |
    | `BOOKED` | `CONFIRMED` | 0 | Подтвержденная запись |
    | `HELD` | `TENTATIVE` | 0 | Временный холд (ожидает завершения) |
    | `PAYMENT_PENDING` | `TENTATIVE` | 0 | Ожидание платежа |
    | `PENDING_APPROVAL` | `TENTATIVE` | 0 | Ожидает аппрува оператором |
    | `RELEASED` | `CANCELLED` | 1 | Отменено / освобождено |
    | `CANCELLED` | `CANCELLED` | 1 | Отменено клиентом / персоналом |
    | `STAFF_REJECTED` | `CANCELLED` | 1 | Отклонено оператором |
  - Статус `UNDERPAID`: исключается из фида (бронь не состоялась) либо маркируется `CANCELLED`.
  - Для активных записей `SEQUENCE:0`. При отмене (`CANCELLED` / `RELEASED` / `STAFF_REJECTED`) `SEQUENCE:1`. Переносы времени (reschedule) обновляют `DTSTART/DTEND` и `DTSTAMP`, что в модели `METHOD:PUBLISH` корректно обрабатывается всеми вендорами.

## D5. Endpoint: HTTP-кэширование, Rate Limiting и поддержка HEAD

- **Decision**: `src/app/api/calendar/feed/[resourceId]/route.ts`:
  - **Поддержка методов**: роут экспортирует `GET` и `HEAD`.
  - **Rate Limiter**: ключ `feed:${resourceId}:${ip}`, лимит `30 requests / 60 seconds`.
    - *Почему не чистый IP*: Краулеры Google Calendar и Apple Calendar опрашивают разные календари с фиксированных пулов внешних IP. Ограничение 10/60s на IP блокировало бы синхронизацию при подписке на несколько мастеров или при первичной верификации фида краулером. Ключ по ресурсу + IP защищает инстанс от флуда и не ломает подписки.
  - **HTTP-кэширование (ETag / 304 Not Modified)**:
    - Заголовки ответа: `Cache-Control: private, max-age=300, must-revalidate`;
    - Вычисляется слабый ETag от тела фида: `ETag: W/"<sha256(icsBody).slice(0, 16)>"`;
    - Если заголовок запроса `If-None-Match` совпадает с текущим ETag → немедленный возврат статуса `304 Not Modified` с пустым телом (время ответа < 5 мс, экономия 100% исходящего трафика тела календаря).
  - **Защита PII**: Тело фида никогда не выводится в логи (NFR-504). `DESCRIPTION` не генерируется. В `SUMMARY` включаются только название услуги и имя клиента (с фоллбэками D1).

## D6. Админ-поверхность и схема аудита

- **Decision**:
  - `GET /api/admin/calendar-feed/[resourceId]`: возвращает `{ url: 'webcal://...' }` (только для роли `OWNER`);
  - `POST /api/admin/calendar-feed/[resourceId]`: инкрементирует `feedTokenVersion`, немедленно инвалидируя предыдущую ссылку, и записывает событие в `AuditEvents`:
    - `action: 'calendar.feed-rotated'`;
    - `actorId: req.user.id`;
    - `aggregateType: 'RESOURCE'`;
    - `aggregateId: String(resourceId)`;
    - `metadataJson: { previousVersion, newVersion }`.
  - Минимальный UI: компонент `CalendarFeedLink` в админ-панели ресурса (кнопки «Копировать ссылку подписки» и «Отозвать/ротировать токен»).

# Research: 005-google-calendar-sync (re-scope: Calendar Feed)

> Plan Phase 0 — Engineering Decisions (D1–D6). Grounding: RFC 5545 (L2), 002/003/004 as-built (`c5f3bf1`, `3697b3d`, `9efe76a`).

## D1. Серилизация ICS: **hand-rolled писатель** (0 deps)

- **Decision**: `src/lib/calendar/ics.ts` — чистая функция `buildFeed({ resourceName, bookings, host })` → строка RFC 5545. Нужен минимум: VCALENDAR(CALSCALE, METHOD:PUBLISH, X-WR-CALNAME, REFRESH-INTERVAL) + VEVENT(UID, DTSTAMP, DTSTART/DTEND `Z`, SUMMARY, STATUS, SEQUENCE, TRANSP:OPAQUE). Escape-правила RFC 5545 §3.3.11 (`,`/`;`/`\`/переводы строк → `\,` `\;` `\\` `\n`) — тестами.
- **Rationale**: dep ради 4 полей — против NFR-502; full-парсер не нужен (мы только пишем). Линия CRLF (`\r\n`) — RFC-инвариант, тест.
- **Alternatives**: пакет `ics` (лишний dep, тянет CJS-хвосты), шаблон руками в route (нетестируемо).

## D2. Токен фида: **HMAC(secret, resourceId) без хранения** (канон 003 tokens)

- **Decision**: токен = `hashToken('calendar-feed:' + resourceId)` — вычисляемый HMAC, **в БД не хранится**; валидация = timing-safe пересчёт. Ротация = salt-версия: `'calendar-feed:v<N>:' + resourceId`, где `v<N>` хранится в `Resources.feedTokenVersion` (int, default 1) — rotate = инкремент версии + audit `calendar.feed-rotated` (FR-504). Webcal URL: `webcal://<host>/api/calendar/feed/<resourceId>?token=<hmac>`.
- **Rationale**: ноль новых таблиц/полей-хешей (версия — одно int-поле); утечка лечится инкрементом; перебор бессмыслен (256-bit).
- **Alternatives**: random-токен в БД (таблица + хеш) — избыточно для вычислимого секрета.

## D3. DTSTAMP и детерминизм: **из `updated_at` брони** (audit LOW-note #2)

- **Decision**: `DTSTAMP = updated_at брони (UTC)`; тело фида детерминировано при неизменных данных. Для инстанс-строк (VCALENDAR-заголовок) DTSTAMP не пишем (RFC не требует на VCALENDAR).
- **Rationale**: байт-стабильность тела упрощает ETag/кэширование и тесты; RFC 5545 требует лишь наличия DTSTAMP в VEVENT.

## D4. SEQUENCE-семантика: **счётчик изменений в строке брони** (audit LOW-note #1)

- **Decision**: `SEQUENCE` = число фактических изменений содержимого события. Вычисляемо без нового поля: `status change` → +1, `reschedule (start_time ≠ предыдущего)` → +1. Хранить лениво нельзя (updated_at не различает), поэтому: SEQUENCE = 0 при создании; при CANCELLED/изменении времени — выводим из `schedule_version` parity не надёжен → **упрощение**: SEQUENCE = 0 для активных, 1 для CANCELLED (единственное видимое подписчику изменение — отмена; reschedule меняет DTSTART, календари обновляют события по UID+DTSTAMP без SEQUENCE-роста для PUBLISH-фидов).
- **Rationale**: METHOD:PUBLISH + стабильный UID + новый DTSTAMP — подписчики перечитывают событие; SEQUENCE>0 требуется в основном для REQUEST-модели. Фиксируем упрощение и тест (cancel → SEQUENCE:1).
- **Alternatives**: полноценный счётчик изменений (новое поле + хук) — для PUBLISH-фида оверкилл.

## D5. Endpoint + PII-gate: **read-only route, тело не логируется**

- **Decision**: `src/app/api/calendar/feed/[resourceId]/route.ts` — rate limit (канон 002, 10/60s per IP), timing-safe токен-сверка, выборка броней ресурса в окне now−7d…now+90d (B-tree `(resource_id, start_time)`), сборка через D1. `logger`-вызовы без тела фида (NFR-504). SUMMARY = `${serviceName} — ${customerName}`; DESCRIPTION опускаем вовсе (минимум PII-поверхности).
- **Rationale**: PII-граница (FR-503) дешевле соблюсти отсутствием поля, чем фильтром.

## D6. Админ-поверхность: **ReadOnly-блок в Resources admin + rotate-эндпоинт**

- **Decision**: `Resources.feedTokenVersion` (int, default 1, admin readOnly); `GET/POST /api/admin/calendar-feed/[resourceId]` (OWNER-only, канон approvals): GET → текущий webcal URL; POST → rotate (version++, audit). UI — минимальная клиентская кнопка в карточке ресурса (copy link), вне спек-объёма детальной верстки.
- **Rationale**: владелец должен уметь отдать ссылку мастеру и отозвать её без БД.

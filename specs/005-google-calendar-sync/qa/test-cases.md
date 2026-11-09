# Test Cases: 005-google-calendar-sync (ISO/IEC/IEEE 29119-3)

**Всего TC**: 12 · Профиль: EP + BVA + Security DT + PII-grep + RFC-валидация

## US1: Endpoint, кэширование и токен (FR-501)

### TC-005-001: валидный токен → 200 `text/calendar; charset=utf-8`; невалидный/устаревший → 403 FEED_FORBIDDEN; чужой ресурс → 403; поле feedTokenVersion скрыто от публичного REST API (/api/resources)
- **Priority**: P0 · **Security DT**

### TC-005-002: rate limit per-resource+IP (30/60s) — 31-й запрос к тому же ресурсу с одного IP → 429 + Retry-After; запрос к другому ресурсу с того же IP не блокируется (защита Googlebot/Apple crawler, BVA)
- **Priority**: P1 · **BVA**

### TC-005-003: timing-safe сверка — перебор токенов не даёт оракула (константное время отказа через timingSafeEqual)
- **Priority**: P1 · **Security**

### TC-005-008: HTTP кэширование и HEAD — If-None-Match с совпадающим ETag → 304 Not Modified с пустым телом (< 5 ms); Cache-Control: private, max-age=300, must-revalidate; запрос методом HEAD → 200 OK без тела с валидными MIME и ETag заголовками
- **Priority**: P0 · **Performance & Protocol**

## US2: ICS-тело (FR-502)

### TC-005-004: RFC 5545 соответствие — обязательные PRODID и VERSION:2.0; строгий CRLF (\r\n); Line Folding по RFC 5545 §3.1 (строки > 75 октетов переносятся через `\r\n ` с сохранением целостности UTF-8 символов); UID `booking-<id>@<host>` стабилен; DTSTART/DTEND UTC `Z`
- **Priority**: P0 · **RFC-структурный**

### TC-005-005: escape-матрица — имя/услуга со спецсимволами `,` `;` `\` и переносом строки `\n` → RFC-корректное экранирование (`\,`, `\;`, `\\`, `\n`)
- **Priority**: P0 · **BVA**

### TC-005-006: полная матрица статусов и детерминизм:
- `BOOKED` → STATUS:CONFIRMED, SEQUENCE:0;
- `HELD`, `PAYMENT_PENDING`, `PENDING_APPROVAL` → STATUS:TENTATIVE, SEQUENCE:0;
- `RELEASED`, `CANCELLED`, `STAFF_REJECTED` → STATUS:CANCELLED, SEQUENCE:1;
- Пустой ресурс → валидный пустой VCALENDAR (200 OK);
- Детерминизм тела: DTSTAMP из updated_at брони гарантирует стабильный ETag при неизменных данных;
- Фоллбэк: пустые имя/услуга → безопасные строки `'Запись — Клиент'`.
- **Priority**: P0 · **EP**

## FR-503: PII-граница

### TC-005-007: grep тела — 0 телефонов/email'ов/заметок в VEVENT при клиенте с полностью заполненными контактами; DESCRIPTION отсутствует
- **Priority**: P0 · **PII-grep**

## US3: Ротация (FR-504)

### TC-005-009: rotate → старый URL 403, новый 200; запись в AuditEvents (`calendar.feed-rotated`, metadata: `{ previousVersion, newVersion }`); UID событий не меняется (нет дублирования в календаре подписчика)
- **Priority**: P0 · **EP**

### TC-005-010: rotate не-OWNER → 403 (adminOnly-канон)
- **Priority**: P1 · **DT**

## NFR

### TC-005-011: полный регрессионный гейт (validate/lint/int/build 0 exit; 142+ старых зелёные)
### TC-005-012: 0 новых deps (diff package.json); p95 фида < 50 ms замер (evidence); тело фида отсутствует в логах

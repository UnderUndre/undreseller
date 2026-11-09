# Test Cases: 005-google-calendar-sync (ISO/IEC/IEEE 29119-3)

**Всего TC**: 12 · Профиль: EP + BVA + Security DT + PII-grep

## US1: Endpoint + токен (FR-501)

### TC-005-001: валидный токен → 200 `text/calendar`; невалидный → 403 FEED_FORBIDDEN; чужой ресурс → 403
- **Priority**: P0 · **Security DT**

### TC-005-002: rate limit 10/60s — 11-й запрос → 429 + Retry-After (BVA)
- **Priority**: P1 · **BVA**

### TC-005-003: timing-safe — перебор токенов не даёт оракула (константное время отказа)
- **Priority**: P1 · **Security**

## US2: ICS-тело (FR-502)

### TC-005-004: структура — VCALENDAR/VEVENT, UID `booking-<id>@<host>` стабилен, DTSTART/DTEND UTC `Z`, CRLF
- **Priority**: P0 · **RFC-структурный**

### TC-005-005: escape-матрица — имя/услуга с `,` `;` `\` переносом строки → RFC-корректный escaping
- **Priority**: P0 · **BVA**

### TC-005-006: отменённая бронь → STATUS:CANCELLED + SEQUENCE:1 ≤ 60 c; активная CONFIRMED; холд TENTATIVE; пустой ресурс → валидный пустой VCALENDAR; детерминизм тела
- **Priority**: P0 · **EP**

## FR-503: PII-граница

### TC-005-007: grep тела — 0 телефонов/email'ов/заметок при клиенте с заполненными контактами
- **Priority**: P0 · **PII-grep**

## US3: Ротация (FR-504)

### TC-005-009: rotate → старый URL 403, новый 200; audit `calendar.feed-rotated`; UID событий не изменился (нет дублей у подписчика)
- **Priority**: P0 · **EP**

### TC-005-010: rotate не-OWNER → 403 (adminOnly-канон)
- **Priority**: P1 · **DT**

## NFR

### TC-005-011: полный регрессионный гейт (validate/lint/int/build 0 exit; 142+ старых зелёные)
### TC-005-012: 0 новых deps (diff package.json); p95 фида < 50 ms замер (evidence); тело фида отсутствует в логах

# Tasks: 005 (005-google-calendar-sync — re-scope: Calendar Feed)

**Input**: spec rev 2.1, plan.md, research.md (D1–D6), requirements-audit PASS, review fixes (F1–F10)
**Organization**: Phase 1 writer+token → Phase 2 endpoint+admin → closeout.

## Phase 1: Writer + token (US2)

- [ ] T510 [BE] [US2] FR-502/D1/D3/D4:
  - `src/lib/calendar/ics.ts` PURE:
    - Заголовок VCALENDAR: `PRODID:-//UnderUndre//undreseller//EN`, `VERSION:2.0`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, `X-WR-CALNAME`, `REFRESH-INTERVAL;VALUE=DURATION:PT15M`;
    - Инвариант окончаний строк: строгий CRLF (`\r\n`);
    - Line Folding по RFC 5545 §3.1 (перенос строк > 75 октетов через `\r\n ` без разделения байтов UTF-8 кодовых точек);
    - Экранирование спецсимволов RFC 5545 §3.3.11 (`,` `;` `\` `\n`);
    - Полная матрица статусов: `BOOKED` → `CONFIRMED` (SEQ:0); `HELD`/`PAYMENT_PENDING`/`PENDING_APPROVAL` → `TENTATIVE` (SEQ:0); `RELEASED`/`CANCELLED`/`STAFF_REJECTED` → `CANCELLED` (SEQ:1);
    - DTSTAMP из `updated_at` брони в UTC `YYYYMMDDTHHMMSSZ` (детерминизм тела);
    - UID: `booking-<id>@<host>`;
    - Фоллбэки для SUMMARY: `serviceName || 'Запись'`, `customerName || 'Клиент'`;
    - Окно: `now − 7 days … now + 90 days`;
  - Тесты: line folding > 75 октетов (включая русскоязычные UTF-8 строки), CRLF-инвариант, escape-матрица, детерминизм тела, пустой фид, отмена → CANCELLED + SEQ 1.
- [ ] T511 [BE] [US1/FR-504] D2:
  - `Resources.ts`: добавление поля `feedTokenVersion` (integer, defaultValue: 1, min: 1) с защитой `access: { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess }`;
  - `tokens.ts`: хелпер вычисления HMAC-токена `hashToken('calendar-feed:v' + version + ':' + resourceId)` и timing-safe валидатор;
  - Запуск `pnpm generate:types`.

## Phase 2: Endpoint + admin (US1/US3)

- [ ] T520 [BE] [US1/FR-501/503] D5:
  - `src/app/api/calendar/feed/[resourceId]/route.ts`:
    - Поддержка методов `GET` и `HEAD`;
    - Rate limiter: ключ `feed:${resourceId}:${ip}`, лимит `30 requests / 60 seconds` (защита от бана краулеров Googlebot/Apple);
    - Валидация HMAC-токена через `timingSafeEqual`; невалидный/устаревший → 403 Forbidden;
    - HTTP-кэширование: `Cache-Control: private, max-age=300, must-revalidate`, слабый ETag `W/"<sha256>"`;
    - При совпадении `If-None-Match` → немедленный возврат `304 Not Modified` с пустым телом;
    - Защита PII: тело фида не логируется, токен маскируется в логах, `DESCRIPTION` опущен;
    - Замер производительности: p95 < 50 ms при 200 OK, < 5 ms при 304 Not Modified;
  - Тесты: 403-матрица (невалидный/чужой/устаревший токен), ETag и возврат 304, метод HEAD, PII-grep (0 телефонов/email'ов), create/cancel ≤ 60 c, пустой ресурс → пустой VCALENDAR (200); **окно now−7d…now+90d тестируется с фиксированным `now`** (ревью R5: подвижное окно меняет тело/ETag у граничных броней).
- [ ] T521 [BE] [US3/FR-504] D6:
  - `src/app/api/admin/calendar-feed/[resourceId]/route.ts`:
    - `GET`: возвращает `{ url: 'webcal://...' }` (только роль `OWNER`);
    - `POST`: инкрементирует `feedTokenVersion = feedTokenVersion + 1` в транзакции, немедленно инвалидируя старый токен;
    - Запись события в `AuditEvents` (`action: 'calendar.feed-rotated'`, `actorId`, `aggregateType: 'RESOURCE'`, `aggregateId: resourceId`, `metadataJson: { previousVersion, newVersion }`);
  - Минимальный UI `CalendarFeedLink` в админке ресурса (кнопки копирования webcal-ссылки и вызова ротации);
  - Тесты: rotate → старый URL 403, новый 200 + проверка записи в `audit_events`.

## Phase 3: Closeout

- [ ] T530 [SETUP] Регрессия: `pnpm generate:types`, полный гейт 0 exit (validate/lint/int/build), 142+ старых тестов зелёные, evidence (p95-замер, ETag/304 лог, escape и line folding лог), tasks-статусы.

## Dependency Graph

```
T511 → T520, T521
T510 → T520
T520, T521 → T530
```

### Self-Validation
- [x] IDs существуют, циклов нет, orphan'ов нет

**Critical Path**: T511 → T520 → T530 (3 задачи). **Total**: 5 задач.

## Parallel Lanes

| Lane | Tasks | Blocked By |
| ---- | ----- | ---------- |
| 1 | T510, T511 | — |
| 2 | T520, T521 | T510 (T520); T511 (обе) |
| 3 | T530 | все |

## Agent Dispatch

| Agent | Tasks |
| ----- | ----- |
| [BE] | T510, T511, T520, T521 |
| [SETUP] | T530 |

## Notes
- TDD-Lite; security/PII — DT+grep до кода; RFC 5545 строгая верификация (CRLF, folding, PRODID); error-catalog: FEED_FORBIDDEN (403) — снапшот-сьют расширяется.

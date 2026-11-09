# Implementation Plan: 005 (005-google-calendar-sync — re-scope: Calendar Feed)

> "Фид — это односторонняя труба: вода течёт к мастеру, назад — никак." — Валера

**Branch**: `main` (single-branch lineage — IX-девиация) | **Date**: 2026-11-09 | **Spec**: rev 2.1 (review fixes PASS)
**Input**: spec rev 2.1 + requirements-audit (PASS) + research.md (D1–D6) + план v2.6.0 (`2f7fcf4`)

## Summary

Calendar Feed (ICS push, односторонний):
1. **RFC 5545 писатель** (`src/lib/calendar/ics.ts`, 0 deps): обязательные свойства `PRODID:-//UnderUndre//undreseller//EN` и `VERSION:2.0`, строгий CRLF `\r\n`, Line Folding > 75 октетов с безопасностью для кодовых точек UTF-8, экранирование спецсимволов, фоллбэки для пустых имён;
2. **Токен и безопасность полей**: вычислимый HMAC-SHA256 токен `calendar-feed:v<N>:<resourceId>` на ключе `PAYLOAD_SECRET`, timing-safe сверка, версионная ротация; поле `Resources.feedTokenVersion` защищено `adminOnlyFieldAccess` (исключает утечку через публичный REST API);
3. **Endpoint `/api/calendar/feed/[resourceId]`**: поддержка методов `GET` и `HEAD`, rate limiter с бакетом `feed:${resourceId}:${ip}` (30/60s, исключает блокировку краулеров Googlebot/Apple), условное HTTP-кэширование (`ETag`, `If-None-Match` → `304 Not Modified`), `Cache-Control: private, max-age=300, must-revalidate`, окно `now−7d…now+90d`, DTSTAMP из `updated_at`, полная матрица статусов `CONFIRMED` / `TENTATIVE` / `CANCELLED`;
4. **PII-граница**: `SUMMARY = услуга — имя`, контакты и `DESCRIPTION` запрещены, тело фида не логируется;
5. **Админ-поверхность и аудит**: `GET/POST /api/admin/calendar-feed/[resourceId]` (OWNER-only) с фиксацией `{ previousVersion, newVersion }` в `AuditEvents` (`calendar.feed-rotated`).

## Technical Context

**Language/Version**: без изменений (Node 20+, TypeScript 5+, Next.js 15, Payload 3.93, PostgreSQL 16).
**Testing**: vitest int (RFC-структура, PRODID, CRLF-инвариант, line folding > 75 октетов, ETag / 304, HEAD, 403-матрица, PII-grep, ротация, пустой фид).
**New deps**: 0 (NFR-502).
**Storage**: новое int-поле `Resources.feedTokenVersion` (с `adminOnlyFieldAccess`).

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS/N/A | без изменений от 004 |
| VI | ON TRACK | analyze + внешнее ревью antigravity PASS; гейт закрыт |
| VII | PASS | теги батчем на коммите контура |
| VII-B | PASS | план v2.6.0 синхронизирован (отдельный waiver не требуется) |
| IX | DEVIATION (lineage) | как 001–004 |
| X | PASS | additions-only (int-поле в Resources) |
| XI | PASS | 0 спайков |
| XII | **PASS** | Risk ≤12; PII/security-DT проактивно |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
src/lib/calendar/ics.ts                 # NEW: PURE RFC 5545 writer (PRODID, CRLF, line folding >75 octets UTF-8 safe, escape, VCALENDAR/VEVENT)
src/app/api/calendar/feed/[resourceId]/route.ts  # NEW: GET & HEAD (rate limit 30/60s per resource+IP, timing-safe token, ETag/304, Cache-Control, PII-gate)
src/app/api/admin/calendar-feed/[resourceId]/route.ts  # NEW: GET url / POST rotate (OWNER) с фиксацией аудита
src/collections/Resources.ts            # MOD: feedTokenVersion (int, default 1, access: adminOnlyFieldAccess)
src/components/admin/CalendarFeedLink.tsx  # NEW: copy-link + rotate (минимальный UI)
tests/int/calendar-feed.int.spec.ts     # NEW: 403-матрица / ETag & 304 / HEAD / folding 75 octets / CRLF / PII-grep / rotate / пустой фид
```

## Threat Modeling (STRIDE)

- **S (Spoofing)**: вычислимый HMAC-SHA256 токен (256-bit, не хранится в БД — красть нечего), timing-safe сверка; `Resources.feedTokenVersion` закрыт `adminOnlyFieldAccess`; ротация OWNER-only.
- **T (Tampering)**: фид строго read-only; статус-писатели броней 002/003/004 не затронуты.
- **R (Repudiation)**: запись в `AuditEvents` (`action: 'calendar.feed-rotated'`, metadata: `{ previousVersion, newVersion }`).
- **I (Information Disclosure)**: PII-граница (телефон и email запрещены), `DESCRIPTION` опущен, тело не логируется, токен исключен из логов.
- **D (Denial of Service)**: rate limit 30/60s по `feed:${resourceId}:${ip}` защищает от флуда и не ломает Googlebot crawler; ETag + `304 Not Modified` срезает 95%+ нагрузки при регулярном опросе подписчиками; B-tree индекс 002 `(resource_id, start_time)`.
- **E (Elevation of Privilege)**: эндпоинт ротации требует права `OWNER`.

## Rollback

Additions-only: новое поле Resources, новые роуты; откат = git; 001–004 поверхности не тронуты.

## Risks & Mitigations

| Риск | Вер-ть | Митигация |
|---|---|---|
| Блокировка краулеров Google/Apple (ошибка 429) | устранено | Rate limit привязан к `feed:${resourceId}:${ip}` с порогом 30/60s |
| Отсутствие поддержки ETag перегружает сервер | устранено | Добавлен расчет ETag и немедленный возврат `304 Not Modified` |
| Ошибка парсинга из-за длинных строк UTF-8 | устранено | Внедрен RFC 5545 §3.1 Line Folding (> 75 октетов, `\r\n `, UTF-8 safe) |
| Отказ Google Calendar при проверке HEAD | устранено | Эндпоинт явно поддерживает метод `HEAD` с возвратом MIME/ETag |
| Утечка соли токена через публичный REST | устранено | Поле `feedTokenVersion` закрыто `adminOnlyFieldAccess` |
| Латентность подписчика (~сутки) | средняя | UAT/runbook: «Refresh» вручную; REFRESH-INTERVAL подсказка; серверная свежесть ≤ 60 с |
| Токен в реферерах прокси | низкая | Токен в query — компрометация лечится кнопкой Rotate в админке |

## Next

`/speckit.tasks` — выполнено: 5 задач с точной детализацией контрактов; переход к `/speckit.implement` после фиксации тегов ревью.

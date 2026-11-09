# Implementation Plan: 005 (005-google-calendar-sync — re-scope: Calendar Feed)

> "Фид — это односторонняя труба: вода течёт к мастеру, назад — никак." — Валера

**Branch**: `main` (single-branch lineage — IX-девиация) | **Date**: 2026-11-09 | **Spec**: rev 2.0 (audit PASS run #1)
**Input**: spec rev 2.0 + requirements-audit (PASS) + research.md (D1–D6) + план v2.6.0 (`2f7fcf4`)

## Summary

Calendar Feed (ICS push, односторонний): (1) hand-rolled RFC 5545 писатель (0 deps, escape-тесты); (2) вычислимый HMAC-токен с версионной ротацией (`Resources.feedTokenVersion`, ноль новых таблиц); (3) endpoint `/api/calendar/feed/[resourceId]` — rate limit, 403-матрица, окно now−7d…now+90d, DTSTAMP из updated_at (детерминизм), STATUS CONFIRMED/TENTATIVE/CANCELLED; (4) PII-граница (SUMMARY = услуга + имя, телефон запрещён, тело не логируется); (5) OWNER-поверхность link/rotate + audit. GC API two-way — заморожено до L1-сигнала (план v2.6.0).

## Technical Context

**Language/Version**: без изменений (001–004 фундамент). **Testing**: vitest int (RFC-структурные тесты, 403-матрица, PII-grep, ротация, пустой фид). **New deps**: 0 (NFR-502). **Storage**: новое int-поле `Resources.feedTokenVersion` — pushDevSchema/migrate-канон.

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS/N/A | без изменений от 004 |
| VI | ON TRACK | analyze + внутренние ревью; ≥2 external до implement |
| VII | PASS | теги батчем на коммите контура |
| VII-B | PASS | план v2.6.0 синхронизирован (VII-B.4; отдельный waiver не нужен) |
| IX | DEVIATION (lineage) | как 001–004 |
| X | PASS | additions-only (int-поле Resources) |
| XI | PASS | 0 спайков |
| XII | ON TRACK | Risk ≤12; PII/security-DT проактивно |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
src/lib/calendar/ics.ts                 # NEW: PURE RFC 5545 writer (escape, VCALENDAR/VEVENT)
src/app/api/calendar/feed/[resourceId]/route.ts  # NEW: GET (rate limit, timing-safe token, PII-gate)
src/app/api/admin/calendar-feed/[resourceId]/route.ts  # NEW: GET url / POST rotate (OWNER)
src/collections/Resources.ts            # MOD: feedTokenVersion (int, default 1, readOnly)
src/components/admin/CalendarFeedLink.tsx  # NEW: copy-link + rotate (минимальный UI)
tests/int/calendar-feed.int.spec.ts     # NEW: 403-матрица/ICS-структура/PII-grep/rotate/пустой фид
```

## Threat Modeling (STRIDE)

- **S**: вычислимый HMAC-токен (256-bit, не хранится — красть нечего), timing-safe; rotate-эндпоинт OWNER-only. **T**: фид read-only, статус-писатели 002/003 не тронуты. **R**: audit `calendar.feed-rotated`. **I**: PII-граница (телефон запрещён), тело не логируется, фид на сторонних серверах — минимум поверхности (нет DESCRIPTION). **D**: rate limit + B-tree; пустой фид валиден (не 404). **E**: adminOnly-канон на rotate.

## Rollback

Additions-only: новое поле Resources, новые роуты; откат = git; 001–004 поверхности не тронуты.

## Risks

| Риск | Вер-ть | Митигация |
|---|---|---|
| Латентность подписчика (~сутки) воспринимается как баг | средняя | UAT/runbook: «Refresh» вручную; REFRESH-INTERVAL-подсказка; серверная свежесть ≤60 c доказуема тестом |
| RFC 5545 escape-дефект ломает парсинг у вендора | низкая | escape-тесты на спецсимволы имени/услуги; структура — эталонные тесты |
| Токен в реферерах/логах прокси | низкая | token в query — компрометация = rotate; дени-лист в собственных логах |

## Next

`/speckit.tasks` — выполнено: 4 задачи, 3 lane'а (см. tasks.md).

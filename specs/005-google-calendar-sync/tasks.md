# Tasks: 005 (005-google-calendar-sync — re-scope: Calendar Feed)

**Input**: spec rev 2.0, plan.md, research.md (D1–D6), requirements-audit PASS (run #1)
**Organization**: Phase 1 writer+token → Phase 2 endpoint+admin → closeout.

## Phase 1: Writer + token (US2)

- [ ] T510 [BE] [US2] FR-502/D1/D3/D4: `src/lib/calendar/ics.ts` PURE (`buildFeed`: VCALENDAR + VEVENT, escape RFC 5545 §3.3.11, CRLF, DTSTAMP=updated_at, UID `booking-<id>@<host>`, STATUS CONFIRMED/TENTATIVE/CANCELLED + SEQUENCE:0/1, TRANSP:OPAQUE, X-WR-CALNAME, ок now−7d…now+90d); тесты: escape-матрица, CRLF, детерминизм, пустой фид, cancel→CANCELLED+SEQ 1
- [ ] T511 [BE] [US1/FR-504] D2: `Resources.feedTokenVersion` (int, default 1, readOnly); вычислимый HMAC-токен (`calendar-feed:v<N>:<resourceId>`, timing-safe); generate:types

## Phase 2: Endpoint + admin (US1/US3)

- [ ] T520 [BE] [US1/FR-501/503] D5: `GET /api/calendar/feed/[resourceId]` (rate limit 10/60s, timing-safe 403-матрица, окно, `text/calendar; charset=utf-8`, тело без логирования, p95 < 50 ms замер); тесты: 403-матрица (невалидный/чужой), PII-grep (0 телефонов), create/cancel ≤60 c, пустой ресурс → пустой VCALENDAR
- [ ] T521 [BE] [US3/FR-504] D6: `GET/POST /api/admin/calendar-feed/[resourceId]` (OWNER-only; GET → webcal URL; POST → rotate version++ + audit `calendar.feed-rotated`); тесты: rotate → старый URL 403/новый 200 + audit; минимальный UI `CalendarFeedLink` (copy/rotate)

## Phase 3: Closeout

- [ ] T530 [SETUP] Регрессия: generate:types, полный гейт 0 exit (validate/lint/int/build), 142+ старых зелёные, evidence (p95-замер, escape-матрица лог), tasks-статусы

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
- TDD-Lite; security/PII — DT+grep до кода; error-catalog: FEED_FORBIDDEN (403) — снапшот-сьют расширяется.

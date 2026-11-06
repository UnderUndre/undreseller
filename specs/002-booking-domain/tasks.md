# Tasks: 002 (002-booking-domain)

**Input**: spec rev 1.1, plan.md, research.md (D1–D8), requirements-audit PASS
**Organization**: Phase 1 bootstrap → Phase 2 миграция+каталог → Phase 3 availability → Phase 4 booking domain → Phase 5 rate-limit+UI → closeout.

## Phase 1: Bootstrap (US1)

- [ ] T010 [BE] [US1] FR-201: `src/access/bootstrapToken.ts` (timing-safe), `Users.create` access-guard (0 users → token required), hook → token-OWNER + `pg_try_advisory_xact_lock('users_bootstrap')`; тесты: токен-матрица (valid/no/second/race) — SEC-1=0

## Phase 2: Migration + catalog (US2/US3)

- [ ] T020 [BE] [US2] FR-202/203: миграция `btree_gist` + partial GiST + down; `payload migrate` прогон на `undreseller_test`; гоночный тест: 100 конкурентных booking → 0 double-booking (advisory+GiST)
- [ ] T021 [BE] [US3] FR-204: `Resources` (+seed default_master), `WeeklyHours`, `AvailabilityExceptions`, Product `bookable/durationMin/buffers`; generate:types

## Phase 3: Availability (US4)

- [ ] T030 [BE] [US4] FR-205: `computeSlots` PURE (квант 30, buffers, breaks, exceptions, fixed-offset TZ) + resolver + `GET /api/availability`; BVA-матрица: buffer-перекрытие, DST, границы дня, 45-мин услуга на 30-сетке

## Phase 4: Booking domain (US5/US6)

- [ ] T040 [BE] [US5] FR-206: `bookingService` (Local API, advisory→re-check→FSM→atomic SlotReservation+Order+AuditEvent, cancel-token hash генерация, idempotencyKey unique); `POST /api/booking` + `GET /api/booking/[id]` (accessToken); State Transition тесты FSM FREE-track + idempotency ×100
- [ ] T041 [BE] [US6] FR-208: `GET/POST /api/approvals` (OPERATOR+, list PENDING_APPROVAL, approve/reject через FSM CAS); Decision Table: approve/reject × статусы × роли; AuditEvents
- [ ] T042 [BE] [FR-210] `AuditEvents` коллекция (append-only, PII-redact gate) + события create/approve/reject/bootstrap

## Phase 5: Rate limit + storefront (US8/US7)

- [ ] T050 [BE] [US8] FR-207: bounded rate limiter 10/60s (канон 007 eviction), REPLICA_COUNT assertion; BVA-тест 10/11-го запроса
- [ ] T051 [BE] [US7] FR-209: `/book` + SlotGrid (гонка двух вкладок → 409+refresh) + confirmation-страница (cancel-link once); playwright booking-flow e2e

## Phase 6: Closeout

- [ ] T060 [SETUP] Регрессия: полный гейт 0 exit (validate/lint/int/build), evidence (p95 availability замер, гоночный лог), tasks-статусы

## Dependency Graph

```
T010 → T040
T020 → T040
T021 → T030
T030 → T051
T040 → T041, T042, T050, T051
T040 → T060
```

### Self-Validation
- [x] IDs существуют, циклов нет, orphan'ов нет

**Critical Path**: T020 → T040 → T041 → T060 (8 задач). **Total**: 10 задач.

## Parallel Lanes

| Lane | Tasks | Blocked By |
| ---- | ----- | ---------- |
| 1 | T010, T020 | — |
| 2 | T021 → T030 | — |
| 3 | T040 → T041, T042 | T010, T020 |
| 4 | T050, T051 | T040 (T050); T030 (T051) |
| 5 | T060 | все |

## Agent Dispatch

| Agent | Tasks |
| ----- | ----- |
| [BE] | T010, T020, T021, T030, T040, T041, T042, T050, T051 |
| [SETUP] | T060 |

## Notes
- TDD-Lite; raw SQL только в миграции; error-catalog codes (SLOT_TAKEN/OUT_OF_GRID/SERVICE_NOT_BOOKABLE/RATE_LIMITED) — снапшот-сьют расширяется.

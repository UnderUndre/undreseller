# Implementation Plan: 002 (002-booking-domain)

> "Слоты — это математика. Бронь — это математика под замком." — Валера

**Branch**: `main` (single-branch lineage — IX-девиация, ретро) | **Date**: 2026-11-07 | **Spec**: rev 1.2 (antigravity F1–F12 integrated; audit PASS + re-audit addendum)
**Input**: spec rev 1.2 + requirements-audit (PASS) + research.md (D1–D8) + port-map 001

## Summary

Booking domain на Payload-рельсах: (1) bootstrap-token (SEC-1=0, fail-closed); (2) GiST+advisory двойная броня (raw-SQL Expand-миграция + B-tree индекс для p95 < 50ms); (3) Resources/WeeklyHours/Exceptions коллекции + ShopSettings глобал + bookable-Products; (4) pure-availability engine + публичный GET; (5) доменный сервис + POST /api/booking (atomic, idempotent, FSM через pure-kernel) + POST /api/booking/[id]/cancel; (6) OPERATOR approval API (CAS); (7) /book витрина с cancel-ссылкой; (8) rate limiter с доверенным IP-парсингом; (9) AuditEvents append-only. Конфигурация Payload Jobs (D1, 0 новых deps; фоновые свипы в 003).

## Technical Context

**Language/Version**: без изменений (001 фундамент). **Testing**: vitest int (isolated `undreseller_test`) + playwright (booking-flow e2e без Stripe). **Storage**: PG16; **первая raw-SQL custom migration** проекта (GiST + B-tree) — Payload migrate-канон. **Jobs**: Payload Jobs (`schedule` + `waitUntil`, `autoRun` в config; фоновые свипы вынесены в 003).

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS/N/A | без изменений от 001 |
| VI | ON TRACK | analyze + zcode self; ≥2 external до implement |
| VII | PASS | теги батчем на коммите контура (канон 001) |
| VII-B | PASS (waiver оформлен) | `specs/002-booking-domain/business-plan-waiver.md` на диске |
| IX | DEVIATION (lineage) | как 001 |
| X | **PASS — первая проверка в бою** | Expand-only миграция, down.sql, без CONCURRENTLY (fresh-deploy) |
| XI | PASS | 0 спайков |
| XII | ON TRACK | audit PASS; test-design этим пакетом; DT/STM проактивно на FSM |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
# Phase 1 — bootstrap (US1)
src/collections/Users/index.ts          # MOD: create-access token-guard (D5)
src/collections/Users/hooks/            # MOD: hook → token-OWNER + advisory-lock
src/access/bootstrapToken.ts            # NEW: timing-safe compare
# Phase 2 — migration + catalog (US2/US3)
src/migrations/20261107xxxxxx_booking_gist/   # NEW: btree_gist + partial GiST + B-tree + down
src/collections/Resources.ts            # NEW: minimal resource
src/collections/WeeklyHours.ts          # NEW
src/collections/AvailabilityExceptions.ts # NEW (closed days)
src/globals/ShopSettings.ts             # NEW: timeZone, quantumMin
src/collections/Products/index.ts       # MOD: bookable + durationMin + buffers
src/collections/SlotReservations.ts     # MOD: idempotencyKey, cancelTokenHash, customer info, btree index
src/payload.config.ts                   # MOD: регистрация коллекций, глобалов + jobs config
# Phase 3 — availability (US4)
src/lib/availability/computeSlots.ts    # NEW: PURE (D3)
src/lib/availability/resolver.ts        # NEW: DB-фетчер
src/app/api/availability/route.ts       # NEW: GET
# Phase 4 — booking domain (US5/US6)
src/lib/booking/bookingService.ts       # NEW: доменный сервис (Local API, единственный status-writer)
src/app/api/booking/route.ts            # NEW: POST (+ idempotency)
src/app/api/booking/[id]/route.ts       # NEW: GET по accessToken
src/app/api/booking/[id]/cancel/route.ts # NEW: POST cancel по cancelToken
src/app/api/approvals/route.ts          # NEW: OPERATOR approve/reject (CAS)
src/collections/AuditEvents.ts          # NEW (FR-210, индекс aggregate)
# Phase 5 — rate limit + storefront (US8/US7)
src/lib/security/rateLimiter.ts         # NEW: bounded fixed window + proxy IP parser (D6)
src/app/(app)/book/page.tsx             # NEW
src/components/booking/SlotGrid.tsx     # NEW: client grid
src/app/(app)/book/confirmation/[id]/page.tsx # NEW (working cancel-link)
# Phase 6 — closeout (NFRs & evidence)
tests/int/*.int.spec.ts                 # NEW: bootstrap/gist-race/availability-bva/booking-service/rate-limit/cancel-flow
```

## Threat Modeling (STRIDE)

- **S**: bootstrap-token timing-safe; роль-иерархия 001. **T**: статус-мутации — только доменный сервис; GiST+advisory против tamper-by-race. **R**: AuditEvents (FR-210). **I**: PII-redact metadata; карточки броней без телефона наружу. **D**: rate-limiter + advisory-lock timeout. **E**: field-guards 001 + create-access token-guard.

## Rollback

Миграция Expand-only → откат down.sql; домен — чистые addition; 001-поверхности не тронуты (кроме Users.create access — revert = git).

## Risks

| Риск | Вер-ть | Митигация |
|---|---|---|
| Payload Jobs API ≠ ожиданиям (beta) | низкая | L2-верифицировано (docs: waitUntil/schedule/autoRun); фоллбэк — cron-task в jobs |
| btree_gist недоступен на хостинге | низкая | contrib-модуль PG16 стандартен; preflight-чек в миграции |
| Гонка advisory-lock vs Payload pool | низкая | xact-lock в той же транзакции; timeout 5s |
| DST/смена TZ инстанса | средняя | fixed-offset + DST-тест-матрица |

## Next

Tasks готовы: 10 задач / 5 lane'ов (`tasks.md`). Implement gated: ≥2 внешних ревью PASS (Constitution VI) — 1/2 (antigravity PASS).

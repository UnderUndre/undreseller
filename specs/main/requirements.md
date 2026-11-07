# Requirements (map): undreseller on Payload — v2.1.0

**Date**: 2026-11-07 · Полные FR-спецификации живут в спеках фич (`specs/<slug>/spec.md`); этот документ — карта фундамента и канонов, актуализированная под as-built 001+002.

## 1. Реализованные FR-группы

### 001-reinit (as-built)
- **FR-101 Baseline**: build/lint/int зелёные, evidence-фиксация (e2e — owner-run с Stripe test keys).
- **FR-102 Governance**: SpecKit-контур (constitution v1.10.1 app-adapted, snapshot-stage, 12 speckit-команд, specs/main v2).
- **FR-103 Port map**: 11 доменов легаси → класс/целевая спека/риск.
- **FR-104 Roles**: OWNER/OPERATOR/PERFORMER/customer (set, max-иерархия `hasMinimumRole`), /admin OWNER-only, first-user→OWNER, тотальный sweep `'admin'` (12 ссылок).
- **FR-105 FSM kernel**: pure-порт 1:1 (6 состояний, two-track, hold TTL 15m, freeze 24h, late-payment) + 002-remediation: CONFIRMED + CUSTOMER_CANCEL → AVAILABLE.
- **FR-107 Payments invariants**: pure minor-units + provider-aware (Stars XTR / фиат), полиморфизм `Order.amount`/`totalMinor`.
- **FR-108 QA baseline**: изолированная `undreseller_test` (delete-then-load, dotenv@8 без override), `fileParallelism: false`, error-shape snapshots.

### 002-booking-domain (as-built)
- **FR-201 Bootstrap**: `OWNER_BOOTSTRAP_TOKEN` fail-closed (пустая БД → 403 без токена; takeover=0; advisory-lock против гонки).
- **FR-202 GiST EXCLUDE**: `(resource_id, tstzrange) WHERE active` + 23P01→409 + B-tree `(resource_id, start_time)` + partial-unique idempotency_key — raw-SQL Expand-миграция + down.
- **FR-203 Advisory lock**: блокирующий `pg_advisory_xact_lock(hashtext(...))` c 5s timeout в транзакции бронирования.
- **FR-204 Catalog+hours**: Product `bookable`/`durationMin`/buffers (буферы строго внутри рабочих часов), `WeeklyHours`, `AvailabilityExceptions`, глобал `ShopSettings` (timeZone, quantumMin=30).
- **FR-205 Availability**: pure `computeSlots` + resolver + `GET /api/availability`; p95 < 50 ms (B-tree).
- **FR-206 Booking**: `POST /api/booking` (idempotencyKey unique, atomic SlotReservation+Order+AuditEvent), `GET /api/booking/[id]` (accessToken), `POST /api/booking/[id]/cancel` (timing-safe cancelToken → RELEASED); FSM через pure-kernel; доменный сервис — единственный status-writer.
- **FR-207 Rate limit**: 10/60s на IP+route (доверенный `x-forwarded-for`), 429+Retry-After, bounded registry, REPLICA_COUNT=1.
- **FR-208 Approvals**: OPERATOR+ GET/POST (approve→BOOKED / reject→RELEASED), CAS `scheduleVersion`, 403 прочим.
- **FR-210 AuditEvents**: append-only, composite index, PII-redact metadata; события booking.create/cancel, approval.*, bootstrap.owner.

## 2. Технологические каноны (бизнес-план v2.5.0 §2.5)

- Payload 3.93.0 / Next 16.4.1 (security hotfix) / React 19 / TS 5.x — pinned (NFR-104; обновления — 002-deps).
- PostgreSQL 16 через `@payloadcms/db-postgres`; GiST EXCLUDE + `pg_advisory_xact_lock` — обязательная double-booking броня.
- Payload auth + access control; роли — set + max-иерархия.
- Провайдер-нейтральные платежи через PaymentAdapter (Stripe из коробки; Stars/NOWPayments — 006); minor units — канон; инварианты — `src/lib/payments/invariants.ts`.
- Docker Memory Fencing: app ≤500 MB (doc-block; сервис — 002+ deploy).
- Планировщик: **Payload Jobs** (`schedule`/`waitUntil`/`autoRun`) — Inngest отвергнут (внешний сервис против white-label автономности).

## 3. НФ-инварианты

- Fail-closed на секретах (`PAYLOAD_SECRET` fail-throw) и доступах (коллекции default-deny; `status` брони — field-level no-write).
- Тест-изоляция: int-тесты никогда не трогают dev-БД (`test.env` delete-then-load — dotenv@8 не умеет override).
- Чистые вычисления: availability/FSM/invariants — pure-модули с БД-фетчерами отдельно (урок легаси).
- Регрессия: `pnpm validate && pnpm lint && pnpm test:int && pnpm build` перед done; 108 тестов — текущая база.

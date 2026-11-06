# Requirements (map): undreseller on Payload — v2.0.0

**Date**: 2026-11-06 · Полные FR-спецификации живут в спеках фич (`specs/<slug>/spec.md`); этот документ — карта фундамента и канонов.

## 1. FR-группы фундамента (001, as-built)

- **FR-101 Baseline**: build/lint/int зелёные на шаблоне, evidence-фиксация (e2e — owner-run с Stripe test keys).
- **FR-102 Governance**: SpecKit-контур (constitution 1.10.1 app-adapted, snapshot-stage, speckit-команды, specs/main v2).
- **FR-103 Port map**: 11 доменов легаси → класс/целевая спека/риск (`specs/001-.../legacy-port-map.md`).
- **FR-104 Roles**: `OWNER|OPERATOR|PERFORMER|customer` (set, max-иерархия `hasMinimumRole`), `/admin` OWNER-only, first-user→OWNER, тотальный sweep `'admin'`.
- **FR-105 FSM kernel**: pure-порт легаси bookingFsm 1:1 (6 состояний, two-track, TTL 15m, freeze+24h ceiling, late-payment).
- **FR-106 SlotReservations**: skeleton-коллекция, fail-closed OWNER-only CRUD, status readOnly, enum-SSOT с kernel.
- **FR-107 Payments invariants**: pure minor-units + provider-aware (Stars XTR / фиат), полиморфизм `Order.amount`/`totalMinor`; Stripe-путь шаблона не тронут.
- **FR-108 QA baseline**: ≥4 int-сьютов на изолированной `undreseller_test` (test.env override, `fileParallelism: false`), error-shape snapshot, `pnpm validate`.

## 2. Технологические каноны (бизнес-план v2.5.0 §2.5)

- Payload 3.93.0 / Next 16.3.3 / React 19 / TypeScript 5.x — pinned (NFR-104).
- PostgreSQL 16 через `@payloadcms/db-postgres`; GiST EXCLUDE + `pg_advisory_xact_lock` — обязательная защита double-booking (002).
- Payload auth + access control; парольные политики — Payload core.
- Провайдер-нейтральные платежи через `PaymentAdapter` (Stripe из коробки; Stars/NOWPayments — 004+); minor units — канон.
- Docker Memory Fencing ≤500 MB app (doc-block 001, сервис 002+).
- 3 роли + customer; 1 сквозной процесс (витрина → корзина → слот → холд/оплата → уведомление); ≤1 бизнес-интеграция (GC, 005+).

## 3. НФ-инварианты

- Fail-closed на секретах/доступе (Access default deny; коллекции без явного access не создаются).
- Тест-изоляция: интеграционные тесты никогда не трогают dev-БД (`test.env` override).
- PII/лог-гигиена: deny-list логгер-канон возвращается в 002+ (легаси port map #9).
- Регрессия: полный гейт `pnpm validate && pnpm lint && pnpm test:int && pnpm build` перед `done`; e2e — release gate.

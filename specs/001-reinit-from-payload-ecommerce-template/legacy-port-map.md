# Legacy Port Map: undreseller-legacy → Payload rails (FR-103, TC-001-006)

**Feature**: 001-reinit · **Source**: `repos/undreseller-legacy` (read-only reference) · **Date**: 2026-11-06
**Классы**: `portable-as-concept` (дизайн переносится почти дословно) · `portable-with-rewrite` (идея сохраняется, обвязка переписывается) · `obsolete` (не переносится — dead weight)

| # | Домен легаси | Класс | Целевая спека | Главный риск переноса |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Booking FSM** (`lib/kernel/bookingFsm.ts`, pure: 6 состояний, two-track, TTL 15m, confirming-freeze + 24h ceiling, late-payment resolution) | portable-as-concept — pure-модуль, порт 1:1 | ✅ **001 (T031 — сделано)** | enum-дрейф FSM↔DB — закрыт shared-константой `kernel/reservationStatus.ts` + guard-тест |
| 2 | **Payments: provider-neutral contract** (`providerContract.ts`: registry, zero-provider mode, minor-units инвариант) | portable-as-concept | 004 | контракт адаптера шаблона (`PaymentAdapter`) отличается по форме — нужен adapter-слой |
| 3 | **Payments: provider-aware amount invariant** (`fulfillment.ts`, 007 F1–F6) | portable-as-concept | ✅ **001 (T033 — сделано, pure)**; fulfillment-движок (IO) — 004 | Payload `Order.amount` vs легаси `totalMinor` — закрыто полиморфизмом |
| 4 | **PaymentEvent-идемпотентность** (`@@unique(provider, providerRef)`, append-only ledger, inbox dedupe) | portable-as-concept | 004 | Payload не даёт составных unique-индексов из коробки — потребуется кастомная миграция (002-стиль) |
| 5 | **Double-booking defense** (GiST EXCLUDE + `pg_advisory_xact_lock`) | portable-as-concept — PG-уровень, ORM-агностично | 002 | raw-SQL кастомные миграции Payload — новый механизм для команды |
| 6 | **Telegram боты** (staff pager, client confirmation, magic reschedule, durable outbox с 30s leases / 429 cooldown, CAS staff actions) | portable-with-rewrite | 003 | grammY-поверхность переписывается; outbox-механика и pure-действия переносятся |
| 7 | **Auth & RBAC** (3 роли, иерархия, audit events, initData HMAC, admin-token) | portable-with-rewrite — роли/матрица на Payload access control | ✅ **001 (T030/T040 — сделано: OWNER/OPERATOR/PERFORMER/customer, hasMinimumRole, first-user=OWNER)** | scrypt/lockout легаси заменяются Payload auth полностью — миграции существующих паролей нет (пустая БД) |
| 8 | **Jobs** (Inngest: inbox sweep, hold sweep, nightly purge, reminders, auto-cancel, invoice expiry, gcal jobs, reindex + PG deadline sweeper) | portable-with-rewrite | 002/003 | в Payload нет jobs-очереди — Inngest остаётся внешним оркестратором, функции переписываются под Local API |
| 9 | **Notifications** (delivery log с salted hash, deny-list логгер, email-адаптер Resend) | portable-with-rewrite | 002+ | логгер-канон переносится; канал отправки — nodemailer/Resend поверх Payload email |
| 10 | **Google Calendar sync** (push/sync FSM→GC decision table, syncToken, secretVault AES-256-GCM, OAuth state) | portable-with-rewrite | 005 | токен-хранилище переносится в Payload-коллекцию; sync-логика переиспользуется |
| 11 | **Waitlist + AI FTS-RAG + uploads (R2) + i18n-гейты** | portable-as-concept (waitlist, i18n) / portable-with-rewrite (AI, uploads) | 006+ | waitlist-правила чистые; RAG — raw-SQL tsvector поверх Payload-коллекции |

## Dead weight (obsolete — НЕ переносится, TC-001-006)

- **Кастомная админка** `app/admin/*` (7 страниц + ~25 роутов) — заменяется Payload admin panel.
- **Старый auth-стек** (scrypt sign-in, in-memory lockout, ADMIN_TOKEN break-glass, ручные сессии) — Payload auth покрывает.
- **003 phantom-модели** (Offering / InventoryMovement / PaymentPlan / FulfillmentPlan — schema-only, без миграций) — не существовали в рантайме.
- **Все Prisma-миграции** — Payload push / custom migrations.
- **`/api/booking/lock`** (deprecated 308) — умерло с легаси.

## Regression-эталон

58 сьютов / ~436 тестов легаси — источник тест-дизайна для 002+; в 001 перенесён только FSM-контур (`tests/int/booking-fsm.int.spec.ts`, T031) как замок семантики.

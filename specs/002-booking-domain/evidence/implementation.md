# Implementation Evidence: 002-booking-domain (T060)

**Дата**: 2026-11-07 · **Гейт-статус**: Constitution VI — implement по logged owner override (`reviews/_gate-override.md`, 1/2 external: antigravity round-2 PASS)

## Гейты (сырой итог)

| Гейт | Результат |
| :--- | :--- |
| `pnpm validate` (tsc) | **0 ошибок** |
| `pnpm lint` | **0 errors** |
| `pnpm test:int` | **10/10 сьютов, 108/108 тестов** (72 регрессия 001 + 36 новых) |
| `pnpm build` | **0 exit** (25+ маршрутов) |
| `pnpm audit --audit-level=high` | **0 H/C** (1 low + 6 moderate — фон 002-deps) |

## Ключевые реализационные находки (всё — live-пруфы)

1. **Payload Jobs API** — L2-верифицировано (docs waitUntil/schedule/autoRun); `jobs: { tasks: [] }` включён в 002, задачи — 003.
2. **`payload.db.execute`** — сигнатура `execute({ drizzle, sql })` (object-arg, не позиционный) — вскрывато пробой.
3. **`payload.db.transaction` НЕ функция** на адаптере — транзакция через **нативный `db.drizzle.transaction(async (trx) => trx.execute(sql...))`** с xact-scoped advisory lock ✅ (проба).
4. **drizzle 0.45 оборачивает pg-ошибки в DrizzleQueryError** — PG-код на `.cause.code`, не `.code`; `pgErrorCode()` хелпер в сервисе + тестах.
5. **`enum_orders_status` = {processing, completed, cancelled, refunded}** — 'pending' не существует (проба enum_range); заказ создаётся в 'processing'.
6. Payload id'ы — **числа** (serial idType): String() на границах API.
7. **EXCLUDE-констрейнт ≠ GiST-индекс**: индекс ничего не запрещает — только `ADD CONSTRAINT EXCLUDE USING gist`; DO-гвард ловит duplicate_object + duplicate_table + exclusion_violation.
8. Runtime-уникальные slug'и в тестах (общая тест-БД + зашитые slug'и = коллизии между прогонами).

## Гоночный тест (SC-001)

100 конкурентных raw-INSERT одного интервала одного ресурса: **1 fulfilled / 99 × 23P01** ✅ (L2 GiST). 10 конкурентных createBooking: **1 success / 9 × SLOT_TAKEN** ✅ (L1 advisory + L2). Лог: вывод тест-сьюта `tests/int/gist-race.int.spec.ts` (повторяемый).

## Owner-хвосты

1. e2e booking-flow (`tests/e2e/booking.e2e.spec.ts`) — owner-run с dev-сервером.
2. p95 availability замер — при staging-прогоне (qa-signoff).
3. 2nd external review 002 — ретро-пункт (имплемент по override).

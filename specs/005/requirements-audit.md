# Requirements Audit Report: 005 (005-stripe-adapter-and-sovereign-auth)

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (после clarify-раунда; исходный вердикт rev 2.1 — REJECTED, см. §8)
- **Audit Date**: 2026-10-25
- **Audited**: `specs/005/spec.md` rev 2.1 (REJECTED, commit `3ffd350`) → rev 2.2 (re-audit PASS)

---

### 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- Обнаружено нарушений: **0**.
- Все FR/NFR квантованы: Argon2id (64 MB/3/4, пол ≥19 MiB/≥2 iter), rate limits (5/15 мин → 429/30 мин), TTL, replay ×100, RSS ≤500 MB, Sunset +90 дней, audit 0 H/C. Стоп-слов без цифр не найдено.

### 2. Матрица конфликтов (Gate 2: Consistency Cross-Check)

| ID 1 | ID 2 | Суть конфликта | Вердикт |
| :--- | :--- | :--- | :--- |
| FR-511 (TTL) | 004 FSM (hold 15 мин) | ✅ RESOLVED в rev 2.2: TTL сессии = 15 мин, строго равен `PREPAID_HOLD_TTL_MS` (укорочена сессия, FSM не тронут) | OK |
| §2 схема (enum) | FR-540 (default) | ✅ RESOLVED в rev 2.2: `@default(NOTIFY_CUSTOMER)` — член enum, 1:1 env-значению 004 | OK |
| FR-514/FSM §3 (webhook completed) | 004 conditional FSM | ✅ совместимо (условные `updateMany` + InboxEvent-дедуп; retention-контракт закреплён) | OK |
| FR-502 (epoch) | FR-503 (lockout) | ✅ независимые защиты, разные ключи (userId / IP) | OK |
| FR-511 (dashboard-driven методы) | §1.1 (Visa/MC/Apple Pay) | ✅ согласовано ревью-раундом 1 (домен в Stripe обязателен) | OK |
| FR-530 (308/410) | существующие клиенты `/api/booking/lock` | ✅ расписание зафиксировано (005 → 308+Sunset+90d, ≤006 → 410) | OK |

### 3. Анализ полноты (Gate 3: Boundary & Failure Coverage)

- Edge-cases: **ЧАСТИЧНО**.
  - ✅ RESOLVED в rev 2.2 (FR-511a): сессия создаётся до холда; отказ Stripe → холд не ставится, 503 + retry-сообщение, аудит `STRIPE_INVOICE_FAILED`, идемпотентность по `Idempotency-Key`.
  - ✅ N=0/N=1/MAX покрыты там, где релевантно (replay ×100, lockout 5, JPY 0/KWD 3, rg→0).
  - ✅ Гонки: конкурентный replay, TTL-vs-freeze (004), условные переходы — описаны.
  - ✅ Пустые/ошибочные UI-состояния: success/cancel URL заданы.
- Fallback-стратегии: **ЧАСТИЧНО** (см. BLOCKER-3; для webhook-недоставки неявно покрыто ретраями Stripe + дедупом — допустимо, рекомендация R3 зафиксировать словами).

### 4. Однозначность (Gate 4: Unambiguity)

- ✅ R1 RESOLVED: FR-505 использует каноничные `STAFF_SIGN_IN` / `STAFF_SIGN_IN_FAILED` + новые в том же стиле.
- ✅ R2 RESOLVED: FR-504a сериализует все Argon2-операции (verify и hash).
- ✅ Терминология единую с 004 держит (CONFIRMED=BOOKED конвенция, minor units, dedupeKey).

### 5. Итоговый статус гейта

- **GATE VERDICT**: **PASS** (rev 2.2; блокеров не осталось — см. историю в §8)
- Блокеры (все — минуты работы, закрываются clarify-раундом):
  1. **BLOCKER-1**: согласовать TTL Checkout Session (30 мин) с hold-TTL FSM 004 (15 мин): либо `expires_at = now + 15 мин` (минимальная правка), либо явное продление hold до 30 мин для STRIPE-трека с описанием интервала 15–30 мин.
  2. **BLOCKER-2**: привести default к члену enum — канонично `NOTIFY_CUSTOMER` (значение env 004 `notify_customer`), поправить схему и FR-540.
  3. **BLOCKER-3**: описать отказ Stripe при `createInvoice`: рекомендация — сессия создаётся ДО подтверждения бронирования; при 5xx/timeout Stripe → холд не ставится, клиенту 503 + retry, аудит `STRIPE_INVOICE_FAILED`.
- Рекомендации (не блокируют): R1 (имена событий), R2 (сериализация Argon2-операций), R3 (явно упомянуть ретраи Stripe как FLP-механику вебхука).

### 6. Business plan hook

005 добавляет платёжный рельс (fiat Stripe) — по Principle VII-B.2 это триггер `/speckit.business-plan` **UPDATE** (v18.6 → v18.7: Stripe как capability, без смены SKU/цен) — после clarify, до harden плана. ICP/цены/гейты не меняются → лёгкий update-changelog, не полный rewrite.

### 7. Snapshot

## 8. Re-audit (rev 2.2, тот же день)

Clarify-раунд закрыл: BLOCKER-1 (TTL 30→15 мин = hold-TTL), BLOCKER-2 (`NOTIFY_CUSTOMER` default), BLOCKER-3 (FR-511a: Stripe-отказ до холда, 503, `STRIPE_INVOICE_FAILED`, Idempotency-Key), R1 (имена событий 004-канон), R2 (сериализация verify+hash), R3 (Stripe-ретраи задокументированы как FLP-механика доставки). Повторный прогон 4 гейтов: Verifiability 0 нарушений; Consistency 0 конфликтов; Completeness — внешние отказы описаны; Unambiguity — словарь един. **VERDICT: PASS.**

- Snapshot: `requirements-audit/005/v1` указывает на rev 2.2 PASS-коммит (история REJECTED→PASS внутри этого отчёта).

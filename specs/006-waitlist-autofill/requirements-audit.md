# Requirements Audit Report: 006-waitlist-autofill

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #2; run #1 на rev 1.0 — **REJECTED**, 1 CRITICAL блокер + 2 MEDIUM устранены clarify → rev 1.1)
- **Audit Date**: 2026-11-10
- **Audited**: `specs/006-waitlist-autofill/spec.md` rev 1.1 (10 reqs: 5 FR + 5 NFR)
- **Grounding (001–005 + QA-fixes as-built)**: FSM FREE-трек создаёт бронь **сразу CONFIRMED** (HELD — только PREPAID); hold-sweep (T050-канон) реанимирует expired HELD; TgLink — (chatId, orderId) без телефона; claim-гонка = advisory lock + GiST канон 002.

---

## Run #1 (spec rev 1.0) — REJECTED

### 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- Нарушений: 0 (капы 3/телефон, top-5, TTL 30 мин, окно 14d, race ×100 — квантованы).

### 2. Матрица конфликтов (Gate 2: Consistency)

| ID 1 | ID 2 | Суть | Вердикт run #1 |
| :--- | :--- | :--- | :--- |
| **US3 (claim → HELD TTL 10 мин)** | FSM-канон 001/002 (`track FREE → CREATE_BOOKING → CONFIRMED сразу; HELD существует только в PREPAID`) | **Противоречие**: для NONE-услуг (дефолт витрины) FSM не может выдать HELD — статуса нет в треке; спека предписывает статус, который FSM не производит | ❌ **БЛОКЕР C1** |
| US2 (матчинг триггер = RELEASED от hold-expiry) | US2 (уведомление → claim → не собрал → TTL истёк → RELEASED → матчинг снова) | **Цикл уведомлений**: те же кандидаты спамятся на каждый тик sweep'а без камп-капа | ❌ **M1** |
| US2 (TgLink «по телефону») | 004 as-built (`TgLink = chatId + orderId`, телефона нет) | Сущность не матчится по телефону — канал недоступен для waitlist без прошлой брони | ⚠️ M2 (само-противоречие в US2) |

### 3. Полнота (Gate 3)

- (M2-хвост) Два слота освобождены одновременно → одна запись `notified` дважды? Модель статусов не допускает concurrent кампании — надо зафиксировать (одна активная кампания; второе освобождение ждёт re-arm).
- Edge-cases (reschedule≠release, удалённый продукт, PII в URL) — покрыты.

### 4. Однозначность (Gate 4)

- «HELD TTL 10 мин» vs канон 15m (PREPAID_HOLD_TTL_MS) — два разных TTL в одной системе без основания.

### Итоговый статус гейта run #1

- **GATE VERDICT**: **REJECTED** — C1 (claim противоречит FSM-треку), M1 (notify-цикл), M2 (TgLink/телефон + concurrent-кампании). Кларифай → rev 1.1.

---

## Run #2 (spec rev 1.1, post-clarify) — PASS

**Устранения**:
- **C1** → US3 переформулирован: claim = `CREATE_BOOKING` через FSM (как любое бронирование): FREE-трек → **сразу CONFIRMED** (клиент кликнул = намерение подтвердил; 10-минутное окно не нужно — деньги не заморожены); FULL_PREPAYMENT → **HELD TTL 15m** (канон `PREPAID_HOLD_TTL_MS`, ссылка на оплату 003). Никаких новых статусов FSM не требуется.
- **M1** → камп-кап: запись участвует максимум в **3 кампаниях** (notified→unclaimed→re-arm); исчерпан → `expired` + финальное письмо «слоты появились — забронируйте вручную» (без персонального слота). Sweep не уведомляет повторно в пределах одной кампании.
- **M2** → Telegram-канал в MVP **выпилен** (TgLink не матчится по телефону — честно); email-only. TG-enhancement — при появлении `TgLinkByPhone` (007+).
- Concurrent-кампании → одна активная кампания на запись; второе одновременное освобождение уведомляет следующих FIFO-кандидатов, не повторяя уже notified (до re-arm).

### Risk-Based Testing Scoring (rev 1.1)

| Req | Impact | Prob | Risk | Техники |
| :--- | :--- | :--- | :--- | :--- |
| FR-601 (Join) | 3 | 3 | 9 | EP + DT (кап/дубли) |
| FR-602 (Matching+notify) | 4 | 3 | 12 | DT (FIFO/камп-кап) + Error Guessing (циклы) |
| FR-603 (Claim) | 5 | 4 | **20 (Critical)** | **STM (гонка ×100) + DT + Error Guessing + UAT** (money-adjacent слот-контеншн) |
| FR-604 (Lifecycle) | 3 | 2 | 6 | EP (sweep-матрица) |
| FR-605 (Unsubscribe) | 2 | 2 | 4 | Smoke |
| NFR-601..604 | — | — | — | Регрессия/замеры |

### 5. Верdict run #2

**PASS** — 0 блокеров. Risk ≥20: **FR-603** → STM + DT + EG + UAT обязательны (слот-контеншн = броня double-booking в новой одежде).

```yaml
verdict: PASS
audit: requirements-audit
run: 2
audited_at: 2026-11-10T19:30:00Z
spec_revision: "1.1"
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

Business plan: **unchanged** (v2.7.0; waitlist не трогает ICP/цены/рельсы — уведомления по существующим каналам; VII-B.4 PASS, waiver не нужен).

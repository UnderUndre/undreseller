# Test Cases: 006-waitlist-autofill (ISO/IEC/IEEE 29119-3)

**Всего TC**: 15 · Профиль: EP + BVA + STM + DT + Error Guessing

## US1: Join (FR-601)

### TC-006-001: валидный join → 201 + статус waiting + audit `waitlist.join`
- **Priority**: P0 · **EP**

### TC-006-002: кап 3 активных записи/телефон → 4-я отклонена (BVA: 3 ok, 4 fail)
- **Priority**: P0 · **BVA**

### TC-006-003: дубль (phone+service+resource) → 409 WAITLIST_DUPLICATE; прошедшая услуга → 422
- **Priority**: P0 · **Negative**

## US2: Matching + notify (FR-602)

### TC-006-004: RELEASED брони → матчинг FIFO (порядок подписки), top-5 → 5 писем ≤ 60 c
- **Priority**: P0 · **DT**

### TC-006-005: фильтры — чужой ресурс/услуга, expired, статус not-waiting → не уведомлены
- **Priority**: P0 · **DT**

### TC-006-006: камп-кап — 3-я кампания → `expired` + финальное письмо; notified не дублируется при втором освобождении до re-arm
- **Priority**: P0 · **Error Guessing** (audit M1)

## US3: Claim (FR-603 — Risk 20)

### TC-006-007: STM claim-гонка ×100 на один слот → 1 CONFIRMED (FREE) / HELD (PREPAID), 99×409 SLOT_TAKEN, 0 double-booking
- **Priority**: P0 · **STM**

### TC-006-008: claim → PREPAID услуга → HELD 15m + платёжная ссылка (003-канон); TTL-истечение → hold-sweep RELEASED → повторный матчинг (камп-кап учтён)
- **Priority**: P0 · **STM**

### TC-006-009: token-матрица — valid / expired (кампания) / wrong-entry / replay после converted → 403
- **Priority**: P0 · **BVA**

### TC-006-010: auto-advance — проигравший claim → следующая FIFO-запись получает письмо; исходная → converted/expired по исходу
- **Priority**: P0 · **DT**

## US4: Lifecycle (FR-604/605)

### TC-006-011: sweep — expired >14d → `expired`; notified >30 мин → re-arm `waiting`; камп-кап ≥3 → expired + финальное письмо
- **Priority**: P0 · **EP**

### TC-006-012: unsubscribe → `cancelled`; повторные match-циклы его не трогают
- **Priority**: P1 · **EP**

### TC-006-013: unsubscribe с чужим/устаревшим токеном → 403
- **Priority**: P1

## NFR

### TC-006-014: полный регрессионный гейт (validate/lint/int/build 0 exit; 153+ старых зелёные)
### TC-006-015: 0 новых deps; матчинг ≤50 ms + claim p95 < 100 ms (evidence); PII-grep: claim-ссылка и письма без телефона/контактов

## Exploratory Charter (Risk ≥20, конституция XII)
- **Чартер E-03** (FR-603, 60 мин): атака на claim — гонки claim×claim×витрина, replay в окне кампании, конкурентные освобождения, камп-кап на границе.

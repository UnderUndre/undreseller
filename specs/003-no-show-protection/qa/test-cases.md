# Test Cases: 003-no-show-protection (ISO/IEC/IEEE 29119-3)

**Всего TC**: 21 · Профиль: EP + BVA + STM + DT + Error Guessing

## US1: Deposit + PREPAID (FR-301/302/308)

### TC-003-001: NONE-услуга — путь 002 без изменений (0 регрессий)
- **Priority**: P0 · **Technique**: DT (paymentMode=NONE)

### TC-003-002: FULL_PREPAYMENT happy-path — Order amount = priceInUSD×100 (minor units, инвариант)
- **Priority**: P0 · **DT**

### TC-003-003: STM PREPAID-матрица: AVAILABLE→HELD→PAYMENT_PENDING→CONFIRMED (полная цепочка)
- **Priority**: P0 · **STM** (Risk 20)

### TC-003-004: неоплаченный холд TTL 15m → sweep → RELEASED + Order cancelled
- **Priority**: P0 · **STM**

### TC-003-005: late webhook после release + re-book → PAID_REQUIRES_RESOLUTION + refund-request, никогда тихое PAID
- **Priority**: P0 · **STM + Error Guessing**

### TC-003-006: PI-create failure (Stripe 5xx) → 502 PAYMENT_INIT_FAILED; HELD истекает штатно
- **Priority**: P1 · **Error Guessing**

## US2: Webhooks (FR-303)

### TC-003-007: replay ×100 одного события → 1 PaymentEvent + 1 InboxEvent, 99×200 no-op
- **Priority**: P0 · **Error Guessing** (Risk 20)

### TC-003-008: tampered signature → 400 (плагин), 0 обработок
- **Priority**: P0

### TC-003-009: amount mismatch → AMOUNT_MISMATCH-ветка (invariants), staff-alert, FSM не тронут
- **Priority**: P0 · **DT**

### TC-003-010: сбой БД при обработке → 5xx → Stripe ретрай → идемпотентная до-обработка
- **Priority**: P0 · **Error Guessing**

## Refund (FR-304)

### TC-003-011: cancel до cutoff → Stripe Refund → charge.refunded → Order REFUNDED
- **Priority**: P0 · **DT**

### TC-003-012: cancel после cutoff → refund_requested; staff approve → refund; BVA cutoff ±1 мин
- **Priority**: P0 · **BVA + DT**

## US3: Email (FR-305)

### TC-003-013: reminder уходит ровно один раз — гонка 2 воркеров на CAS reminderSentAt → 1 delivery-log
- **Priority**: P0 · **CAS-race**

### TC-003-014: Resend 5xx → ретрай ≤5 backoff → после успеха delivery-log; ACK клиента bump scheduleVersion
- **Priority**: P1 · **EP**

## US4: Токены (FR-306)

### TC-003-015: token-матрица valid/expired/replayed (TOKEN_ALREADY_CONSUMED ×100)/after-cutoff (CUTOFF_PASSED); GET-запрос сканера не сжигает токен, POST потребляет
- **Priority**: P0 · **BVA + Security**

### TC-003-016: reschedule атомарный обмен — старый слот RELEASED строго при фиксации нового слота; закрытие вкладки сохраняет старый слот; для PREPAID существующий Order переносится на новый слот без повторного списания
- **Priority**: P0 · **STM + DT**

## US5: Планировщик (FR-307)

### TC-003-017: рестарт воркера посреди sweep → 0 дублей release, 0 пропусков expired-hold (lease/idempotent)
- **Priority**: P0 · **EP + Error Guessing**

## FR-308 / NFR

### TC-003-018: email-матрица: FULL_PREPAYMENT без email → 422 EMAIL_REQUIRED; NONE без email → OK, 0 писем
- **Priority**: P0 · **DT**

### TC-003-019: NONE с email → confirmation + reminder по расписанию (confirmationNoticeHours, TZ инстанса)
- **Priority**: P1

### TC-003-020: полный регрессионный гейт (validate/lint/int/build 0 exit; 72+ старых зелёные)
### TC-003-021: 0 новых deps (diff package.json); ≤500 MB memory-замер при sweep-нагрузке (evidence)

## Exploratory Charter (Risk ≥20, конституция XII)
- **Чартер E-01** (FR-302/303, 60 мин): свободная атака на money-path — комбинации поздних вебхуков, TTL-границы, replay во время ретрая, одновременные cancel+webhook-гонки.

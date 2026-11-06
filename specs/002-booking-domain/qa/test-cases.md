# Test Cases: 002-booking-domain (ISO/IEC/IEEE 29119-3)

**Всего TC**: 24 · Профиль: EP + BVA + STM + DT + Error Guessing

## US1: Bootstrap (FR-201)

### TC-002-001: токен валиден на пустой БД → OWNER
- **Priority**: P0 · **Technique**: EP
- **Expected**: роли `['OWNER']`; AuditEvent `bootstrap.owner`

### TC-002-002: без токена на пустой БД → customer (takeover=0)
- **Priority**: P0 · **Type**: Negative

### TC-002-003: повторный бутстрап при существующем OWNER → 403/отказ
- **Priority**: P0 · **Type**: Boundary

### TC-002-004: гонка двух первых create → ровно один OWNER
- **Priority**: P0 · **Technique**: Error Guessing (advisory-lock)

## US2/US3: Double-booking defense (FR-202/203)

### TC-002-005: 100 конкурентных booking одного ресурса/интервала → 1 успех, 99×409
- **Priority**: P0 · **Technique**: STM + Error Guessing
- **Expected**: 0 double-booking (L1 advisory + L2 GiST)

### TC-002-006: разные ресурсы, тот же интервал → обе брони OK
- **Priority**: P1

### TC-002-007: 23P01 → HTTP 409 с error-catalog кодом SLOT_TAKEN
- **Priority**: P0

## US3: Catalog/Hours (FR-204)

### TC-002-008: услуга 45 мин на 30-мин сетке → слоты 10:00/10:30 (квант-канон)
- **Priority**: P1 · **BVA**

### TC-002-009: WeeklyHours break режет слот; TZ-сдвиг инстанса не двигает сетку
- **Priority**: P1

## US4: Availability (FR-205)

### TC-002-010: бронь 10:00–11:00 + буферы 15 → 10:15–10:45 недоступны (BVA buffer)
- **Priority**: P0

### TC-002-011: DST-переход — сетка стабильна (fixed-offset)
- **Priority**: P1

### TC-002-012: AvailabilityException (закрытый день) — 0 слотов
- **Priority**: P1

### TC-002-013: p95 availability < 50 ms (NFR, замер в evidence)
- **Priority**: P1 · **Performance**

## US5: Booking service (FR-206)

### TC-002-014: happy-path IN_CALL → CONFIRMED/BOOKED + AuditEvent + cancel-token hash
- **Priority**: P0 · **STM**

### TC-002-015: OUT_CALL → PENDING_APPROVAL
- **Priority**: P0

### TC-002-016: занятый слот → 409 SLOT_TAKEN; вне сетки → 422 OUT_OF_GRID; не-bookable → 422
- **Priority**: P0 · **DT**

### TC-002-017: idempotencyKey ×100 → одна бронь
- **Priority**: P0

## US8: Rate limit (FR-207)

### TC-002-018: 10-й запрос 200, 11-й 429+Retry-After; новое окно → 200 (BVA)
- **Priority**: P1

## US6: Approvals (FR-208)

### TC-002-019: OPERATOR approve → BOOKED; reject → RELEASED + повторная доступность
- **Priority**: P0 · **DT**

### TC-002-020: CAS-гонка approve по старой scheduleVersion → ALREADY_PROCESSED; PERFORMER → 403
- **Priority**: P0

## US7: Storefront (FR-209)

### TC-002-021: e2e booking-flow: услуга → слот → детали → confirmation + cancel-link once; гонка двух вкладок → 409+refresh
- **Priority**: P1 · **E2E**

## FR-210 / NFR

### TC-002-022: audit-события на create/approve/reject/bootstrap; PII-redact metadata
### TC-002-023: полный регрессионный гейт (validate/lint/int/build 0 exit; 72+ старых зелёные)
### TC-002-024: 0 новых deps (diff package.json: только зеркальные скрипты); ≤500 MB замер

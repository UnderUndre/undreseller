# Test Cases: 007-booking-trust-gate (ISO/IEC/IEEE 29119-3)

**Всего TC**: 20 · Профиль: EP + BVA + STM + DT + Error Guessing

## US1: Intents + OTP (FR-701)

### TC-007-001: фаза 1 → 202 + intent `pending` + OTP-письмо (код ≠ plaintext в БД; codeHash с контекст-биндингом intentId+email — F6)
- **Priority**: P0 · **EP**

### TC-007-002: future-slot guard — intent на прошедший слот → 422; кап 2 live/email → 3-й → 429 INTENT_CAP; композитный RL — per-IP 10/10min и per-email 3/10min независимыми бакетами (F3)
- **Priority**: P0 · **BVA**

### TC-007-003: TTL — verify по истечении 10m → 403; intent → `expired` свипом
- **Priority**: P1 · **BVA**

## US1/FR-702: Two-phase gate (Risk 20)

### TC-007-004: фаза 2 — верный OTP → **гидратация параметров строго из БД-интента (спуфинг тела игнорируется — F5)** → FSM CREATE_BOOKING (FREE→CONFIRMED; PREPAID→HELD 15m) → CAS consumed ПОСЛЕ успеха (F4)
- **Priority**: P0 · **STM**

### TC-007-005: attempts-гейт — 5 неверных кодов → intent `dead` (403); 6-й верный код на dead-intent → 403 (брутфорс невозможен)
- **Priority**: P0 · **DT + Error Guessing**

### TC-007-006: concurrent verify одного интента (×2) → CAS consumed → ровно 1 бронь, второй 409
- **Priority**: P0 · **STM**

### TC-007-007: занятый слот на фазе 2 → 409 SLOT_TAKEN + intent `dead` (никогда не re-arm, БЕЗ auto-advance — F4); повтор при consumed → существующая бронь по idempotencyKey
- **Priority**: P0 · **DT**

### TC-007-008: OTP-письмо — код в письме, услуги/время; plaintext-кода нет в БД (grep)
- **Priority**: P0 · **PII-grep**

### TC-007-009: resend — ротация codeHash на существующем pending-интенте (F2), ≤3/10 мин; композитный RL — per-IP и per-email независимые бакеты (F3)
- **Priority**: P1 · **BVA**

## US2: Honeypot (FR-703)

### TC-007-010: заполненное honeypot-поле (booking) → silent 200 + audit `honeypot.hit` + 0 эффектов
- **Priority**: P0 · **DT**

### TC-007-011: honeypot на waitlist-форме → аналогично; a11y-атрибуты (aria-hidden/tabindex/-1) присутствуют
- **Priority**: P1 · **DT + a11y**

## US3: Waitlist double-opt-in (FR-704)

### TC-007-012: join → `pending` + opt-in письмо на лендинг (GET просмотр — scanner-safe F9); матчинг не уведомляет pending (relay-guard)
- **Priority**: P0 · **DT**

### TC-007-013: confirm явной кнопкой POST с лендинга → `waiting` → попадает в матчинг; 48h-expiry → expired; resend opt-in при повторном join (F9)
- **Priority**: P0 · **BVA**

### TC-007-014: confirm с чужим/просроченным токеном → 403
- **Priority**: P1

## FR-705/706

### TC-007-015: sweep — expired интенты >10m; GDPR purge 30d
- **Priority**: P0 · **EP**

### TC-007-016: trust-cookie (F1) — OTP-успех выдаёт HttpOnly cookie; повторная бронь с cookie → 201 без OTP; без cookie → OTP-фаза
- **Priority**: P0 · **EP**

### TC-007-017: trust-cookie spoofing-негатив — чужой email без cookie → OTP обязателен (email-история без cookie не пропускает — F1)
- **Priority**: P1 · **Negative**

## US6: Seams review

### TC-007-018: отчёт ревью швов в evidence (чек-лист manual-QA класса) с фиксами
- **Priority**: P1 · **Manual evidence**

## NFR

### TC-007-019: полный регрессионный гейт (validate/lint/int/build 0 exit; 164+ старых зелёные)
### TC-007-020: 0 новых deps; intent create p95 < 30 ms, verify p95 < 50 ms (evidence); PII-grep (HMAC-only)

## Exploratory Charter (Risk ≥20, конституция XII)
- **Чартер E-04** (FR-702, 60 мин): атака на гейт — brute-force OTP, concurrent verify, replay consumed, фазовые подмены (otp из чужого интента), race intent-create vs confirm.

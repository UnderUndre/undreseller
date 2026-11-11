# Requirements Audit Report: 007-booking-trust-gate

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #2; run #1 на rev 1.0 — **REJECTED**, 2 CRITICAL + 3 MEDIUM устранены clarify → rev 1.1)
- **Audit Date**: 2026-11-11
- **Audited**: `specs/007-booking-trust-gate/spec.md` rev 1.1 (12 reqs: 7 FR + 5 NFR)
- **Grounding (001–006 as-built)**: OTP/HMAC-канон существует (`tokens.ts`); honeypot в коде — `[IDENTIFIER NOT FOUND]`; email-verification — `[IDENTIFIER NOT FOUND]`; Resend-канон (003 T330); Payload Jobs канон; route `POST /api/booking` — один однобазовый вызов createBooking; waitlist join — статус `waiting` сразу (relay-дыра подтверждена кодом).

---

## Run #1 (spec rev 1.0) — REJECTED

### 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- Нарушений: 0 (TTL 10m, attempts ×5, кап 2 live/email, 48h opt-in, 60d purge — квантованы).

### 2. Матрица конфликтов (Gate 2: Consistency)

| ID 1 | ID 2 | Суть | Вердикт run #1 |
| :--- | :--- | :--- | :--- |
| **US1 (OTP хранится, лимит попыток не специфицирован)** | NFR-704 (OTP только HMAC) | **Двойной блокер C1**: (а) наивный draft хранит код plaintext — нарушение канона; (б) 6-значный код без attempt-гейта = 10⁶ комбинаций брутфорсятся за 10-мин TTL тривиально | ❌ **БЛОКЕР C1** |
| **US3 (waitlist join → уведомления без подтверждения email)** | GDPR + Resend-ToS | **C2**: неподтверждённый email = наш Resend шлёт письма произвольным адресам → спам-релей → бан домена; GDPR-письма без согласия | ❌ **БЛОКЕР C2** |
| US1 (OTP-фаза) | 003 canon (PREPAID→HELD+платёжная ссылка) | Совместимо: verify → FSM CREATE_BOOKING → HELD; платёжная ссылка после верификации | ✅ |
| US2 (honeypot silent 200) | US1 (rate limit) | Два независимых слоя — канон OWASP | ✅ |

### 3. Полнота (Gate 3: Completeness)

- **M1**: BookingIntent без lifecycle — интенты копятся вечно, live intents на один email не ограничены (спам-копание интентов).
- **M2**: honeypot без a11y-атрибутов (aria-hidden/tabindex) + silent-200 без audit — немаркируемо.
- **M3**: intent на прошедший слот — guard не специфицирован.

### 4. Однозначность (Gate 4)

- Статус-машина интента не зафиксирована (pending/consumed/dead/expired — перечислены в коллекции, но переходы не описаны).

### Итоговый статус гейта run #1

- **GATE VERDICT**: **REJECTED** — C1 (OTP brute-force/plaintext), C2 (waitlist relay), M1–M3. Кларифай → rev 1.1.

---

## Run #2 (spec rev 1.1, post-clarify) — PASS

**Устранения**:
- **C1** → `codeHash = HMAC(code)` (timing-safe verify); **attempts ≤ 5 → intent `dead`** (10⁶/5 попыток = брутфорс невозможен в TTL); plaintext-кода в БД нет ни одной секунды.
- **C2** → US3 переписан: join → **`pending`** + double-opt-in письмо (HMAC, TTL 48h) → `waiting`; матчинг фильтрует строго `waiting` — неподтверждённые не уведомляются никогда (анти-релей + GDPR-согласие).
- **M1** → US4: intent lifecycle sweep (expired >10m → `expired`; verified 30d → purge; кап ≤2 live/email → 429 INTENT_CAP).
- **M2** → FR-703 дополнен a11y-атрибутами (aria-hidden, tabindex=-1, autocomplete=off) + audit `honeypot.hit` на каждый silent-reject.
- **M3** → FR-701: intent создаётся только на future slot (`start > now`, иначе 422).
- Статус-машина интента зафиксирована: `pending → consumed | dead | expired` (+`verified` для allowlist-источника).

### Risk-Based Testing Scoring (rev 1.1)

| Req | Impact | Prob | Risk | Техники |
| :--- | :--- | :--- | :--- | :--- |
| FR-701 (Intent) | 4 | 3 | 12 | EP + DT (кап/окно) |
| FR-702 (Two-phase gate) | 5 | 4 | **20 (Critical)** | **STM + DT + EG + UAT** (календарная целостность = весь продукт) |
| FR-703 (Honeypot) | 3 | 3 | 9 | DT (silent/audit/a11y) |
| FR-704 (Double-opt-in) | 4 | 3 | 12 | DT (pending/waiting/relay-guard) |
| FR-705 (Lifecycle) | 3 | 2 | 6 | EP (sweep-матрица) |
| FR-706 (Allowlist) | 3 | 2 | 6 | EP + spoofing-негатив |
| FR-707 (Seams review) | 3 | 2 | 6 | Документированный ревью (evidence) |
| NFR-701..704 | — | — | — | Регрессия/замеры |

### 5. Верdict run #2

**PASS** — 0 блокеров. Risk ≥20: **FR-702** → STM + DT + EG + UAT обязательны (intents/OTP = календарная целостность).

```yaml
verdict: PASS
audit: requirements-audit
run: 2
audited_at: 2026-11-11T20:00:00Z
spec_revision: "1.1"
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

Business plan: **unchanged** (v2.7.1; trust gate не трогает ICP/цены/рельсы — защита инвентаря; VII-B.4 PASS, waiver не нужен).


---

## Run #3 (spec rev 1.2, post-antigravity review) — PASS

Интеграция 11 находок состязательного аудита `antigravity` (F1–F10 + F11 синхронизация бизнес-плана):

1. **F1 (HIGH) — Allowlist спуфинг**: email-история без доказательства владения отвергнута; **HttpOnly+Secure+SameSite=Lax trust-cookie `client_trust_token` (HMAC, TTL 90d)**, выдаётся при успешной OTP-верификации; без cookie → OTP обязателен. FR-706 переписан.
2. **F2 (HIGH) — Resend-контракт**: resend = ротация codeHash + refresh expiresAt на **существующем** pending-интенте (без дублей-интенов), ≤3/10 мин на интент. FR-702 дополнен.
3. **F3 (HIGH) — Email-бомбардировка**: композитный rate limit — **per-IP ≤10/10min + per-email ≤3/10min независимыми бакетами**. FR-701/FR-702 дополнены.
4. **F4 (HIGH) — CAS-порядок**: `consumed` строго ПОСЛЕ успешного createBooking; при 409 SLOT_TAKEN → `dead`; повтор при consumed → существующая бронь по детерминированному idempotencyKey. FR-702 переписан.
5. **F5 (MEDIUM) — Confused-deputy**: гидратация параметров брони строго из БД-интента; тело запроса кроме intentId/otp игнорируется. FR-702 дополнен.
6. **F6 (MEDIUM) — HMAC контекст-биндинг**: `codeHash = HMAC('otp:'+intentId+':'+email+':'+code)`. FR-701 дополнен.
7. **F7 (MEDIUM) — Retention sync**: consumed 90d (allowlist/trust-cookie источник), dead/expired 30d; терминальный успех строго `consumed`. FR-705 переписан.
8. **F8 (MEDIUM) — Project Structure**: план дополнен payload.config.ts / WaitlistEntries.ts / EmailDeliveryLog.ts / resendAdapter.ts; опечатка пути исправлена (`src/lib/booking/intentService.ts`).
9. **F9 (MEDIUM) — Scanner-safe opt-in**: лендинг GET-просмотр + явный POST-confirm; resend opt-in при повторном join. FR-704 дополнен.
10. **F10 (LOW) — Sweep scope**: 5m intentSweep только expired pending→expired; purge → ночной GDPR. FR-705 переписан.
11. **F11 (LOW) — Нумерация**: bizplan §2.4 — 007 = booking-trust-gate, ЮKassa → 008 (undreplans `d5f5af0`).

### Risk-Based Testing Scoring (rev 1.2)

| FR-701 (Intent) | 4 | 3 | 12 | EP + DT (кап/окно/HMAC-биндинг) |
| FR-702 (Two-phase gate) | 5 | 4 | **20 (Critical)** | **STM + DT + EG + UAT** (спуфинг/гонки/брутфорс) |
| FR-703 (Honeypot) | 3 | 3 | 9 | DT (silent/audit/a11y) |
| FR-704 (Double-opt-in) | 4 | 3 | 12 | DT (pending/scanner-safe/resend) |
| FR-705 (Lifecycle) | 3 | 2 | 6 | EP (retention-матрица) |
| FR-706 (Trust cookie) | 3 | 3 | 9 | EP + spoofing-негатив |
| FR-707 (Seams review) | 3 | 2 | 6 | Отчёт в evidence |

### 5. Верdict run #3

**PASS** — 0 блокеров. Все 11 находок устранены в спецификации rev 1.2.

```yaml
verdict: PASS
audit: requirements-audit
run: 3
audited_at: 2026-11-11T22:30:00Z
spec_revision: "1.2"
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

Business plan: **v2.7.1 + renumber sync** (`d5f5af0`, undreplans): 007 = booking-trust-gate, ЮKassa → 008. VII-B.4 PASS.

# Requirements Audit Report: 003-no-show-protection

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #2; run #1 на rev 1.0 — **REJECTED**, 2 блокера устранены clarify → rev 1.1)
- **Audit Date**: 2026-11-07
- **Audited**: `specs/003-no-show-protection/spec.md` rev 1.1 (11 reqs: 8 FR + 4 NFR)
- **Grounding**: код 002 as-built (`c5f3bf1`): bookingService (единственный status-writer), FSM PREPAID-трек в kernel, `invariants.ts`, `jobs.tasks: []` в payload.config, `customerEmail` на Order — **nullable** (002 собирал имя/телефон); плагин `@payloadcms/plugin-ecommerce` 3.93 монтирует `/api/payments/stripe/webhooks` с `constructEvent`-верификацией и диспетчем через проп `webhooks` (хендлеров не зарегистрировано — 200 no-op)

---

## Run #1 (spec rev 1.0) — REJECTED

### 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- Нарушений: **0**. Все FR детерминированы: enum-политика `NONE|FULL_PREPAYMENT` (FR-301), FSM-переходы + TTL 15m (FR-302), replay ×100 → 1 PaymentEvent / tampered → 400 (FR-303), cutoff-политика возврата (FR-304), CAS reminder (FR-305), токен-матрица valid/expired/replayed/after-cutoff (FR-306), idempotent+lease sweep (FR-307).
- Note (LOW): FR-307 содержит отложенное решение (Inngest vs Payload Jobs) — само свойство «idempotent + lease + ≤500 MB» верифицируемо независимо от выбора; выбор фиксируется планом (как D1 в 002). Не блокер.

### 2. Матрица конфликтов (Gate 2: Consistency)

| ID 1 | ID 2 | Суть конфликта | Вердикт run #1 |
| :--- | :--- | :--- | :--- |
| FR-303 («Webhooks отвечают 200 всегда») | NFR-303 (fail-closed, 0 silent-PAID) + контракт ретраев Stripe | **Внутреннее противоречие**: при 200-always Stripe никогда не ретраит — «ошибки → ретраи Stripe» невозможны; сбой обработки тихо ACK-ается → silent-loss, прямое нарушение NFR-303 | ❌ **БЛОКЕР C1** |
| FR-307 (Inngest как вариант) | NFR-302 (0 новых deps) | Взаимодействие, не конфликт: выбор Inngest требует явного обоснования плана против NFR-302 | ✅ разрешается план-фазой |
| FR-304 (авто-возврат до cutoff) | US4 AC1 (после cutoff — staff resolution) | Две ветки одной политики, не конфликт | ✅ |
| FR-301 (default NONE) | План v2.5.0 §2.2 («холд/оплата») | Конверсия-first — канон владельца (legacy FR-407); процесс сохранён | ✅ |

### 3. Полнота (Gate 3: Completeness)

- **БЛОКЕР B1 (email-рецепиент)**: FR-305 шлёт email-reminders и confirmation-письма с cancel/reschedule-токенами, но 002 as-built собирает **имя/телефон**, `customerEmail` — nullable (`bookingService.ts:35-37,184`). Спека не фиксирует правило захвата email → FR-305 не реализуем как написан (письма без адресата).
- Edge-cases: покрыты (поздний вебхук/PAID_REQUIRES_RESOLUTION, mismatch, cutoff BVA, retry storm, TZ).
- Пробел (MEDIUM): падение создания PaymentIntent (Stripe 5xx) — путь ошибки не зафиксирован.
- Пробел (LOW): недоступность Resend — политика ретраев не указана.

### 4. Однозначность (Gate 4)

- (LOW) Термин-коллизия: «подтверждение» в US3 (клик клиента по reminder) vs FSM `CONFIRMED` — разные сущности, словарь надо развести.
- (LOW) Устаревший якорь базы: `002-booking-domain (2d5bfbe)` — коммита не существует; фактический `c5f3bf1`.

### Итоговый статус гейта run #1

- **GATE VERDICT**: **REJECTED** — блокеры C1 (противоречие webhook-ACK) и B1 (email-рецепиент). Переход к `/speckit.plan` заблокирован; выполнен clarify → rev 1.1.

---

## Run #2 (spec rev 1.1, post-clarify) — PASS

**Устранения**: C1 → US2/FR-303 переформулированы (200 = dedupe-replay/неизвестный тип; 5xx = сбой обработки → Stripe ретраит; 400 = tamper через плагин). B1 → новый FR-308 (email-политика: email обязателен для FULL_PREPAYMENT; опционален для NONE; reminders только при известном email; email-less брони самообслуживаются on-page ссылками) + Edge Cases + Q6. Термин-коллизия → «acknowledgement» в US3. Якорь базы → `c5f3bf1`. Пробелы → Edge Cases (PaymentIntent failure, Resend retry-политика через Payload Jobs).

### 1. Стоп-слова: 0 нарушений (rev 1.1)
### 2. Конфликты: C1 разрешён (ACK-матрица); остальные ✅
### 3. Полнота: B1 закрыт FR-308; failure-пути в Edge Cases
### 4. Однозначность: словарь разведён (FSM CONFIRMED ≠ reminder acknowledgement)

### Risk-Based Testing Scoring (rev 1.1)

| Req | Impact | Prob | Risk | Техники (конституция XII) |
| :--- | :--- | :--- | :--- | :--- |
| FR-301 | 5 | 3 | 15 (High) | BVA, DT (paymentMode × track), негативные |
| FR-302 | 5 | 4 | **20 (Critical)** | **STM + DT + Exploratory + UAT** (money FSM) |
| FR-303 | 5 | 4 | **20 (Critical)** | **STM + DT + Error Guessing (replay/tamper) + UAT** |
| FR-304 | 4 | 3 | 12 (Medium) | BVA (cutoff ±1min), DT |
| FR-305 | 3 | 3 | 9 (Medium) | EP + CAS-race тест |
| FR-306 | 4 | 3 | 12 (Medium) | BVA + token-матрица |
| FR-307 | 3 | 2 | 6 (Medium) | EP + restart/lease тест |
| FR-308 | 4 | 3 | 12 (Medium) | EP + DT (email presence × paymentMode) |
| NFR-301..304 | — | — | — | Регрессия/замеры (см. RTM) |

### 5. Верdict run #2

**PASS** — 0 блокеров. Risk ≥20: **FR-302, FR-303** → Decision Table + State Transition + Exploratory Charter + UAT обязательны (money-adjacent, конституция XII).

```yaml
verdict: PASS
audit: requirements-audit
run: 2
audited_at: 2026-11-07T06:30:00Z
spec_revision: 1.1
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

Business plan: unchanged (дельта платёжных рельс уже в v2.5.0; waiver VII-B.5 приложен — `business-plan-waiver.md`).

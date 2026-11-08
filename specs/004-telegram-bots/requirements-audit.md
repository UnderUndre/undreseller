# Requirements Audit Report: 004-telegram-bots

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #2; run #1 на rev 1.0 — **REJECTED**, 4 блокера устранены clarify → rev 1.1)
- **Audit Date**: 2026-11-08
- **Audited**: `specs/004-telegram-bots/spec.md` rev 1.1 (12 reqs: 8 FR + 4 NFR)
- **Grounding (002+003 as-built)**: grammY **отсутствует** в deps; коллекций Blacklist/TgLink/TelegramOutbox нет; `ShopSettings` не имеет staffChatIds/defaultLocale; `customerTgId` нигде не хранится; reschedule-токен генерируется только при бронировании (003), re-issue функции нет; FSM не имеет FULFILLED-статуса (orders: processing/completed/cancelled/refunded + 4 статуса 003); email-канон 003 не зависит от outbox.

---

## Run #1 (spec rev 1.0) — REJECTED

### 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- (MEDIUM) SC-001/US2 acceptance «1000 enqueue → p95 доставки ≤ 60 c» — **физически недостижимо**: одиночный outbox-воркер с 30s lease + Telegram limits (~30 msg/s глобально, ~1 msg/s на чат) + 429-cooldown не успевают burst 1000 за 60 c. Требование внутренне противоречиво с cooldown-механикой FR-401.
- (LOW) NFR-401 «72+ регрессия» — устарело: после 003 контур = 129 тестов.
- Остальные FR квантуемы: lease 30s, barrier 30s, cooldown 24h, purge 90d, приоритеты enum.

### 2. Матрица конфликтов (Gate 2: Consistency)

| ID 1 | ID 2 | Суть конфликта | Вердикт run #1 |
| :--- | :--- | :--- | :--- |
| US3 («fulfill» действие) | FSM-канон 001/002 («все переходы через FSM доменного сервиса») | **Противоречие**: FSM не имеет FULFILLED-статуса; действие без семантики мутации | ❌ **БЛОКЕР C1** |
| FR-401 («единственный путь исходящих») | 003 email-канон (Resend jobs) | Двусмысленность: outbox претендует и на email? | ❌ **БЛОКЕР C2-scope** (уточнение скоупа) |
| US4 («confirm блокирует auto-cancel ветку») | 002/003 как-built (auto-cancel не существует; confirm = acknowledgement CAS) | **Мёртвая ссылка** на несуществующую ветку | ❌ **БЛОКЕР C3** |
| US2 (worker kill → lease) | Payload Jobs lease-канон | Совместимо: dispatch через Payload Job, lease — поле outbox | ✅ |

### 3. Полнота (Gate 3: Completeness)

- **БЛОКЕР B1 (Blacklist без сущности)**: US3/US4/SC-003 требуют blacklist-enforcement (скрытие кнопок, 403, очистка reply-markup), но ни коллекции, ни FR, ни точек enforcement не описано. В коде сущности нет.
- **БЛОКЕР B2 (linking)**: клиентский бот требует связку chatId↔клиент (`customerTgId`), механизм привязки не описан (как клиент попадает в бота?), место хранения не определено, PII-статус chatId не указан.
- (LOW) Staff-reschedule ссылается на magic-link 003, но re-issue токена (003 выдаёт один раз при бронировании) не описан.
- (LOW) Мультиязычность опирается на `ShopSettings.defaultLocale` — поля нет в глобале (аналог B1 из 003 run#1).

### 4. Однозначность (Gate 4)

- Словарь: outbox/lease/claim/barrier — канон легаси, определены. (LOW) «1:1 chat» в авторизации не определён операционально (chat == chat карточки?).

### Итоговый статус гейта run #1

- **GATE VERDICT**: **REJECTED** — блокеры C1 (fulfill-семантика), C2-scope (outbox vs email), C3 (auto-cancel мёртвая ссылка), B1 (Blacklist), B2 (linking). Переход к `/speckit.plan` заблокирован; выполнен clarify → rev 1.1.

---

## Run #2 (spec rev 1.1, post-clarify) — PASS

**Устранения**: C1 → «fulfill» переопределён как order-level действие (Order → `completed` + AuditEvent, бронь остаётся BOOKED, FSM не затронут). C2-scope → FR-401 уточнён: outbox — единственный путь **Telegram**-исходящих; email остаётся на Resend-jobs 003. C3 → US4 переформулирован: confirm = acknowledgement (CAS bump, cancelOn-матрица), decline → FSM CUSTOMER_CANCEL + staff alert. B1 → новый **FR-406 (Blacklist)**: коллекция + 3 точки enforcement + очистка reply-markup. B2 → новый **FR-407 (Tg-linking)**: deep-link `/start <accessToken>` → `TgLink (chatId unique, orderId)`, chatId = PII (PII-канон, purge 90d вместе с данными). C2-физика → SC-001 переформулирован: steady-state p95 ≤ 60 c при ≤50 msg/min; burst 1000 → drain ≤ 20 мин, 0 потерь / 0 дублей. M1 → NFR-401 = «129+ старых». M2 → `ShopSettings.defaultLocale` добавлен в FR-406-сопроводование глобала. L1 → FR-403 включает staff re-issue reschedule-токена (новая сервис-функция, CAS bump + audit).

### Risk-Based Testing Scoring (rev 1.1)

| Req | Impact | Prob | Risk | Техники (конституция XII) |
| :--- | :--- | :--- | :--- | :--- |
| FR-401 (Outbox) | 4 | 4 | **16 (High)** | STM (lease/claim/race) + Error Guessing (kill/429) + stress |
| FR-402 (Staff pager+CAS) | 4 | 4 | **16 (High)** | DT (auth × actions) + STM (CAS) + UAT |
| FR-403 (Client bot) | 3 | 3 | 9 (Medium) | EP + DT (linking × blacklist) |
| FR-404 (GDPR) | 4 | 3 | 12 (Medium) | BVA (90d граница) + redaction-тесты |
| FR-405 (Webhook security) | 4 | 3 | 12 (Medium) | Security DT (secret × origin) |
| FR-406 (Blacklist) | 3 | 3 | 9 (Medium) | DT (enforcement × surface) |
| FR-407 (Tg-linking) | 3 | 3 | 9 (Medium) | EP + PII-тесты |
| FR-408 (Dispatch worker) | 4 | 4 | **16 (High)** | STM (lease race) + Error Guessing (429/5xx) |
| NFR-401..404 | — | — | — | Регрессия/замеры (см. RTM) |

### 5. Верdict run #2

**PASS** — 0 блокеров. Risk 15–19 (FR-401/402/408) → BVA + негативные + симуляция сбоев обязательны; money-path не затронут (боты не двигают деньги — taboos).

```yaml
verdict: PASS
audit: requirements-audit
run: 2
audited_at: 2026-11-08T03:30:00Z
spec_revision: 1.1
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

Business plan: unchanged (уведомление в Telegram — финал сквозного процесса §2.2; waiver VII-B.5 приложен — `business-plan-waiver.md`).

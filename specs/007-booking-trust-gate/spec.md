# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `007-booking-trust-gate`
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001 (`980bc32`) + 002 (`c5f3bf1`) + 003 (`3697b3d`) + 004 (`9efe76a`) + 005 (`3a576e4`) + 006 (`a66eed5`) + QA-фиксы (`4c0d1ab`)
**Статус:** **DRAFT — REVISION 1.1 (2026-11-11; clarify по audit run#1: C1 OTP хранится только как HMAC + attempts≤5→dead (брутфорс невозможен), C2 waitlist double-opt-in pending→waiting (анти-релей/GDPR), M1 intent lifecycle sweep+кап 2 live/email, M2 honeypot a11y+audit, M3 future-slot guard; статус-машина интента зафиксирована)**
**Source of truth по бизнесу:** план v2.7.1 (без дельты — trust gate не меняет ICP/цены/рельсы; это защита инвентаря календаря) · **research:** dossier 2026-11-11 (OWASP Bot Management Cheat Sheet; honeypot-канон Auth0; manual-QA `4c0d1ab` — 3 живых бага класса швов)

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Продукт продаёт «честный календарь», но публичные write-эндпоинты (`POST /api/booking`, `POST /api/waitlist`) принимают что угодно: единственный барьер — per-IP rate limit, который распределённый бот обходит ротацией. Бот-ферма пишет мусорные брони → availability отравлена → владелец теряет продукт на день 1 деплоя. Плюс waitlist-join без подтверждения email превращает наш Resend в спам-релей на произвольные адреса (бан домена в Resend + GDPR-письма без согласия).

### 1.2. Решение

**Trust Gate** на публичных write-эндпоинтах: (1) email-верификация брони через одноразовый 6-значный код (OTP) на этапе бронирования — слот захватывается только после подтверждения владения email; (2) honeypot-поля на всех публичных формах (silent reject); (3) double-opt-in для waitlist (подтверждение подписки письмом до включения в матчинг); (4) верифицированный email (повторный клиент) — без повторного OTP. Плюс систематический code-review швов booking↔waitlist↔email (класс багов из manual QA `4c0d1ab`).

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO SMS/PHONE OTP:** email-only (SMS — платный внешний сервис, табу Scope Knife); телефон остаётся контактным полем.
* ❌ **NO CAPTCHA/RECAPTCHA:** внешние виджеты + приватность-головная боль; honeypot + OTP хватает (OWASP-канон: CAPTCHA только на подозрительном трафике).
* ❌ **NO NEW FSM STATUSES:** верификация — НЕ статус брони; слот захватывается FSM только после подтверждения (никаких новых статусов в kernel 001/002).
* ❌ **NO ACCOUNTS:** клиенты остаются гостями; OTP верифицирует адрес, не создаёт аккаунт.
* ❌ **NO OPERATOR GATE:** OTP-гейт только на публичных эндпоинтах; Local API/OPERATOR-поверхности не трогаем (канон 002: оператор бронирует по телефону без email).

---

## 2. User Stories (Prioritized)

### US1 — Email OTP при бронировании (P0 — инвентарь)

`POST /api/booking` без `otp` → валидация (bookable/future/grid, intent создаётся только на future slot — иначе 422) → создание `BookingIntent` (email/service/resource/slot/name/phone, **codeHash = HMAC(code)** — plaintext-кода в БД нет, expiresAt = now+10m, attempts=0, статус `pending`) → отправка 6-значного кода на email → `202 { intentId }`. Клиент вводит код в той же форме → `POST /api/booking` с `intentId + otp` → **verify timing-safe + attempts ≤ 5 (6-й → intent `dead`, 403)** → FSM `CREATE_BOOKING` (FREE→CONFIRMED / PREPAID→HELD 15m, канон 003) → intent `consumed` (CAS) → 201 booking response (confirmation-редирект). Слот занят на этапе верификации? → честный 409 SLOT_TAKEN + intent `dead`. Статус-машина интента: `pending → consumed | dead | expired` (+`verified`-история для allowlist FR-706).

**Acceptance**: форма → 202 + письмо ≤ 15 c; код → 201 бронь; неверный код ×5 → intent `dead` (403); intent на прошедший слот → 422; повторный код (replay) → 403.

### US2 — Honeypot на публичных формах (P1)

Скрытые поля (CSS-hidden + `aria-hidden="true"` + `tabindex=-1` + `autocomplete="off"` — a11y-канон, audit M2) на booking-форме и waitlist-форме; заполнено → **silent 200** (не выдавая боту информации) + audit `honeypot.hit` на каждый reject.

**Acceptance**: бот с заполненным honeypot получает 200 и ноль эффектов; человек не видит поле; audit пишется.

### US3 — Waitlist double-opt-in (P0 — анти-релей)

`POST /api/waitlist` → статус **`pending`** + письмо «подтвердите подписку» (ссылка HMAC, TTL 48h) → подтверждение → `waiting` (вступает в матчинг). Матчинг фильтрует строго `status='waiting'` — `pending` не уведомляется никогда (анти-релей). Sweep: `pending` > 48h → `expired`.

**Acceptance**: join → pending, 0 писем-уведомлений до подтверждения; confirm → waiting → попадает в матчинг; pending > 48h → expired.

### US4 — Intent lifecycle (P1)

`BookingIntent`-sweep (в составе job-канона, крон 5m): expired >10m → `expired`; verified intents хранятся 30d (allowlist-источник FR-706) → purge; **live (pending) intents на один email ≤ 2 → 429 INTENT_CAP**.

**Acceptance**: sweep-матрица expired/purged; 3-й live intent на email → 429 INTENT_CAP.

### US5 — Repeat-client allowlist (P1)

Email с хотя бы одним `verifiedAt` в прошлом → пропуск OTP-фазы (бронь сразу 201). Спуфинг недоступен: allowlist = «владел почтой хотя бы раз».

**Acceptance**: повторная бронь того же email → 201 без OTP; новый email → 202 OTP-фаза.

### US6 — Code review швов (P1 — техническая спека)

Документированный ревью-проход швов booking↔waitlist↔intent↔email (класс manual-QA багов: function-props, маунты, роут-коллизии, relationship `_id` суффиксы) с фиксом находок и отчётом в `evidence/`.

**Acceptance**: отчёт с находками/фиксами в evidence; 0 регрессий 164+.

---

## 3. Edge Cases

- **OTP для прошедшего слота**: intent создаётся только на future slot — `start <= now` → 422.
- **Слот занят на момент верификации**: 409 SLOT_TAKEN + intent `dead` (не re-arm — клиент заново выбирает слот).
- **Resend недоступен**: intent создаётся, письмо не ушло → retry через job-канон; клиент жмёт «resend code» (лимит 3/10 мин).
- **5 неверных кодов**: intent → `dead`, пересоздание через новую фазу 1.
- **Repeat-client spoofing**: allowlist проверяет наличие верифицированного email в истории — подделка требует доступа к почтовому ящику.
- **Concurrent verify одного intent**: CAS `pending→consumed` — второй получает 409.
- **GDPR**: intents purge 30d; OTP-коды хранятся только как HMAC; письма — услуга/время, без лишнего.

## 4. Requirements

### Functional Requirements
- **FR-701 (BookingIntent)**: коллекция `booking-intents` (email, name, phone, serviceId, resourceId, slotStart/End, codeHash HMAC, expiresAt 10m, attempts, status pending|consumed|dead|expired); кап ≤2 live/email; создание только на future slot.
- **FR-702 (Two-phase booking)**: `POST /api/booking` фаза 1 (без otp) → 202 intent + OTP-письмо; фаза 2 (intentId+otp) → verify (timing-safe, ≤5 attempts → dead) → FSM CREATE_BOOKING → intent consumed → 201; занятый слот → 409 + dead.
- **FR-703 (Honeypot)**: скрытые поля на booking/waitlist формах; заполнено → silent 200 + audit `honeypot.hit`; a11y-атрибуты (aria-hidden, tabindex=-1).
- **FR-704 (Waitlist double-opt-in)**: join → `pending` + confirm-письмо (HMAC, TTL 48h) → `waiting`; матчинг строго `waiting`; sweep pending>48h → expired.
- **FR-705 (Intent lifecycle)**: sweep expired intents; allowlist-источник — verified intents 30d.
- **FR-706 (Repeat-client allowlist)**: email с verified-историей → skip OTP (конфиг-флаг, default on).
- **FR-707 (Seams code review)**: документированный ревью-проход швов + фиксы, отчёт в evidence.

### Non-Functional Requirements
- **NFR-701 (Regression)**: 164+ старых тестов зелёные; новые ≥15 (OTP-матрица, honeypot, double-opt-in, allowlist, brute-force guard, PII).
- **NFR-702 (No new deps)**: 0 — OTP/HMAC/шаблоны по канонам 003/005.
- **NFR-703 (Perf)**: intent create p95 < 30 ms; verify p95 < 50 ms (HMAC + advisory).
- **NFR-704 (PII)**: OTP только HMAC; письма без лишнего; intents purge 30d; дени-лист логов.

## 5. Success Criteria

- **SC-001**: brute-force guard — 5 неверных кодов → intent dead; перебор 1M комбинаций невозможен (attempts gate).
- **SC-002**: honeypot-бот → silent 200 + 0 эффектов; человек — не видит поле.
- **SC-003**: waitlist pending → 0 уведомлений до double-opt-in; confirm → матчинг.
- **SC-004**: repeat-client → 201 без OTP; новый email → 202 OTP-фаза; 164+ регрессия зелёная.

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: Канал верификации | **Email OTP** (6-значный, TTL 10m) | Ноль deps/денег; SMS — табу Scope Knife |
| Q2: Момент захвата слота | **После верификации** (intent → FSM) | Инвентарь календаря не отравляется unverified-бронями |
| Q3: Waitlist | **Double-opt-in** (pending → waiting) | Анти-релей Resend + GDPR-согласие |
| Q4: Repeat-client | **Allowlist по verified-истории** | Конверсия-first для настоящих клиентов |
| Q5: CAPTCHA | **Нет** (honeypot + OTP) | OWASP: CAPTCHA только на подозрительном трафике |

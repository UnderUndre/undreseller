# Requirements (map): undreseller on Payload — v3.1.0

**Date**: 2026-11-18 · Полные FR-спецификации живут в спеках фич (`specs/<slug>/spec.md`); этот документ — карта фундамента и канонов, актуализированная под as-built 001–010 + 012–013 (011 frozen).

## 1. Реализованные FR-группы

### 001-reinit (as-built)
- **FR-101 Baseline**: build/lint/int зелёные, evidence-фиксация (e2e — owner-run с Stripe test keys).
- **FR-102 Governance**: SpecKit-контур (constitution v1.10.1 app-adapted, snapshot-stage, specs/main v2).
- **FR-103 Port map**: 11 доменов легаси → класс/целевая спека/риск.
- **FR-104 Roles**: OWNER/OPERATOR/PERFORMER/customer (set, max-иерархия `hasMinimumRole`), /admin OWNER-only, first-user→OWNER, тотальный sweep `'admin'`.
- **FR-105 FSM kernel**: pure-порт 1:1 (two-track, hold TTL 15m, freeze 24h) + 002/003-remediation: CONFIRMED + CUSTOMER_CANCEL → AVAILABLE; PREPAID: HELD → PAYMENT_PENDING → CONFIRMED / UNDERPAID (staff resolution, БЕЗ auto-confirm).
- **FR-107 Payments invariants**: pure minor-units + provider-aware, полиморфизм `Order.amount`/`totalMinor`.
- **FR-108 QA baseline**: изолированная `undreseller_test` (delete-then-load, dotenv@8 без override), `fileParallelism: false`, error-shape snapshots.

### 002-booking-domain (as-built, accepted)
- **FR-201 Bootstrap**: `OWNER_BOOTSTRAP_TOKEN` fail-closed (пустая БД → 403 без токена; takeover=0; advisory-lock против гонки).
- **FR-202 GiST EXCLUDE**: `(resource_id, tstzrange) WHERE active` + 23P01/23505→409 + B-tree `(resource_id, start_time)` + partial-unique idempotency_key — raw-SQL Expand-миграция + down.
- **FR-203 Advisory lock**: блокирующий `pg_advisory_xact_lock(hashtext(...))` c 5s timeout в транзакции бронирования.
- **FR-204 Catalog+hours**: Product `bookable`/`durationMin`/buffers (буферы строго внутри рабочих часов), `WeeklyHours`, `AvailabilityExceptions`, глобал `ShopSettings` (timeZone, quantumMin).
- **FR-205 Availability**: pure `computeSlots` + resolver + `GET /api/availability`; p95 < 50 ms (B-tree).
- **FR-206 Booking**: atomic SlotReservation+Order+AuditEvent, FSM через pure-kernel; доменный сервис — единственный status-writer.
- **FR-207 Rate limit**: fixed-window на IP+route, 429+Retry-After, bounded registry, fail-closed на null-IP.
- **FR-208 Approvals**: OPERATOR+ GET/POST (approve→BOOKED / reject→RELEASED), CAS `scheduleVersion`, 403 прочим.
- **FR-210 AuditEvents**: append-only, composite index, PII-redact metadata.

### 003-no-show-protection (as-built)
- Stripe webhooks: CAS rowCount+re-read, deterministic refund idempotencyKey, charge.refunded amount-сверка (partial ≠ full), PaymentEvents журнал.
- PREPAID FSM-трек: HELD (TTL 15m) → PAYMENT_PENDING → CONFIRMED / UNDERPAID; hold-sweep 1m → RELEASED + waitlist notify.
- Reminders: reminder-sweep 5m, CAS `reminderSentAt` (exactly-once), Resend-канал (own fetch-адаптер, БЕЗ SDK).
- Refund policy: `cancellationCutoffHours` (default 3), cutoff strictly-exclusive; cancel/reschedule токены (дайджесты в БД).
- Migration: `order_enum_values` + order-статусы гейтвея.

### 004-telegram-bots (as-built)
- Dual bots (staff pager + client), OPTIONAL: нет токенов → no-op деградация.
- Durable `TelegramOutbox`: единственный исходящий путь; claim CTE `FOR UPDATE SKIP LOCKED`, lease, 429 cooldown (`availableAt`), priority, status queued→sent|failed|dead.
- Staff authz: card↔chat binding через outbox (`sent_message_id AND to_chat_id`) + allow-list (`ShopSettings.staffChatIds` → env `TELEGRAM_STAFF_CHAT_IDS`), 5 CAS-действий, two-press barrier.
- `InboxEvent` exactly-once гейт; webhook secrets per-bot (timing-safe, fail-closed); `TgLink` unique [chatId+orderId]; Blacklist fail-closed (chatId ИЛИ phone).
- GDPR: redaction доставленных карточек + purge-политики.

### 005-google-calendar-sync → Calendar Feed (as-built, rev 2.1)
- ICS push: `GET+HEAD /api/calendar/feed/[resourceId]` — RFC 5545 (fold >75 octets UTF-8 safe, CRLF), mapStatus CONFIRMED/TENTATIVE/CANCELLED, ETag/304.
- Токен фида: versioned HMAC `calendar-feed:v<version>:<resourceId>`; ротация `feedTokenVersion++` через OWNER-роут `/api/admin/calendar-feed/[resourceId]`.
- RL 30/60s per resource+IP (анти-бан краулеров Google/Apple).
- **GC two-way sync — FROZEN** (до L1-запроса рынка).

### 006-waitlist-autofill (as-built)
- Join с double-opt-in (opt-in email TTL 48h), honeypot; campaignCount cap 3.
- 6 точек RELEASED → `notifySlotFreed` → `waitlist-match` (событийный) → notified-статус с биндингом слота.
- Claim FSM: HMAC-токен bind entryId+campaignCount+slotStart; серверный idempotencyKey `waitlist-claim-<entryId>-<campaign>-<slot>`; 409 auto-advance guard.
- Unsubscribe (HMAC DELETE) + waitlist-sweep 5m (TTL/expiry).

### 007-booking-trust-gate (as-built)
- `BookingIntents` (non-FSM: pending|consumed|dead|expired): create/update закрыты, write только raw-SQL сервиса; гидратация фазы 2 строго из БД.
- OTP: 6-значный crypto RNG, TTL 10 мин, ≤5 попыток → dead; HMAC keyed на PAYLOAD_SECRET; resend на существующий интент.
- Trust-cookie: HMAC `client_trust_token`, TTL 90d, HttpOnly+Secure+Lax, grid-валидация → fast path мимо OTP.
- Honeypot `companyWebsite`: silent 200 + audit `honeypot.hit`.
- Серверный idempotencyKey HMAC(email+product+start), клиентский игнорируется; email-guard на поиск; композитный rate-limit IP+email; CAS intent→consumed ПОСЛЕ createBooking.

### 008-audit-hardening (as-built)
- Полная доменная миграция `complete_domain_schema` (12 таблиц, 13 типов, 48 индексов) + fresh-migrate verification.
- Webhook CAS rowCount+re-read; refund deterministic idempotency; staff authz переписана (удалена тавтология L3).
- Серверные idempotencyKey для cancel/claim; accessToken не логируется; structured logger.
- CSP: статический RSC-compatible (`script-src 'self' 'unsafe-eval' 'unsafe-inline'` — сознательно, 008 F5) + X-Frame-Options/XCTO/Referrer-Policy/HSTS; `poweredByHeader` off; GraphQL disabled в prod.
- `clientIpFrom` fail-closed (cf-connecting-ip → XFF последний не-loopback hop → x-real-ip → null в prod); `assertSingleInstance` (REPLICA_COUNT≠1 → throw) из `instrumentation.ts`.
- `gdprPurge` nightly 3am: tg-links >90d terminal, outbox text/meta >30d, intents dead/expired 30d / consumed 90d (customer anonymization).
- Loopback postgres + fail-closed password (SEC-B-01); availability RL 60/60s + slotCache.

### 009-ux-hygiene (as-built, light format)
- 13 фиксов FR-BK backlog (F-UX-07..20 + F-BE-13/14): retry на network error, min-date reschedule, контрасты, hit-zones, reduced-motion, noscript fallback, template remnants.
- F-BE-14: `resolveAvailability` grid-валидация в `rescheduleBooking` (item_id из SELECT, grid !ok → skip legacy).
- `DATABASE_URL` fail-closed; staff-alert пустой chatId → skip.

### 010-i18n (as-built, light format)
- next-intl 4.15: middleware locale detect (cookie → Accept-Language → ru), `localePrefix: 'always'`, `[locale]` app-сегмент, `NextIntlClientProvider` в layout.
- Словари `src/i18n/locales/{ru,en}.json`; SlotGrid/BookingFormOTP/WaitlistJoinForm переведены; `LocalTime` locale-aware.

### 012-deposit-telegram (as-built, light format)
- Product `paymentMode` enum NONE|FULL_PREPAYMENT|DEPOSIT + `depositAmount` (validate >0 и ≤ priceInUSD).
- bookingService: DEPOSIT — charge только депозита, FSM PREPAID-трек; auto-refund + staff-refund депозита (`refundService`).
- Stripe Elements `DepositPayment` на confirmation; botManager поддерживает `TELEGRAM_*_BOT_TOKEN` env naming.
- Migration `deposit_payment_mode` (enum).

### 013-local-ai-triage (as-built)
- `customerNotes` (`0..2000` chars) на `SlotReservations` + `BookingIntents` (007 DB-гидратация) + `SlotGrid.tsx` (`ru/en` i18n); `hasNotes` в `enqueueStaffCard`.
- `src/lib/ai/*`: чистый PII-санитайзер (`sanitizeForLlm`, маски `[PHONE]`/`[EMAIL]`/`[ID]`, XML escape), строгий парсер `parseTriageExtraction` + детерминированный `routeTriageDecision` (5 условий → `DELEGATE_OPERATOR` vs `ESCALATE_OWNER`), zero-deps LM Studio `fetch` клиент с SSRF-гвардом (`redirect: 'error'`, `REMOTE_LLM_FORBIDDEN`).
- Async Payload Job `ai-triage` (`retries: 0`, `deleteJobOnComplete: true`, atomic CAS claim + post-cancel guard); `GET /api/approvals` (OPERATOR+) выдаёт `aiTriage`; `gdprPurge` обнуляет `customer_notes` / `ai_triage_json` > 90d.
- Live eval suite (`tests/eval/triage-dataset.json`, 26 кейсов, `pnpm eval:ai`); Expand-only миграция `20261118_000001_local_ai_triage`.

### 011-multitenant — ❄️ FROZEN
- Только `design.md` (tenant-per-database Approach A для ≤5 клиентов / shared DB Approach B для масштаба); кода нет.

## 2. Технологические каноны (бизнес-план §2.5)

- Payload 3.93.0 / Next 16.4.1 (security hotfix) / React 19.2.9 (security hotfix) / TS 5.7.2 — pinned (NFR-104).
- next-intl 4.15 (ru/en, default ru) · grammY 1.46 (dual bots) · Stripe 18.5 (+ @stripe/react-stripe-js v3) · Tailwind 4.
- PostgreSQL 16 через `@payloadcms/db-postgres`; GiST EXCLUDE + `pg_advisory_xact_lock` — обязательная double-booking броня.
- Payload auth + access control; роли — set + max-иерархия.
- Email: Resend **БЕЗ SDK** — собственный fetch-адаптер (`src/lib/email/resendAdapter.ts`, 10s timeout, lazy RESEND_API_KEY, from: RESEND_FROM_EMAIL → ShopSettings.fromEmail).
- Провайдер-нейтральные платежи: PaymentGateway-интерфейс (`src/lib/payments/stripeGateway.ts`); minor units — канон; инварианты — `src/lib/payments/invariants.ts`. Stars/NOWPayments — адаптеры не писаны (roadmap).
- Telegram: все исходящие — через durable TelegramOutbox (прямых sendMessage из роутов нет).
- Docker Memory Fencing: app ≤500 MB (doc-block).
- Планировщик: **Payload Jobs** — 9 tasks (`schedule` per-task + autoRun */30s default queue); Inngest отвергнут (внешний сервис против white-label автономности).
- Все HMAC/OTP/токены keyed на `PAYLOAD_SECRET` (отдельного секрета нет — сознательно).

## 3. НФ-инварианты

- **Fail-closed** на секретах и доступах: `PAYLOAD_SECRET`, `DATABASE_URL`, bootstrap token, webhook secrets, null-IP rate limit, `REPLICA_COUNT≠1` (assertSingleInstance), Blacklist; коллекции default-deny (adminOnly), `status` брони — field-level no-write, BookingIntents/WaitlistEntries — raw-SQL write.
- **Токены-дайджесты**: raw cancel/reschedule/claim токены в БД не хранятся (sha256/HMAC дайджесты); scanner-safe GET не потребляет one-time токены.
- Тест-изоляция: int-тесты никогда не трогают dev-БД (`test.env` delete-then-load — dotenv@8 не умеет override).
- Чистые вычисления: FSM/availability/invariants/amounts — pure-модули с БД-фетчерами отдельно (урок легаси).
- **GDPR-контур**: nightly gdprPurge + Telegram redaction + EmailDeliveryLog recipientHash + AuditEvents PII-redact append-only.
- Регрессия: `pnpm validate && pnpm lint && pnpm test:int && pnpm build` перед done; **232 int-теста / 22 сьюта** — текущая база (+ e2e: admin / booking two-phase OTP / frontend composite).

# Architecture (as-built): undreseller on Payload — v3.1.0

**Date**: 2026-11-18 · **Lineage**: 001-reinit (legacy v1.x architecture archived in `repos/undreseller-legacy/specs/main/`)
**Фундамент**: официальный Payload Ecommerce Template — pinned: payload 3.93.0 / Next 16.4.1 (GHSA-673q-mjm6-r5xr) / React 19.2.9 (GHSA-xqc2-xf4c-x3h3) / PG16 / Stripe 18.5 / grammY 1.46 / next-intl 4.15.

## 1. Topography

```text
undreseller/
├── src/
│   ├── payload.config.ts        # 17 коллекций + 3 globals; db-postgres (DATABASE_URL fail-closed);
│   │                            # jobs: 9 tasks (autoRun */30s, default queue, limit 25);
│   │                            # endpoints: []; GraphQL disabled в production
│   ├── collections/             # Template: Users (+roles/bootstrap), Pages, Categories, Media
│   │   ├── Products/            # ecommerce override; Booking-вкладка: bookable, durationMin (≥5),
│   │   │                        #   bufferBefore/AfterMin, outCallEnabled, paymentMode
│   │   │                        #   NONE|FULL_PREPAYMENT|DEPOSIT, depositAmount, cancellationCutoffHours
│   │   ├── BookingIntents.ts    # 007 trust gate: HMAC codeHash, attempts ≥5 → dead, TTL,
│   │   │                        #   status pending|consumed|dead|expired (write только raw-SQL сервиса)
│   │   ├── SlotReservations.ts  # FSM-статус (field-access закрыт), scheduleVersion (CAS),
│   │   │                        #   idempotencyKey unique, cancel/reschedule token-hash (дайджесты),
│   │   │                        #   reminderSentAt (CAS exactly-once)
│   │   ├── WaitlistEntries.ts   # 006: double-opt-in, campaignCount cap 3, claim-bind поля
│   │   ├── TelegramOutbox.ts    # 004: durable outbox queued|sending|sent|failed|dead, lease, priority
│   │   ├── TgLink.ts            # chatId↔order, unique [chatId+orderId]
│   │   ├── Blacklist.ts         # chatId и/или phone + reason (fail-closed)
│   │   ├── InboxEvent.ts        # exactly-once гейт webhook-гейтвеев (provider+providerRef unique)
│   │   ├── PaymentEvents.ts     # платёжный журнал (payloadJson hidden)
│   │   ├── EmailDeliveryLog.ts  # confirmation|reminder|waitlist|intent|waitlist-optin
│   │   ├── AuditEvents.ts       # append-only (create/update/delete: false), PII-redact metadata
│   │   └── Resources/WeeklyHours/AvailabilityExceptions   # availability-домен 002
│   │                            #   (+Resources.feedTokenVersion — ротация фида 005)
│   ├── access/                  # roles.ts (OWNER>OPERATOR>PERFORMER>customer, max-rank) + adminOnly
│   │   └── bootstrapToken.ts    # timing-safe X-Bootstrap-Token, fail-closed (002)
│   ├── globals/ShopSettings.ts  # timeZone, quantumMin, fromEmail, staffChatIds/ownerChatIds (PII, OWNER-only),
│   │                            #   aiTriageEnabled, aiDelegationLimit/Currency, aiMinConfidence
│   ├── lib/
│   │   ├── kernel/              # bookingFsm.ts (pure two-track FSM) + reservationStatus.ts (SSOT enum)
│   │   ├── booking/             # bookingService.ts — ЕДИНСТВЕННЫЙ status-writer (create/cancel/
│   │   │                        #   approve/applyGatewayEvent/reschedule/acknowledge/tokens);
│   │   │                        #   intentService.ts (OTP-фаза 007), tokens.ts (sha256+HMAC),
│   │   │                        #   otp.ts, trustCookie.ts, cancelValidation.ts, refundService.ts
│   │   ├── availability/        # computeSlots.ts (PURE) + resolver.ts (ACTIVE_STATUSES)
│   │   │                        #   + slotCache.ts (TTL 20s, max 1000) + tz.ts (DST-safe)
│   │   ├── payments/            # invariants.ts (minor units) + amounts.ts (cutoff strictly-exclusive)
│   │   │                        #   + stripeGateway.ts (lazy, PaymentGateway-интерфейс)
│   │   │                        #   + webhookHandlers.ts
│   │   ├── telegram/            # botManager (lazy grammY, optional), outbox (CTE SKIP LOCKED),
│   │   │                        #   staffBot (pager, 5 CAS-действий) + staffCard, clientBot (ack/dec),
│   │   │                        #   staffAuth (allow-list), security (webhook secret), blacklist,
│   │   │                        #   redaction (GDPR-редакция доставленных карточек)
│   │   ├── waitlist/            # waitlistService (join/notify/match/claim/unsubscribe) + claimToken.ts
│   │   ├── calendar/            # feedToken.ts (versioned HMAC) + ics.ts (RFC 5545)
│   │   ├── email/               # resendAdapter.ts (fetch REST, БЕЗ SDK) + templates.ts
│   │   ├── ai/                  # 013: sanitizePii.ts + triagePolicy.ts (PURE) + localLlmClient.ts (LM Studio fetch + SSRF guard)
│   │   └── security/            # rateLimiter.ts (fixed window, fail-closed; clientIpFrom;
│   │                            #   assertSingleInstance) + honeypot.ts
│   ├── plugins/index.ts         # ecommerce (orders accessToken) + seo + form-builder
│   │                            #   + stripeWebhookHandlers (SDK-verify)
│   ├── jobs/                    # holdSweep 1m · bookingEmail (retries 5) · reminderSweep 5m (CAS) ·
│   │                            #   outboxDispatch 30s (batch 25) · gdprPurge 3am ·
│   │                            #   waitlistMatch (событийный) + waitlistSweep 5m · intentSweep 5m ·
│   │                            #   aiTriage (013, retries 0, deleteJobOnComplete)
│   ├── i18n/                    # next-intl: ru/en (default ru), словари locales/*.json
│   ├── middleware.ts            # locale detect (cookie → Accept-Language → ru); security headers — в next.config
│   ├── instrumentation.ts       # assertSingleInstance (REPLICA_COUNT≠1 → throw)
│   ├── app/[locale]/            # storefront: /shop /book /book/[slug] /book/confirmation/[id] /
│   │                            #   checkout (+confirm-order) /orders /account /find-order /
│   │                            #   book/waitlist-{claim,confirm,unsubscribe} /
│   │                            #   booking/{cancel,reschedule,acknowledge}
│   ├── app/api/                 # availability · booking (+[id]/cancel|reschedule, acknowledge, resend) ·
│   │                            #   approvals · staff/refunds/[id] · admin/calendar-feed/[resourceId] ·
│   │                            #   calendar/feed/[resourceId] · waitlist (+claim/confirm/unsubscribe) ·
│   │                            #   telegram/{staff,client}/webhook
│   └── app/(payload)/           # Payload admin (OWNER-only)
├── src/migrations/              # 5 миграций: booking_gist (base+GiST+btree_gist) ·
│                                #   order_enum_values (003) · complete_domain_schema (12 таблиц, 008) ·
│                                #   deposit_payment_mode (enum, 012) · local_ai_triage (Expand-only, 013)
├── tests/
│   ├── int/                     # 21 сьют / 212 тестов: booking-fsm 43, trust-gate 22,
│   │                            #   payments-invariants 13, calendar-feed 11, booking-service 12,
│   │                            #   availability 11, waitlist 11, prepaid-booking 10, booking-route 10,
│   │                            #   local-ai-triage 10, telegram-client 6 + telegram-outbox 7, ...
│   ├── eval/                    # triage-dataset.json (26 кейсов) + scripts/eval-local-llm.ts (pnpm eval:ai)
│   ├── e2e/                     # playwright: admin · booking (two-phase OTP + slot race 409) · frontend
│   └── helpers/                 # seedUser.ts (explicit OWNER), tests/int/helpers/reset003.ts
├── specs/                       # 001–010 + 012–013 implemented · 011 frozen (design.md) · qa/manual-qa
└── docker-compose.yml           # Postgres 16 (fencing 4096/2048M) + app-сервис doc-block ≤500 MB
```

## 2. Data flow (as-built 001–013)

### Booking (двухфазный trust gate — 007; FREE track)
```text
/book → GET /api/availability?service&date      # RL 60/60s → slotCache (TTL 20s) → pure computeSlots
POST /api/booking (фаза 1) {product, start, customer, honeypot?}
       │  honeypot `companyWebsite` → silent 200 + audit
       │  rate-limit 10/60s, композит IP+email (intentService)
       │  → createIntent (HMAC codeHash, TTL) + OTP email → 202
       │  [валидный trust-cookie (HMAC, TTL 90d, grid-валидация) → fast path мимо OTP]
POST /api/booking (фаза 2) {intentId, otp}
       │  verifyIntentBooking: ≤5 попыток → dead; blacklist fail-closed
       │  drizzle.transaction:
       │    pg_advisory_xact_lock(resource)         # L1 сериализация
       │    re-check overlap (±buffers)
       │    transitionBookingFsm(AVAILABLE, CREATE_BOOKING)   # pure FSM
       │    INSERT SlotReservation + Order + AuditEvent; CAS intent → consumed → 201
       │    [GiST EXCLUDE = L2 backstop → 23505/23P01 → 409]
       ▼
GET /book/confirmation/[id]?accessToken&cancelToken
```

### PREPAID / DEPOSIT track (003 + 012)
```text
paymentMode FULL_PREPAYMENT|DEPOSIT → FSM AVAILABLE → HELD (TTL 15m) → PAYMENT_PENDING
       → POST /api/payments/stripe/initiate (DEPOSIT — charge только depositAmount)
       → Stripe webhook (SDK-verify, InboxEvent exactly-once) → applyGatewayEvent:
           settled → CONFIRMED · partially_paid → UNDERPAID (staff resolution, БЕЗ auto-confirm)
       → hold-sweep (1m): expired HOLD → RELEASED + notifySlotFreed (waitlist)
       → reminder-sweep (5m): CAS reminderSentAt, Resend-канал
```

### OUT_CALL (требует approval)
```text
POST /api/booking → FSM AVAILABLE → PENDING_APPROVAL
GET /api/approvals (OPERATOR+) → POST approve → FSM STAFF_APPROVE → CONFIRMED/BOOKED (CAS scheduleVersion)
                              → POST reject  → FSM STAFF_REJECT → RELEASED (+ waitlist notify)
Клиентский ack: POST /api/booking/acknowledge · TG-callbacks c:(ack|dec):orderId (cooldown 24h)
```

### Waitlist (006)
```text
6 точек RELEASED → notifySlotFreed → waitlist-match (событийный) → opt-in email (TTL 48h)
POST /api/waitlist/[entryId]/confirm → claim (HMAC bind entryId+campaignCount+slotStart)
       → createBooking с серверным idempotencyKey waitlist-claim-<entryId>-<campaign>-<slot>
DELETE /api/waitlist/[entryId]?token= → unsubscribe (HMAC) · waitlist-sweep 5m (TTL/cap)
```

### Telegram (004)
```text
Оба бота → POST /api/telegram/{staff,client}/webhook (secret timing-safe, fail-closed)
       → InboxEvent exactly-once → staff pager (карточки, 5 CAS-действий, two-press barrier)
Исходящие — ТОЛЬКО через TelegramOutbox → outbox-dispatch (30s, batch 25,
       CTE FOR UPDATE SKIP LOCKED, lease, 429 cooldown availableAt)
GDPR: redaction редактирует доставленные карточки; gdpr-purge чистит outbox (30d) / tg-links (90d)
Боты OPTIONAL: нет токенов → no-op деградация (botManager lazy)
```

### Calendar Feed (005, rev 2.1 — ICS push)
```text
GET+HEAD /api/calendar/feed/[resourceId]?token=   # HMAC calendar-feed:v<version>:<resourceId>
       # ICS RFC 5545 (fold >75 octets, CRLF), mapStatus CONFIRMED/TENTATIVE/CANCELLED,
       # ETag/304, RL 30/60s per resource+IP
GET/POST /api/admin/calendar-feed/[resourceId] (OWNER)  # URL / ротация feedTokenVersion++
```

### Local AI Triage (013 — LM Studio на GPU хоста)
```text
POST /api/booking {..., customerNotes?} (≤2000 chars; 007 phase 1→2 DB-гидратация)
       → createBooking (после успешного PaymentIntent): ai_triage_status = 'pending' + queue('ai-triage')
       → aiTriageTask (retries: 0, deleteJobOnComplete: true):
           CAS claim pending → processing (WHERE status IN ('HELD','BOOKED','PENDING_APPROVAL'))
           sanitizeForLlm (EMAIL → IBAN → PHONE → ID + XML escape <customer_note>)
           POST ${LOCAL_LLM_BASE_URL}/chat/completions (redirect: 'error', SSRF guard, timeout 60s, reasoning_effort: 'none')
           parseTriageExtraction (strict null on bound violation, max 1 retry temp=0)
           routeTriageDecision (5 условий: ≤ aiDelegationLimit, exact currency, urgency≠high, conf≥minConfidence)
           → UPDATE ai_triage_status='done', ai_triage_json (если бронь не RELEASED) + AuditEvent (0 PII)
           → TelegramOutbox follow-up (priority 40): ownerChatIds (ESCALATE_OWNER) | staffChatTargets (DELEGATE_OPERATOR)
           [LM Studio offline / timeout / bad JSON → fail-open ai_triage_status='failed' + manual review alert]
```

### Checkout (шаблонные продукты)
`POST /api/payments/stripe/initiate` (PaymentIntent + transaction) → Elements → `confirm-order` (settlement-валидация + атомарный инвентарь) → Order по `accessToken` для гостей. Webhook `POST /api/payments/stripe/webhooks` (SDK-verify) → `stripeWebhookHandlers` + PaymentEvents журнал.

## 3. AuthN/AuthZ

- Payload JWT-cookie (14d, tokenExpiration 1209600), `Users.roles` = hasMany set; решения по max-иерархии `hasMinimumRole(roles, min)` (`src/access/roles.ts`).
- `/admin` и все adminOnly-поверхности — только OWNER; OPERATOR/PERFORMER — app-API (approvals, staff/refunds).
- **Bootstrap**: пустой инстанс → `Users.create` требует `X-Bootstrap-Token` (timing-safe vs `OWNER_BOOTSTRAP_TOKEN`, fail-closed); после первого OWNER публичная регистрация открыта (только `customer`). Takeover-окно = 0.
- **Telegram staff authz**: L1 `ShopSettings.staffChatIds` → L2 env `TELEGRAM_STAFF_CHAT_IDS`; привязка card↔chat через outbox (`sent_message_id AND to_chat_id`); Blacklist fail-closed по chatId ИЛИ phone.
- **Write-барьеры**: `status` SlotReservations — field-level no-write; BookingIntents/WaitlistEntries — create/update `false` (write только raw-SQL доменных сервисов); AuditEvents — append-only.
- **Токены**: cancel — sha256; reschedule/otp/waitlist-claim/unsubscribe/feed — HMAC-SHA256(PAYLOAD_SECRET); в БД только дайджесты; scanner-safe GET (`/cancel`, `/reschedule`) валидирует БЕЗ потребления one-time токенов.

## 4. Double-booking defense + идемпотентность

1. **L1** `pg_advisory_xact_lock(hashtext('resource_slot_lock_'||resourceId))` в транзакциях bookingService (create/approve/reschedule/claim).
2. **L2** GiST EXCLUDE-констрейнт `(resource_id WITH =, tstzrange(start,end) WITH &&) WHERE status IN (active)` — 23P01/23505 → 409.
3. **Идемпотентность**: клиентский `idempotencyKey` unique + 23505-возврат существующего; серверные ключи — `cancel-<orderId>`, `client-cancel-…`, `waitlist-claim-…`; email-guard в `findBookingByIdempotencyKey`.
Плюс B-tree `(resource_id, start_time)` (p95 < 50 ms) и partial-unique `idempotency_key`. `slotCache` (TTL 20s) — только разгрузка availability, не источник истины.
Миграции: `src/migrations/` (Expand-only, down.sql дропает только новое).

## 5. Extension surfaces

| Поверхность | Спека | Статус | Механика |
| --- | --- | --- | --- |
| No-Show Protection (deposits/reminders/refunds) | 003 | ✅ | Stripe webhooks CAS + Payload Jobs + Resend (own adapter) |
| Telegram bots (staff pager, client, outbox) | 004 | ✅ | grammY + durable outbox (CTE SKIP LOCKED) |
| Calendar Feed (ICS push) | 005 | ✅ | versioned HMAC token + RFC 5545 feed; GC two-way **FROZEN** |
| Waitlist autofill | 006 | ✅ | double-opt-in + claim FSM + sweep |
| Booking trust gate | 007 | ✅ | OTP HMAC + trust-cookie + honeypot |
| Audit hardening | 008 | ✅ | CSP, серверные idempotency, staff authz rewrite, GDPR purge |
| UX hygiene | 009 | ✅ | 13+ фиксов FR-BK + reschedule grid-валидация |
| i18n | 010 | ✅ | next-intl ru/en, `[locale]`-сегмент |
| Multitenant | 011 | ❄️ frozen | design.md: tenant-per-database (A) / shared DB (B) |
| Deposit flow | 012 | ✅ | paymentMode DEPOSIT + DepositPayment (Stripe Elements) |
| Local AI Triage (LM Studio) | 013 | ✅ | async Payload Job + PII sanitizer + LM Studio fetch + deterministic delegation |
| Composite Booking (cart-in-slot) | 014 | ✅ | `items[]` слот-контейнер (Option 0): `compositeService.deriveComposite` (PURE), `Product.addOn`, `items_json` snapshot ×2, money-канон `orders.amount` = списываемая (0/Σdeposit/Σprice) + `totalPriceMinor` производная, composite grid через `computeSlots` override, OTP-гидратация из `items_json` + drift → intent dead |
| Stars / NOWPayments | — | roadmap | PaymentGateway-интерфейс готов (`stripeGateway.ts`), адаптеры не писаны |

## 6. Governance

- Constitution: `.specify/memory/constitution.md` v1.10.1 (app-repo adaptation: pnpm/vitest/playwright; clai-helpers/publish gates N/A).
- Quality gates: `pnpm validate` · `pnpm lint` · `pnpm test:int` (232) · `pnpm build` · `pnpm generate:types` drift-free · `pnpm audit` 0 H/C · log-hygiene (PCI DSS Req 10).
- Deploy: Docker image из тегированных коммитов на VPS заказчика; app ≤500 MB RAM (NFR-103); миграции — `payload migrate`; single-instance (`REPLICA_COUNT=1` enforced на буте).
- Deployment runbook (bootstrap владельца до ingress): §4.1.

## 7. Feature Reference (as-built)

| Feature | Статус | Ключевые артефакты |
| --- | --- | --- |
| 001-reinit | ✅ implemented (rev 1.3) | фундамент, governance, FSM-kernel, invariants, roles |
| 002-booking-domain | ✅ accepted (rev 1.2) | bookingService, availability, GiST, approvals, /book UI |
| 003-no-show-protection | ✅ implemented | webhooks CAS, PREPAID track, reminders, refunds |
| 004-telegram-bots | ✅ implemented | dual bots, outbox, staff authz, blacklist, redaction |
| 005-google-calendar-sync | ✅ implemented (rev 2.1) | ICS Calendar Feed; GC two-way FROZEN |
| 006-waitlist-autofill | ✅ implemented | join/opt-in/match/claim FSM, sweeps |
| 007-booking-trust-gate | ✅ implemented | BookingIntents, OTP, trust-cookie, honeypot |
| 008-audit-hardening | ✅ implemented | доменная миграция, CSP, GDPR purge, idempotency |
| 009-ux-hygiene | ✅ implemented | FR-BK backlog fixes, reschedule grid |
| 010-i18n | ✅ implemented | next-intl, [locale], ru/en словари |
| 011-multitenant | ❄️ frozen | design.md (подход A/B), кода нет |
| 012-deposit-telegram | ✅ implemented | deposit flow, DepositPayment, bot token env |
| 013-local-ai-triage | ✅ implemented | `src/lib/ai/*`, `src/jobs/aiTriage.ts`, `tests/eval/` (LM Studio на GPU хоста) |
| 014-composite-booking | ✅ implemented | `src/lib/booking/compositeService.ts` (PURE derive) + bookingService/intentService/resolver/route deltas + `Product.addOn` + миграция `20261118_000002_composite_booking` (twin-column `_products_v.version_add_on`) + itemized staffCard/email/confirmation + `tests/int/composite-booking.int.spec.ts` (232/232 int) |
| 015-e2e-regression-suite | ✅ implemented | `E2E_GATEWAY=fake` (`stripeGateway.ts` + `DepositPayment.tsx`), `playwright.config.ts` (`baseURL` + `workers: 1`), `tests/helpers/seed-booking.ts` (XFF TEST-NET-3, unique future dates, targeted cleanup), UI fixes (SlotGrid items loop, confirmation reservationId lookup, `/book` addOn filter, `[slug]` slug query, composite `ReschedulePicker`), 5 e2e suites (composite/money/tokens/trust/waitlist-admin-i18n) |
| Легаси 001–007 (v1.x) | archived (`../undreseller-legacy`) | port-map: `specs/001-.../legacy-port-map.md` |

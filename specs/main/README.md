# 📚 undreseller — Documentation Hub

**Repository**: `UnderUndre/undreseller`
**Version**: v3.1.0 (as-built 001–010 + 012–013 implemented; 011-multitenant frozen as design doc)
**Product**: Sprint B (HERO) — white-label booking & commerce engine ($4,900 flat, 14 дней)
**Methodology**: Diátaxis Framework
**Compliance**: ISO/IEC/IEEE 29148:2018 · ISO/IEC/IEEE 12207:2017 · NIST SP 800-218 SSDF

---

## 🧭 Навигационная карта (Diátaxis Matrix)

```text
                       ПРАКТИКА                         ТЕОРИЯ
            ┌──────────────────────────────┬──────────────────────────────┐
            │ 1. TUTORIALS (Обучение)      │ 4. EXPLANATION (Концепции)   │
            │                              │                              │
ДЕЙСТВИЕ    │ • Быстрый старт (корневой    │ • Архитектура as-built v3.1  │
            │   README.ru.md §Быстрый старт) │   specs/main/architecture.md │
            │ • Bootstrap владельца        │ • Booking FSM (two-track)    │
            │   (runbook §4.1)             │   + trust gate (007) + AI    │
            ├──────────────────────────────┼──────────────────────────────┤
            │ 2. HOW-TO GUIDES (Ранбуки)   │ 3. REFERENCE (Справочники)   │
            │                              │                              │
ЗНАНИЕ      │ • Деплой на VPS + migrate    │ • Requirements map v3.1      │
            │ • Webhooks Stripe / TG-боты  │   specs/main/requirements.md │
            │ • Calendar Feed / LM Studio  │ • Коллекции и API-роуты      │
            │ • GDPR purge / ручной QA     │ • Access-матрица ролей       │
            └──────────────────────────────┴──────────────────────────────┘
```

---

## 1. Tutorials
- **Быстрый старт**: корневой [`README.ru.md`](../../README.ru.md) §Быстрый старт ([`README.md`](../../README.md) §Quick start) — `.env` → install → Postgres → dev → первый OWNER.
- **Bootstrap владельца**: [`architecture.md` §4.1](architecture.md) — регистрация OWNER до открытия ingress (fail-closed `OWNER_BOOTSTRAP_TOKEN`).
- **Тесты**: `pnpm test:int` (21 сьют / 212 тестов, изолированная `undreseller_test`); bootstrap-команда в шапке `test.env`; живой AI-бенчмарк: `pnpm eval:ai` (26 кейсов против LM Studio).

## 2. How-To Guides (эксплуатация)
- **Deploy на VPS заказчика**: docker image из тегированных коммитов; app ≤500 MB Memory Fencing; `payload migrate` на релизе (5 миграций, Expand-only + down).
- **Регистрация webhook'ов Stripe**: `pnpm stripe-webhooks` (dev) / dashboard (prod) — хендлеры live: initiate / confirm-order / webhooks (SDK-verify).
- **Telegram-боты**: env `STAFF_BOT_TOKEN`/`CLIENT_BOT_TOKEN` (алиасы `TELEGRAM_*`), `TELEGRAM_{STAFF,CLIENT}_WEBHOOK_SECRET`, allow-list `ShopSettings.staffChatIds` или `TELEGRAM_STAFF_CHAT_IDS`, эскалации владельцу `ShopSettings.ownerChatIds` или `TELEGRAM_OWNER_CHAT_IDS`; без токенов — no-op деградация.
- **Local AI Triage (013)**: опциональный env `LOCAL_LLM_BASE_URL` (LM Studio на GPU хоста, напр. `http://127.0.0.1:1235/v1`), `LOCAL_LLM_MODEL`, `LOCAL_LLM_TIMEOUT_MS` (default `60000`), `LOCAL_LLM_REASONING_EFFORT` (default `none`); без URL — graceful `skipped`.
- **Calendar Feed**: webcal-URL у OWNER (`/api/admin/calendar-feed/[resourceId]`); утечка → ротация `feedTokenVersion++`.
- **Ротация секретов**: `PAYLOAD_SECRET` (внимание: все HMAC/OTP/tokens keyed на него — ротация инвалидирует one-time ссылки, trust-cookies и ICS-токены фидов), `OWNER_BOOTSTRAP_TOKEN`, bot tokens — env, fail-closed.
- **Аварийные процедуры**: single-instance (`REPLICA_COUNT=1` enforced); рестарт безопасен (durable outbox + DB-backed jobs); GDPR-чистка — nightly 3am автоматически.

## 3. Reference
- **Architecture as-built**: [`architecture.md`](architecture.md) — топография, data flow (booking/waitlist/telegram/calendar/ai-triage), defense-слои, surfaces.
- **Requirements map**: [`requirements.md`](requirements.md) — FR-группы 001–013, каноны, НФ-инварианты.
- **API**: `/api/availability` (GET) · `/api/booking` (POST, двухфазный trust gate + опц. `customerNotes`) · `/api/booking/[id]` (GET) · `/api/booking/[id]/cancel` (GET validation + POST) · `/api/booking/[id]/reschedule` (GET/POST) · `/api/booking/acknowledge` (POST) · `/api/booking/resend` (POST) · `/api/approvals` (GET incl. `aiTriage` / POST, OPERATOR+) · `/api/staff/refunds/[id]` (POST, OPERATOR+) · `/api/admin/calendar-feed/[resourceId]` (GET/POST, OWNER) · `/api/calendar/feed/[resourceId]` (GET+HEAD) · `/api/waitlist` (POST) + `[entryId]` (DELETE) + `claim`/`confirm` (POST) · `/api/telegram/{staff,client}/webhook` (POST) · `/api/payments/stripe/{initiate,confirm-order,webhooks}` (POST).
- **Коллекции Payload (17)**: BookingIntents (+`customerNotes`), SlotReservations (+`customerNotes`/`aiTriage*`), WaitlistEntries, TelegramOutbox, TgLink, Blacklist, InboxEvent, PaymentEvents, EmailDeliveryLog, AuditEvents, Resources, WeeklyHours, AvailabilityExceptions, Products (+Booking-вкладка: paymentMode/depositAmount), Users, Media/Pages/Categories; + orders/carts/transactions (ecommerce-плагин) + global `ShopSettings` (вкл. `aiDelegationLimit`/`ownerChatIds`).
- **Роли**: `OWNER` (админка + всё) / `OPERATOR` (approvals, refunds) / `PERFORMER` (app-API) / `customer` (покупки).

## 4. Explanation
- **Payload Rebaseline**: почему и как — [`specs/001-.../spec.md`](../001-reinit-from-payload-ecommerce-template/spec.md) §1.4 + бизнес-план (`undreplans/docs/projects/undreseller/`).
- **Legacy port map**: [`specs/001-.../legacy-port-map.md`](../001-reinit-from-payload-ecommerce-template/legacy-port-map.md) — 11 доменов, crown jewels vs dead weight.
- **Multitenant ADR (frozen)**: [`specs/011-multitenant/design.md`](../011-multitenant/design.md) — tenant-per-database vs shared DB.
- **SpecKit governance**: [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — VI (×2 external), X (Expand/Contract), XII (QA contour).

---

## 🗺️ Активные спеки

| Спека | Статус | Документ |
| --- | --- | --- |
| 001-reinit | implemented (rev 1.3) | [`specs/001-.../`](../001-reinit-from-payload-ecommerce-template/spec.md) |
| 002-booking-domain | implemented → accepted (rev 1.2) | [`specs/002-.../`](../002-booking-domain/spec.md) |
| 003-no-show-protection | implemented | [`specs/003-.../spec.md`](../003-no-show-protection/spec.md) |
| 004-telegram-bots | implemented | [`specs/004-.../spec.md`](../004-telegram-bots/spec.md) |
| 005-calendar-feed (ex google-calendar-sync) | implemented (rev 2.1) | [`specs/005-.../spec.md`](../005-google-calendar-sync/spec.md) |
| 006-waitlist-autofill | implemented | [`specs/006-.../spec.md`](../006-waitlist-autofill/spec.md) |
| 007-booking-trust-gate | implemented | [`specs/007-.../spec.md`](../007-booking-trust-gate/spec.md) |
| 008-audit-hardening | implemented | [`specs/008-.../spec.md`](../008-audit-hardening/spec.md) |
| 009-ux-hygiene | implemented (light) | [`specs/009-.../spec.md`](../009-ux-hygiene/spec.md) |
| 010-i18n | implemented (light) | [`specs/010-.../spec.md`](../010-i18n/spec.md) |
| 011-multitenant | ❄️ frozen (design.md) | [`specs/011-.../design.md`](../011-multitenant/design.md) |
| 012-deposit-telegram | implemented (light) | [`specs/012-.../spec.md`](../012-deposit-telegram/spec.md) |
| 013-local-ai-triage | implemented (rev 1.1) | [`specs/013-.../spec.md`](../013-local-ai-triage/spec.md) |
| qa | manual-qa 2026-11-10 | [`specs/qa/manual-qa-2026-11-10.md`](../qa/manual-qa-2026-11-10.md) |

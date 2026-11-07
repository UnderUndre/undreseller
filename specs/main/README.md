# 📚 undreseller — Documentation Hub

**Repository**: `UnderUndre/undreseller`
**Version**: v2.1.0 (Payload Rebaseline: 001-reinit + 002-booking-domain implemented; 003–005 drafted)
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
ДЕЙСТВИЕ    │ • Быстрый старт (корневой    │ • Архитектура as-built v2.1  │
            │   README §Быстрый старт)     │   specs/main/architecture.md │
            │ • Bootstrap владельца        │ • Booking FSM (two-track)    │
            │   (runbook §4.1)             │   kernel/bookingFsm          │
            ├──────────────────────────────┼──────────────────────────────┤
            │ 2. HOW-TO GUIDES (Ранбуки)   │ 3. REFERENCE (Справочники)   │
            │                              │                              │
ЗНАНИЕ      │ • Деплой на VPS (002-deploy) │ • Requirements map v2.1      │
            │ • e2e/ручной прогон брони    │   specs/main/requirements.md │
            │ • Payload migrate / push     │ • Коллекции и API-роуты      │
            │ • Snapshot-теги спек         │ • Access-матрица ролей       │
            └──────────────────────────────┴──────────────────────────────┘
```

---

## 1. Tutorials
- **Быстрый старт**: корневой [`README.md`](../../README.md) §Быстрый старт — install → Postgres → dev → первый OWNER.
- **Bootstrap владельца**: [`architecture.md` §4.1](architecture.md) — регистрация OWNER до открытия ingress (fail-closed, до 003 setup-token).
- **Тесты**: `pnpm test:int` (изолированная `undreseller_test`); bootstrap-команда в шапке `test.env`.

## 2. How-To Guides (эксплуатация)
- **Deploy на VPS заказчика**: docker image из тегированных коммитов; app ≤500 MB Memory Fencing; `payload migrate` на релизе (спека 002+ deploy).
- **Регистрация webhook'ов Stripe**: `pnpm stripe-webhooks` (dev) / dashboard (prod) — обработчики приходят в 003.
- **Ротация секретов**: `PAYLOAD_SECRET`, `OWNER_BOOTSTRAP_TOKEN` — env, fail-closed на буте.
- **Аварийные процедуры**: см. дорожную карту 003+ (планировщик, sweeps); сейчас — single-instance, рестарт безопасен (DB-backed jobs).

## 3. Reference
- **Architecture as-built**: [`architecture.md`](architecture.md) — топография, data flow, defense-слои, surfaces.
- **Requirements map**: [`requirements.md`](requirements.md) — FR-группы 001/002, каноны, НФ-инварианты.
- **API**: `/api/availability` (GET), `/api/booking` (POST), `/api/booking/[id]` (GET), `/api/booking/[id]/cancel` (POST), `/api/approvals` (GET/POST, OPERATOR+) — контракты в `specs/002-booking-domain/`.
- **Коллекции Payload**: Products (+bookable), SlotReservations, Resources, WeeklyHours, AvailabilityExceptions, AuditEvents, Users, Orders/Carts/Transactions (плагин).
- **Роли**: `OWNER` (админка + всё) / `OPERATOR` (approvals API) / `PERFORMER` (003+) / `customer` (покупки).

## 4. Explanation
- **Payload Rebaseline**: почему и как — [`specs/001-reinit-from-payload-ecommerce-template/spec.md`](../001-reinit-from-payload-ecommerce-template/spec.md) §1.4 + бизнес-план v2.5.0 (`undreplans/docs/projects/undreseller/`).
- **Legacy port map**: [`specs/001-.../legacy-port-map.md`](../001-reinit-from-payload-ecommerce-template/legacy-port-map.md) — 11 доменов, crown jewels vs dead weight.
- **SpecKit governance**: [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) — VI (×2 external), X (Expand/Contract), XII (QA contour).

---

## 🗺️ Активные спеки

| Спека | Статус | Документ |
| --- | --- | --- |
| 001-reinit | implemented | [`specs/001-.../`](../001-reinit-from-payload-ecommerce-template/spec.md) |
| 002-booking-domain | implemented (override-gate) | [`specs/002-.../`](../002-booking-domain/spec.md) |
| 003-no-show-protection | drafted | [`specs/003-.../spec.md`](../003-no-show-protection/spec.md) |
| 004-telegram-bots | drafted | [`specs/004-.../spec.md`](../004-telegram-bots/spec.md) |
| 005-google-calendar-sync | drafted | [`specs/005-.../spec.md`](../005-google-calendar-sync/spec.md) |

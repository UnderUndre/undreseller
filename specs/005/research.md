# Research: 005 (005-stripe-adapter-and-sovereign-auth)

> Plan Phase 0 — Engineering Decisions. Формат: Decision / Rationale / Alternatives / Spike Governance (Constitution XI).

Контекст решений уже созрел: архитектура зафиксирована спекой rev 2.2 (requirements-audit PASS + внешний ревью-раунд 1). Здесь — финальные инженерные решения для plan/tasks и подтверждение «спайки не нужны».

## D1. Stripe SDK: официальный `stripe` npm-пакет, версия pinned

- **Decision**: `stripe` (официальный, MIT, TypeScript-first) — единственная новая runtime-зависимость. Версия pinned exact (канон репо: grammy 1.35.0, inngest 3.40.1 — точные пины).
- **Rationale**: SDK даёт: верификацию `stripe-signature` (timing-safe из коробки), типизированные вебхуки (`Stripe.DiscriminatedEvent`), Idempotency-Key нативно. Ручная реализация HMAC+разбор событий = лишняя поверхность ошибок в money-path.
- **Alternatives**: raw fetch к REST (нет типов событий, свой парсинг signature — отвергнуто в money-path); `stripe-node` next-major (не нужен).
- **Spike Governance**: не требуется — контракт PaymentProvider 004 уже валидирован (367 тестов, nowpayments-адаптер как образец); Stripe API — документированный SaaS. Смоук-проверка SDK входит в quickstart-трейсер (см. quickstart.md), не в спайк.

## D2. Argon2: `@node-rs/argon2` (native, prebuilt binaries)

- **Decision**: `@node-rs/argon2` — нативный биндинг c prebuilt-binary под linux-x64-musl (alpine) и win-x64; параметры `memoryCost` (KiB), `timeCost`, `parallelism` из env (`ARGON2_M_KIB=65536`, `ARGON2_T=3`, `ARGON2_P=4`), пол 19456/2/1.
- **Rationale**: prebuilt → не тянет node-gyp в Docker-билд (alpine без toolchain); API синхронный — идеально для мьютекс-сериализации FR-504a; опция `passwordHashing` уже не нужна — формат PHC-string хранит параметры.
- **Alternatives**: `argon2` (node-gyp, alpine-геморрой — отвергнуто); `argon2-browser`/wasm (медленнее, +1 MB в бандле); остаться на scrypt (отвергнуто спекой FR-501 — единственное crypto-upgrade-окно до клиентских пилотов).
- **Spike Governance**: не требуется — замер embedded в acceptance FR-504a (микро-бенчмарк ≤500 MB RSS, evidence до merge). Это не спайк, это гейт задачи.

## D3. Миграция zod 3.25 → 4.x: mechanical, снапшот-контракты

- **Decision**: обновление по официальному changelog (v4): `z.record(K,V)` новый сигнатур, `error.flatten()` → `z.flattenError`, `.strict()`→`z.strictObject` (дефолт v4 — strict), `coerce` поведения; `zod` pinned exact 4.x latest-stable на дату plan.
- **Rationale**: единственный оставшийся audit-high (GHSA-mrhx-c7xc-m3w5, патч только в 4.x); payload caps 004 остаются defense-in-depth.
- **Alternatives**: остаться на 3.25 + caps (профилактика vs долг — выбрано «закрыть» по решению ревью 005); zod-mini (другой API, нет).
- **Spike Governance**: не требуется — breaking-список детерминирован changelog; корректность ловится tsc + 367+ тестов + снапшоты форм 400 (FR-522).

## D4. Консолидация booking-API: `/api/booking` — канон, `/lock` — 308-шим

- **Decision**: перенос всей логики из `app/api/booking/lock/route.ts` (если существует как route) / `lib/booking/lock.ts` (сервис) в единый handler `/api/booking`; старый путь — 308 + `Deprecation: true` + `Sunset: <деплой+90d>`; после Sunset ≤006 — 410.
- **Rationale**: план 004 §Phase 4 явно назначил консолидацию в 005; сейчас две точки входа = двойной контракт и двойной QA.
- **Alternatives**: оставить оба навсегда (долг); сразу 410 (ломает клиентов безwarning'а).
- **Spike Governance**: N/A.

## D5. uk-локаль + formatMinor — data-only / утилита

- **Decision**: uk = копия структуры `messages/en.json` → перевод (ICU few/many), гейт `--locales ru,en,uk`; `formatMinor(amountMinor, currency)` — в `config/currency-registry.ts` рядом с CurrencyMetadata (источник истины minorUnit), потребляется каталогом/чекаутом/админкой/бот-карточками.
- **Spike Governance**: N/A (гейт 004 уже существует, локали — данные).

## D6. Orphan-модели 003: Contract-фаза без SQL

- **Decision**: 14 schema-only моделей (`Offering`…`OperatorAction`) удаляются из `schema.prisma` **без миграции БД** — таблицы в БД физически отсутствуют (004-аудит: миграций паков не было). Guard: rg→0, `prisma generate`, `tsc`, `prisma migrate dev` на чистой базе (P2021-чек FR-550).
- **Rationale**: Via Negativa + снимает мину `P2021` при первом `migrate dev`; модели вернутся из спеки 003 вместе с миграциями паков.
- **Alternatives**: консолидированная additive-миграция (прячется мина вглубь, создаёт unused-таблицы); оставить (мина остаётся).
- **Spike Governance**: N/A.

## Сводка спайк-гovernance

**Спайки не назначаются** (0 штук): все неизвестные закрыты либо существующим контрактом 004, либо официальной документацией, либо замером внутри acceptance (бенчмарк Argon2 — гейт, не спайк; смоук Stripe — трейсер quickstart). Constitution XI соблюдён без исключений: нет прототипов → нет утилизации.

## Открытые вопросы для plan

Нет — requirements-audit PASS закрыл последний серый зоны (TTL, enum, Stripe-отказ).

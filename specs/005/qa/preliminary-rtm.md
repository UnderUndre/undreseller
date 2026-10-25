# Preliminary Requirements Traceability Matrix (Draft RTM) — 005

> Draft до plan.md — задаёт вектор обязательных техник верификации для `/speckit.plan` / `/speckit.tasks` / `/speckit.test-design`.
> Risk = Impact (1–5) × Probability (1–5). ≥20 Critical → Decision Table + State Transition + Exploratory Charter + UAT; 15–19 High → BVA + негативные + сбои; 6–14 Medium → EP + базовые негативные; ≤5 Low → Smoke.

| Req ID | Тип | Формулировка (конденсат) | Impact | Prob | Risk | Обязательные техники | Planned Verification Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-501 | FR | Argon2id (64MB/3/4, пол ≥19MiB/≥2iter), прозрачный пере-хеш scrypt→argon2id при логине | 5 | 3 | 15 | BVA (параметры env vs пол), негативные (битый legacy-хеш) | Unit + contract |
| FR-502 | FR | Мгновенный отзыв: epoch-инкремент + deleteMany + `epochCreated` равенство (Model A) | 4 | 3 | 12 | State Transition (создание/отзыв/гонка), негативные | Unit + integration |
| FR-503 | FR | Per-IP sliding window 5/15мин → 429 на 30 мин, независимо от per-account lockout | 3 | 3 | 9 | BVA (4/5/6 попыток, второй IP), EP | Unit |
| FR-504 | FR | Break-glass ADMIN_TOKEN без изменений (lineage 003) | 4 | 2 | 8 | Regression (существующие тесты) | Regression suite |
| FR-504a | NFR/FR | Argon2 сериализация ≤1/процесс; бенчмарк ≤500 MB RSS @ 5 логинов + поллер, evidence до merge | 4 | 3 | 12 | Измеримый бенчмарк (микро-гейт), BVA пиков | Benchmark evidence + unit |
| FR-505 | FR | Auth-аудит события (SUCCESS/FAILED/LOCKED/IP_RATE_LIMITED/SESSIONS_REVOKED + cause), PII-redacted | 3 | 2 | 6 | EP (5 типов событий), PII-скан логов | Unit |
| FR-510 | FR | Stripe-адаптер `implements PaymentProvider`, регистрация в реестре | 5 | 3 | 15 | Contract-тест реестра, негативные (двойная регистрация) | Contract suite |
| FR-511 | FR | createInvoice → Checkout Session (mode payment, TTL = 15 мин = `PREPAID_HOLD_TTL_MS`, minor units, без payment_method_types) | 5 | 4 | 20 | Decision Table (методы/валюты), BVA (JPY 0 / KWD 3), сбои Stripe | Critical: DT+STM+Exploratory+UAT |
| FR-512 | FR | verifyCallback: stripe-signature HMAC-SHA256 timing-safe, тело из req.text() | 5 | 3 | 15 | Attack patterns (подделка/повтор/отсутствие), timing | Security suite |
| FR-513 | FR | parseCallback → нейтральный CallbackStatus + суммы в registry minor units | 4 | 3 | 12 | EP по event.type, BVA сумм | Unit |
| FR-514 | FR | Вебхук: InboxEvent-дедуп первым шагом; replay ×100 → 1 эффект; invalid sig → 401 zero-processing | 5 | 4 | 20 | Конкурентный залп Promise.all×100, Decision Table (4 события), STM | Critical: DT+STM+Exploratory+UAT |
| FSM-§3 | FR | Маппинг 4 Stripe-событий → FSM 004 (PAYMENT_PENDING→BOOKED и т.д.) | 5 | 4 | 20 | State Transition (полная матрица), гонки (completed+expired конкурентно) | Critical: STM+DT+UAT |
| FR-515 | FR | Возвраты вручную в Dashboard → charge.refunded → RefundOperation + FSM §3 | 5 | 3 | 15 | STM, негативные (refund без payment) | Unit + manual QA |
| FR-516 | FR | PAYMENT_PROVIDERS включает STRIPE; zero-provider/killswitch семантики 004 не меняются | 3 | 2 | 6 | Configuration matrix, smoke | Unit |
| FR-520 | FR/NFR | zod→4.x, npm audit 0 High/Critical | 4 | 3 | 12 | Audit evidence, полный jest | CI gate |
| FR-521 | FR | Миграция breaking-API zod 4 по фактическому changelog | 3 | 3 | 9 | EP (затронутые схемы), compile-гейт tsc | Unit |
| FR-522 | FR | Снапшоты форм 400-ошибок идентичны до/после | 4 | 3 | 12 | Snapshot diff | Snapshot suite |
| FR-530 | FR | 308 + Deprecation + Sunset(+90d) в 005; 410 ≤006 | 3 | 3 | 9 | Contract (заголовки), BVA дат | Contract suite |
| FR-531 | FR | Единая conflict-логика (GiST/23P01→409) после консолидации | 3 | 3 | 9 | Regression обоих путей до удаления | Integration |
| FR-540 | FR | staffRejectNotifyMode enum (default NOTIFY_CUSTOMER), UI-переключатель OPERATOR+ | 2 | 3 | 6 | EP (3 режима), UI-тест | Unit + manual |
| FR-541 | FR | uk-локаль data-only, гейт --locales ru,en,uk PASS | 2 | 2 | 4 | Gate script, ICU few/many | CI gate |
| FR-542 | FR | formatMinor по CurrencyMetadata.minorUnit (JPY 0/KWD 3/USD 2) на всех поверхностях | 3 | 3 | 9 | BVA (0/1/max minor), EP валют | Unit + visual QA |
| FR-550 | FR | Вычистка 14 orphan-моделей: rg→0 + prisma generate + tsc зелёный + CI-гейт | 4 | 2 | 8 | Grep-гейт, миграция на чистой БД (P2021-чек) | CI gate |
| NFR-1 | NFR | ≤500 MB RSS инстанса | 4 | 3 | 12 | RSS-проба (docker bench lineage 004) | Benchmark |
| NFR-2 | NFR | Ключи через env-объект; отсутствие ключей = STRIPE не в PAYMENT_PROVIDERS | 4 | 2 | 8 | Configuration matrix | Unit |
| NFR-3 | NFR | npm audit 0 H/C + лицензионный гейт PASS (MIT Stripe SDK) | 4 | 3 | 12 | npm audit + verify-licenses.mjs | CI gate |
| NFR-4 | NFR | Только Expand-фаза, down.sql обязателен | 4 | 2 | 8 | Guard-тест миграций (lineage 004) | Migration guard |
| NFR-5 | NFR | Argon2 пик RSS ≤500 MB (бенчмарк FR-504a) | 4 | 3 | 12 | Микро-бенчмарк + evidence | Benchmark evidence |

**Итого**: 27 требований. Critical (≥20): **3** (FR-511, FR-514, FSM-§3) — все в money-path Stripe. High (15–19): 5. Покрытие по техникам задаёт минимальный объём `/speckit.test-design`.

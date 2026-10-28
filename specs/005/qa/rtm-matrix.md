# Requirements & Risk Traceability Matrix (RTM): 005

> Source: `qa/preliminary-rtm.md` (risk-скоринг аудита) + tasks.md (T-ID) + commits по мере имплементации.

| Req ID | Суть | I | P | Risk | Tier | Test Cases | Task | Implementation PR | Defect IDs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-501 | Argon2id + прозрачный пере-хеш scrypt | 5 | 3 | 15 High | Regression | TC-005-001, 002, 003 | T012, T020 | [PENDING] | — |
| FR-502 | Epoch-отзыв (Model A: int-равенство) | 4 | 3 | 12 | Regression | TC-005-008, 009, 010 | T013, T023 | [PENDING] | — |
| FR-503 | Per-IP 5/15мин → 429/30мин (+регрессия per-account lockout 004) | 3 | 3 | 9 | Regression | TC-005-004, 005, 006, 007 | T021 | [PENDING] | — |
| FR-504 | Break-glass ADMIN_TOKEN неизменен | 4 | 2 | 8 | Regression | TC-MAIN-сьюта 002 (реф) | — | n/a (003) | — |
| FR-504a | Argon2 сериализация + бенчмарк ≤500 MB | 4 | 3 | 12 | Smoke (evidence) | TC-005-012 | T012, T024 | [PENDING] | — |
| FR-505 | Auth-аудит события, PII-redacted | 3 | 2 | 6 | Regression | TC-005-011 | T022 | [PENDING] | — |
| FR-510 | Stripe адаптер в реестре | 5 | 3 | 15 High | Regression | TC-005-013, 023 | T030 | [PENDING] | — |
| FR-511 | createInvoice: TTL=hold-TTL, dashboard-driven, minor units | 5 | 4 | **20 Critical** | Smoke+Extended | TC-005-013, 018, 022, 025 | T030 | [PENDING] | — |
| FR-511a | Отказ Stripe до холда: 503, STRIPE_INVOICE_FAILED, Idempotency-Key | 5 | 3 | 15 High | Sanity | TC-005-021 | T033 | [PENDING] | — |
| FR-512 | verifyCallback (stripe-signature, raw body) | 5 | 3 | 15 High | Smoke | TC-005-020 | T030, T031 | [PENDING] | — |
| FR-513 | parseCallback → CallbackStatus + minor units | 4 | 3 | 12 | Regression | TC-005-025 | T030 | [PENDING] | — |
| FR-514 | Вебхук: InboxEvent-дедуп, replay ×100 → 1 эффект | 5 | 4 | **20 Critical** | Smoke+Extended | TC-005-014, 015, 024 | T031, T032 | [PENDING] | — |
| FSM-§3 | Маппинг 4 событий → FSM 004 | 5 | 4 | **20 Critical** | Sanity+Extended | TC-005-014, 016, 017, 019, 024, 026 | T031, T032 | [PENDING] | — |
| FR-515 | Возвраты через Dashboard → RefundOperation | 5 | 3 | 15 High | Smoke | TC-005-019 | T031 | [PENDING] | — |
| FR-516 | PAYMENT_PROVIDERS + zero-provider 004 | 3 | 2 | 6 | Sanity | TC-005-023 | T030 | [PENDING] | — |
| FR-520 | zod 4, audit 0 H/C | 4 | 3 | 12 | Smoke (evidence) | TC-005-028 | T041 | [PENDING] | — |
| FR-521 | Механическая миграция zod-API | 3 | 3 | 9 | Regression | TC-005-029 | T041 | [PENDING] | — |
| FR-522 | Снапшоты форм 400 идентичны | 4 | 3 | 12 | Smoke | TC-005-027, 029 | T040, T042 | [PENDING] | — |
| FR-530 | 308 + Deprecation + Sunset | 3 | 3 | 9 | Smoke | TC-005-030, 031 | T050, T051 | [PENDING] | — |
| FR-531 | Единая conflict-логика | 3 | 3 | 9 | Regression | TC-005-032 | T050 | [PENDING] | — |
| FR-540 | reject-notify из DB, 3 режима | 2 | 3 | 6 | Sanity | TC-005-033 | T060 | [PENDING] | — |
| FR-541 | uk-локаль data-only | 2 | 2 | 4 | Sanity | TC-005-034, 035 | T061 | [PENDING] | — |
| FR-542 | formatMinor (JPY 0/KWD 3/USD 2) | 3 | 3 | 9 | Sanity | TC-005-036 | T062 | [PENDING] | — |
| FR-550 | Вычистка orphan-моделей, P2021-пруф | 4 | 2 | 8 | Smoke (evidence) | TC-005-037, 038 | T002, T070 | [PENDING] | — |

**Покрытие FR: 23/23 = 100%** (FR-504 — реф 002-сьюта).

## NFR Traceability & Level 1 Evidence Table

| NFR ID | Категория | Требование | Метод валидации | Инструмент | Threshold | Evidence | Статус |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| NFR-1 | Resources | ≤500 MB RSS инстанса | RSS-проба под нагрузкой | docker bench (lineage 004) | ≤500 MB | [PENDING staging] | [ ] |
| NFR-2 | Config | Ключи через env; нет ключа → STRIPE не активен | Configuration matrix | jest (unit) | все комбинации | [PENDING T030] | [ ] |
| NFR-3 | Supply chain | audit 0 H/C + лицензии PASS | npm audit + verify-licenses.mjs | CI | 0 H/C; PASS | [PENDING T041] | [ ] |
| NFR-4 | Migration | Expand-only + down.sql | Guard-тест миграций | jest (lineage 004) | зелёный | jest (auto) | [ ] |
| NFR-5 | Memory gate | Argon2 пик RSS ≤500 MB @ 5 логинов | Микро-бенчмарк | T024-скрипт | ≤500 MB | `evidence/argon2-benchmark.md` [PENDING T024] | [ ] |

## Critical-требования (Risk ≥ 20) — обязательный контур (Constitution XII)

FR-511, FR-514, FSM-§3 → Decision Table (TC-005-013/016/017/019 по событиям), State Transition (TC-005-014→016→017→019 жизненный цикл), Exploratory Charter ×2 (ниже в test-cases.md), UAT-001/UAT-002.

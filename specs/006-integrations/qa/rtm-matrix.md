# Requirements & Risk Traceability Matrix (RTM)

**Feature**: 006-google-calendar-and-integrations · **Spec**: rev 1.3 · **Generated**: 2026-10-26 (`/speckit.test-design`, ISO/IEC/IEEE 29119-3:2021; updated zcode review F1–F10, 2026-10-31)
**Risk источник**: `qa/preliminary-rtm.md`. PR / Defect заполняются при реализации и прогоне.

| Req ID | Суть | Impact | Prob | Risk Score | Test Tier | Test Cases | Task | Implementation PR | Defect IDs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-601 | OAuth2-connect OWNER-only, per-resource, AES-256-GCM | 4 | 3 | 12 | Sanity/Regression | TC-GCAL-001..004, TC-GCAL-020, TC-GCAL-048 | T010, T011, T020 | [PENDING] | [PENDING] |
| FR-602 | Push: полная FSM→GC-матрица, идемпотентно, Meet ⇔ флаг | 5 | 4 | **20 Critical** | Regression | TC-GCAL-005..011, TC-GCAL-047, EXP-01 | T012, T021 | [PENDING] | [PENDING] |
| FR-603 | Import: busy-импорт per-resource, syncToken/410, рекуррентные серии | 5 | 4 | **20 Critical** | Regression | TC-GCAL-012..016, TC-GCAL-045, TC-GCAL-046, EXP-02 | T010, T022, T023 | [PENDING] | [PENDING] |
| FR-604 | Health: NEEDS_REAUTH, fail-open, audit | 4 | 3 | 12 | Regression | TC-GCAL-017, TC-GCAL-019, TC-GCAL-020 | T024 | [PENDING] | [PENDING] |
| FR-605 | ICS-аттач RFC 5545, стабильный UID | 2 | 2 | 4 | Smoke/Sanity | TC-ICS-021..024 | T030, T031 | [PENDING] | [PENDING] |
| FR-606 | Webhook registry: ≤5, HMAC, SSRF-гейт | 4 | 3 | 12 | Smoke/Regression | TC-WHK-025..027, TC-WHK-032, TC-WHK-035 | T040 | [PENDING] | [PENDING] |
| FR-607 | Webhook events: закрытый список, pii=masked | 3 | 2 | 6 | Sanity | TC-WHK-028, TC-WHK-030, TC-WHK-033 | T041 | [PENDING] | [PENDING] |
| FR-608 | Read API: Bearer, 30 rpm, ≤100/стр | 3 | 3 | 9 | Smoke/Regression | TC-API-034..038 | T042 | [PENDING] | [PENDING] |
| FR-630 | zod 4.x exact-pin, audit 0 H/C | 4 | 3 | 12 | Regression | TC-ZOD-039 | T051 | [PENDING] | [PENDING] |
| FR-631 | Механическая миграция по changelog | 4 | 3 | 12 | Regression | TC-ZOD-040, TC-ZOD-042 | T051 | [PENDING] | [PENDING] |
| FR-632 | Снапшоты 400-форм идентичны | 4 | 3 | 12 | Regression | TC-ZOD-040, TC-ZOD-041 | T050, T052 | [PENDING] | [PENDING] |
| NFR-601 | ≤500 MB RSS (sync-пачки ≤50) | 4 | 2 | 8 | Extended | TC-GCAL-043 | T022 | [PENDING] | [PENDING] |
| NFR-602 | Слот-расчёт p95 ≤50 мс; push ≤60 с | 3 | 3 | 9 | Extended | TC-GCAL-018, TC-GCAL-005 (замер) | T023 | [PENDING] | [PENDING] |
| NFR-603 | Секреты шифрованы; дени-лист; 0 токенов в логах | 5 | 2 | 10 | Regression | TC-GCAL-019, TC-GCAL-001 (проверка БД) | T011, T024 | [PENDING] | [PENDING] |
| NFR-604 | Webhook p95 ≤5 с; ретраи ≤5; audit | 3 | 3 | 9 | Sanity | TC-WHK-028, TC-WHK-031 | T041 | [PENDING] | [PENDING] |
| NFR-605 | googleapis Apache-2.0 в реестре; licenses PASS | 3 | 2 | 6 | Smoke | TC-ZOD-043 | T001 | [PENDING] | [PENDING] |

**Coverage**: 16/16 FR/NFR COVERED (100%) + подстрока NFR-602b = 17 traceable rows. Critical (Risk ≥20): FR-602, FR-603 — обе закрыты Decision Table + State Transition + Error Guessing (TC-GCAL-005..017) + Exploratory Charters (EXP-01/02) + UAT (UAT-001/002). Условие Constitution XII выполнено.

## NFR Traceability & Level 1 Evidence Table

| NFR ID | Категория | Требование | Метод валидации | Инструмент | Threshold | Evidence (файл) | Статус |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| NFR-601 | Memory | ≤500 MB RSS при sync-бёрсте (пачки ≤50) | Замер процесса | `process.memoryUsage().rss` скрипт | ≤500 MB | `specs/006-integrations/evidence/gcal-memory.md` | [PENDING] |
| NFR-602 | Latency | Слот-расчёт p95 ≤50 мс @ 500 busy-блоков (локальная часть) | Perf-тест | Jest perf-gate (канон NFR-001) | p95 ≤50 мс | `specs/006-integrations/evidence/slot-perf.md` | [PENDING] |
| NFR-602b | Latency | Push события в GC ≤60 с p95 | Замер переход→событие | Трейсер T062 хронометраж | ≤60 с | `specs/006-integrations/evidence/quickstart-tracer.md` | [PENDING] |
| NFR-603 | Security | 0 токенов/секретов в логах и БД-plaintext | PII/token-скан | grep по deny-list (`refreshToken|accessToken|webhookSecret|authorization`) + SQL-проверка `encryptedPayload LIKE 'v1:%'` | 0 вхождений plaintext | `specs/006-integrations/evidence/token-scan.md` | [PENDING] |
| NFR-604 | Reliability | Webhook-доставка p95 ≤5 с; ретраи ≤5; audit при исчерпании | Замер + мок сбоя | Тест-бин + Inngest dashboard | p95 ≤5 с; retries ≤5 | `specs/006-integrations/evidence/quickstart-tracer.md` | [PENDING] |
| NFR-605 | Supply Chain | Лицензионный гейт PASS (googleapis Apache-2.0); npm audit 0 H/C | Гейт-скрипты | `verify-licenses.mjs`, `npm audit --audit-level=high` | PASS / 0 H/C | tasks-коммит evidence | [PENDING] |

**Правило**: NFR без сырого пруфа (json-лог замера, scanner report, failover log) = незакрытое требование; `[PENDING]` → значение при прогоне, иначе `/speckit.qa-signoff` не принимает.

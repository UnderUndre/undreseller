# Requirements & Risk Traceability Matrix (RTM)

**Feature**: 007-code-review-fixes · **Spec**: rev 1.1 · **Generated**: 2026-10-31 (`/speckit.test-design`, ISO/IEC/IEEE 29119-3:2021)
**Risk источник**: `qa/preliminary-rtm.md`. PR / Defect заполняются при реализации и прогоне.

| Req ID | Суть | Impact | Prob | Risk Score | Test Tier | Test Cases | Task | Implementation PR | Defect IDs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-701 | Fail-closed reschedule secret → 503 | 3 | 3 | 9 | Regression | TC-007-001..003 | T010 | [PENDING] | [PENDING] |
| FR-702 | Delivery-log соль fail-closed (UNHASHED) | 2 | 2 | 4 | Sanity | TC-007-004..006 | T011 | [PENDING] | [PENDING] |
| FR-703 | RESCHEDULE → 501, 0 мутаций | 3 | 3 | 9 | Regression | TC-007-007 | T012 | [PENDING] | [PENDING] |
| FR-704 | Инвариант amount==total → PAID_REQUIRES_RESOLUTION | 5 | 2 | 10 | Regression | TC-007-008..011 | T013 | [PENDING] | [PENDING] |
| FR-705 | AbortSignal.timeout(10s) ×3 fetch | 3 | 3 | 9 | Sanity | TC-007-012, TC-007-013 | T014 | [PENDING] | [PENDING] |
| FR-706 | Lockout registry bounded (TTL+cap) | 3 | 2 | 6 | Regression | TC-007-014..016 | T015 | [PENDING] | [PENDING] |
| FR-707 | WhatsApp verify timing-safe | 2 | 2 | 4 | Sanity | TC-007-017, TC-007-018 | T016 | [PENDING] | [PENDING] |
| FR-708 | Reconcile window 7d asc | 2 | 2 | 4 | Smoke | TC-007-019, TC-007-020 | T017 | [PENDING] | [PENDING] |
| NFR-701 | 418+ тестов / 7 снапшотов / audit 0 H/C / tsc | 4 | 3 | 12 | Regression | TC-007-021 | все | [PENDING] | [PENDING] |
| NFR-702 | 0 новых dependencies | 2 | 1 | 2 | Smoke | TC-007-022 | все | [PENDING] | [PENDING] |
| NFR-703 | RSS ≤500 MB @ 5000 спрей-попыток | 3 | 2 | 6 | Extended | TC-007-016 | T015, T021 | [PENDING] | [PENDING] |

**Coverage**: 11/11 FR/NFR COVERED (100%). Risk ≥20: нет → DT/STM/UAT-обязательств нет; профиль EP+BVA+Error Guessing.

## NFR Traceability & Level 1 Evidence Table

| NFR ID | Категория | Требование | Метод валидации | Инструмент | Threshold | Evidence (файл) | Статус |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| NFR-701 | Regression | Полный сьют зелёный; снапшоты идентичны; 0 H/C | CI-гейт | jest + tsc + npm audit | 418+ PASS / 7 identical / exit 0 | CI-лог tasks-коммита | [PENDING] |
| NFR-702 | Supply Chain | 0 новых deps | Diff-пруф | git diff package.json | пустой diff deps | tasks-коммит diff | [PENDING] |
| NFR-703 | Memory | RSS ≤500 MB при 5000 спрей-попыток | Нагрузочный мини-тест | jest stress + `process.memoryUsage().rss` | ≤500 MB; Map ≤1000 | `specs/007-code-review-fixes/evidence/lockout-rss.json` | [PENDING] |

**Правило**: NFR без сырого пруфа = незакрытое требование; `[PENDING]` → значение при прогоне, иначе `/speckit.qa-signoff` не принимает.

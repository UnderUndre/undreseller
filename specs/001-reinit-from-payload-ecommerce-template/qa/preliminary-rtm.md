# Preliminary RTM & Risk Profile: 001-reinit-from-payload-ecommerce-template

**Feature**: 001-reinit · **Generated**: 2026-11-06 (`/speckit.test-design` pre-stage) · **Spec**: rev 1.1

| Req ID | Суть | Impact | Prob | Risk Score | Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- |
| FR-101 | Baseline green + evidence | 4 | 2 | 8 | фундамент всего пайплайна; env-прereqs e2e — главная хрупкость |
| FR-102 | Governance restore | 3 | 1 | 3 | копии легаси + механическая адаптация |
| FR-103 | Port map 11/11 | 2 | 1 | 2 | документ |
| FR-104 | Roles + first-user OWNER | 4 | 2 | 8 | привилегированная поверхность (elevation) |
| FR-105 | FSM kernel port 1:1 | 5 | 2 | 10 | money-path семантика (замок до 002) |
| FR-106 | SlotReservations skeleton | 3 | 2 | 6 | скелет, без FSM-проводки |
| FR-107 | Payments invariants pure | 4 | 1 | 4 | pure-модуль, без IO |
| FR-108 | QA baseline + изоляция | 3 | 2 | 6 | живая DATABASE_URL — известный дефект шаблона |
| NFR-101 | 0 новых deps | 2 | 1 | 2 | diff-пруф |
| NFR-102 | Legacy read-only | 3 | 1 | 3 | git-status проверка |
| NFR-103 | Memory fencing doc-block | 2 | 2 | 4 | документально |
| NFR-104 | Pinned версии | 2 | 2 | 4 | package.json фиксация |

**Coverage**: 12/12 требований → TC (см. rtm-matrix.md). **Risk ≥20: нет** → Decision Table/State Transition-обязательств нет; профиль EP + BVA + Error Guessing. FSM-сьют (FR-105) наследует state-transition-покрытие легаси-эталонов.

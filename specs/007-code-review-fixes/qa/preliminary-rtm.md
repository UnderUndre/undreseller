# Preliminary Requirements Traceability Matrix (Draft RTM)

**Feature**: 007-code-review-fixes · **Spec**: rev 1.0 · **Generated**: 2026-10-31 (`/speckit.requirements-audit`)

| Req ID | Тип | Формулировка | Impact | Prob | Risk Score | Обязательные техники верификации | Planned Verification Level |
| :--- | :-- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-701 | FR | Fail-closed reschedule secret (throw без env) | 3 | 3 | 9 | EP + негативные тесты (env-absent матрица) | Unit Test |
| FR-702 | FR | Delivery-log salt fail-closed (UNHASHED + boot-алерт) | 2 | 2 | 4 | Smoke + grep-пруф (0 дефолтных солей) | Unit Test |
| FR-703 | FR | RESCHEDULE → 501, 0 мутаций БД, 0 audit | 3 | 3 | 9 | EP + негативный (БД-инвариант после вызова) | Unit/Contract Test |
| FR-704 | FR | Инвариант amountMinor==totalMinor → PAID_REQUIRES_RESOLUTION | 5 | 2 | 10 | EP + BVA (±1 minor) + Error Guessing (retрай после mismatch) | Contract Test (money-path) |
| FR-705 | FR | AbortSignal.timeout(10s) на 3 fetch call-site | 3 | 3 | 9 | Симуляция сбоя (hung upstream mock) | Unit Test |
| FR-706 | FR | Lockout registry bounded (TTL 15м + cap 1000 LRU) | 3 | 2 | 6 | BVA (999/1000/1001, active-lock не вытеснен) | Unit Test |
| FR-707 | FR | WhatsApp verify timing-safe (length-guard + timingSafeEqual) | 2 | 2 | 4 | BVA (разные длины, валидный/невалидный токен) | Unit Test |
| FR-708 | FR | Reconcile window 7d, updatedAt asc, take 50 | 2 | 2 | 4 | Smoke + идемпотентность реплея | Unit Test |
| NFR-701 | NFR | 418+ тестов зелёных; 7 снапшотов идентичны; audit 0 H/C; tsc чист | 4 | 3 | 12 | Полный CI-гейт (jest + tsc + npm audit) | Automated CI Pipeline |
| NFR-702 | NFR | 0 новых dependencies | 2 | 1 | 2 | Diff-пруф package.json | Automated CI Pipeline |
| NFR-703 | NFR | RSS ≤500 MB при 5000 спрей-попыток | 3 | 2 | 6 | Нагрузочный мини-тест + сырой замер в evidence | Automated (evidence file) |

## Примечания

- **Risk ≥20 (Critical): нет** → DT/STM/Exploratory/UAT не обязательны; профиль — EP + BVA + негативные/симуляция сбоев (Risk 6–14) и Smoke (≤5).
- **Самый высокий риск**: FR-704 (10, money-path) → обязателен контрактный тест с моками провайдеров + BVA на границе ±1 minor unit.
- **Regression-базовая линия**: 418 тестов / 51 сьют / 7 снапшотов 400-форм (канон 006 T050/T052) — любое падение = блокер merge (NFR-701).
- Traceability end-to-end (`FR ↔ Task ↔ TC ↔ Bug`) достроится в `/speckit.test-design`.

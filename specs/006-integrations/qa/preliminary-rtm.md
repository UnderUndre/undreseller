# Preliminary Requirements Traceability Matrix (Draft RTM)

**Feature**: 006-google-calendar-and-integrations
**Spec**: rev 1.1 (requirements-audit PASS, 2026-10-26)
**Назначение**: вектор для `plan.md` → `tasks.md` → `/speckit.test-design` (Principle XII). Risk Score = Impact (1–5) × Probability (1–5).

| Req ID | Тип | Формулировка (сжатая) | Impact | Prob | Risk Score | Обязательные техники верификации | Planned Verification Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-601 | FR | OAuth2-connect OWNER-only, per-resource календарь, AES-256-GCM токен, state-CSRF | 4 | 3 | 12 | EP + негативные (CSRF-state, невалидный код, 403 OPERATOR) + UAT | Contract Test + Manual QA |
| FR-602 | FR | Push: полная FSM→GC-матрица, идемпотентно, outbox-async, Meet ⇔ remoteMeetingEnabled | 5 | 4 | **20 (Critical)** | **Decision Table + State Transition + Exploratory Charter + UAT** | Contract Test + E2E + Manual QA + UAT |
| FR-603 | FR | Import: freeBusy → ExternalBusyBlock per-resource, 15 мин, syncToken/410-fallback, изоляция по ресурсу | 5 | 4 | **20 (Critical)** | **Decision Table + State Transition + Exploratory Charter + UAT** | Contract Test + E2E + Manual QA + UAT |
| FR-604 | FR | Sync Health: CONNECTED/NEEDS_REAUTH/DISABLED, invalid_grant → алерт, fail-open броней | 4 | 3 | 12 | Симуляция сбоев (мок 401/403/429) + Exploratory | Contract Test + Manual QA |
| FR-605 | FR | ICS-аттач: RFC 5545, стабильный UID, METHOD PUBLISH/CANCEL, TZID | 2 | 2 | 4 | Smoke happy-path + парсер-валидация .ics | Automated Unit Test |
| FR-606 | FR | Webhook Registry: ≤5 https-эндпоинтов, HMAC timestamp.body, ≤5 ретраев, SSRF-гейт, test-ping | 4 | 3 | 12 | BVA (0/1/5 эндпоинтов, retry-счётчик) + негативные (http, приватный IP, невалидная подпись) | Contract Test + Security Scan |
| FR-607 | FR | Webhook Events: закрытый список 5 событий, payload-контракт, pii=masked по умолчанию | 3 | 2 | 6 | EP + контрактные снапшоты payload | Automated Contract Test |
| FR-608 | FR | Read-only API: Bearer PUBLIC_API_KEY, 30 req/min, пагинация ≤100, 401/405 | 3 | 3 | 9 | Негативные (без ключа, кривой ключ, write-метод) + rate-limit тест | Automated Contract Test |
| FR-630 | FR | zod 4.x exact-pin, npm audit 0 H/C | 4 | 3 | 12 | `npm audit` гейт + verify-licenses | Automated CI Pipeline |
| FR-631 | FR | Механическая миграция по changelog zod 4 (record/flattenError/strictObject/coerce) | 4 | 3 | 12 | Полный jest-сьют + tsc --noEmit | Automated CI Pipeline |
| FR-632 | FR | Снапшоты форм 400-ответов до/после идентичны | 4 | 3 | 12 | Characterization snapshots (до) + diff-гейт (после) | Automated Contract Test |
| NFR-601 | NFR | ≤500 MB RSS (GC-воркер, пачки ≤50) | 4 | 2 | 8 | Замер RSS (канон бенчмарка 005) | Manual Evidence |
| NFR-602 | NFR | Слот-расчёт p95 ≤50 мс (локальная часть); push ≤60 с p95 | 3 | 3 | 9 | Perf-тест слот-расчёта (канон NFR-001) + замер push-latency | Automated + Evidence |
| NFR-603 | NFR | Секреты только зашифрованными; дени-лист расширен; ноль токенов в логах | 5 | 2 | 10 | PII/token-скан логов (канон stride-verification) | Automated Security Test |
| NFR-604 | NFR | Webhook-доставка p95 ≤5 с; ретраи ≤5; audit после исчерпания | 3 | 3 | 9 | Замер доставки + мок сбойного эндпоинта | Contract Test + Evidence |
| NFR-605 | NFR | googleapis Apache-2.0 exact-pin в реестре; verify-licenses PASS | 3 | 2 | 6 | verify-licenses.mjs гейт | Automated CI Pipeline |

## Metrics Header

**Всего трассируемых требований: 17 строк = 16 FR/NFR (11 FR + 5 NFR) + 1 подстрока NFR-602b (push-latency, самостоятельный замер внутри NFR-602).**

## Critical Coverage Note (Constitution XII)

Risk ≥ 20: **FR-602** (push-матрица) и **FR-603** (busy-импорт) — money-path календаря. Обязательны: Decision Table (FSM→GC-действия × таймзоны × идемпотентность), State Transition (жизненный цикл события GC), Exploratory Charter (гонки sync/холда, дрейф кэша), UAT (реальный Google-аккаунт, двусторонний сценарий мастера). Проверка в `/speckit.analyze` обязательна.

## Traceability Anchors

- FSM-матрица → `lib/kernel/bookingFsm.ts` (004 as-built) + новая `lib/integrations/gcalMapping.ts` (рекомендация R1).
- Outbox/ретраи → durable Telegram outbox + Inngest CAS (004) — переиспользование, не новая очередь.
- Advisory lock → канон `knowledge_reindex` (001).
- Шифрование → `INTEGRATION_ENCRYPTION_KEY` (AES-256-GCM), дени-лист → `lib/telemetry/logger.ts` + `emitAuditEvent` (004/005).
- Kill criteria → fallback ICS-only (spec §Regulatory); пилотный замер ложных блокировок ≤2% (R2).

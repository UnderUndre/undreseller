# Requirements & Risk Traceability Matrix (RTM) — 013-local-ai-triage

| Req ID | Суть | Impact | Prob | Risk Score | Test Tier | Test Cases | Task | Implementation PR | Defect IDs |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- | :--- |
| FR-1301 | Expand-only схема + SQL миграция up/down | 4 | 2 | 8 (Med) | Sanity | TC-013-001, TC-013-002 | T1302, T1303, T1304 | [PENDING] | — |
| FR-1302 | `customerNotes` (0..2000), OTP-гидратация, UI/i18n | 4 | 3 | 12 (Med) | Smoke + Sanity | TC-013-003, TC-013-004, TC-013-005, TC-013-006 | T1310, T1311, T1312, T1313 | [PENDING] | — |
| FR-1303 | Чистый PII-санитайзер `sanitizeForLlm` | 5 | 4 | **20 (Crit)** | Smoke + Regression | TC-013-007, TC-013-008, TC-013-009, TC-013-010 | T1320 | [PENDING] | — |
| FR-1304 | LM Studio HTTP-клиент + SSRF-guard + timeout/retry | 5 | 4 | **20 (Crit)** | Smoke + Regression | TC-013-011, TC-013-012, TC-013-013, TC-013-014 | T1322 | [PENDING] | — |
| FR-1305 | Парсер схемы + 5-условная матрица делегирования | 5 | 3 | **15 (High)** | Smoke + Sanity | TC-013-015, TC-013-016, TC-013-017, TC-013-018 | T1321 | [PENDING] | — |
| FR-1306 | Payload Job `ai-triage`, CAS claim, outbox, audit | 4 | 4 | **16 (High)** | Smoke + Regression | TC-013-019, TC-013-020, TC-013-021 | T1323 | [PENDING] | — |
| FR-1307 | `GET /api/approvals` (OPERATOR+) + GDPR 90d | 4 | 3 | 12 (Med) | Sanity | TC-013-022, TC-013-023 | T1324 | [PENDING] | — |
| FR-1308 | Eval suite `≥ 25` кейсов (`pnpm eval:ai`) | 3 | 3 | 9 (Med) | Extended | TC-013-024 | T1330 | [PENDING] | — |

## NFR Traceability & Level 1 Evidence Table

| NFR ID | Категория | Требование | Метод валидации | Инструмент | Threshold | Evidence (файл) | Статус |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| NFR-1301 | Regression | Typecheck, lint, int tests, build pass | CLI gates | `tsc`, `eslint`, `vitest`, `next build` | Exit code 0 (`≥ 202` int) | [PENDING] | [ ] |
| NFR-1302 | Supply Chain | 0 новых runtime-зависимостей | Diff `package.json#dependencies` | Git diff / script | `0` added deps | [PENDING] | [ ] |
| NFR-1303 | Latency | 0 LLM-вызовов в HTTP `/api/booking` & `/api/availability` | Mock `fetch` spy | Vitest | `0` calls, `< 5 ms` overhead | [PENDING] | [ ] |
| NFR-1304 | Memory | `app ≤ 500 MB`, 0 LLM-сервисов в `docker-compose.yml` | Static inspection | `docker-compose.yml` diff | `0` new services | [PENDING] | [ ] |
| NFR-1305 | Privacy / OpSec | `PII Leak Count = 0` в LLM-запросах, логах и `audit_events` | Payload & log capture | Vitest + `pnpm eval:ai` | `0` leaks | [PENDING] | [ ] |
| NFR-1306 | Resilience | Timeout `8000 ms`, max `1` retry, 100% сохранение броней | Fault injection | Vitest (`fetchImpl`) | `100%` bookings preserved | [PENDING] | [ ] |

# Requirements & Risk Traceability Matrix (RTM) — 014-composite-booking

| Req ID | Суть | Impact | Prob | Risk Score | Test Tier | Test Cases | Task | Implementation PR | Defect IDs |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- | :--- |
| FR-1401 | Expand-only схема (`items_json` ×2, `Product.addOn`) | 4 | 2 | 8 (Med) | Sanity | TC-014-001, TC-014-002 | T1402, T1403, T1404 | [PENDING] | — |
| FR-1402 | Composite intake (капы, режимы, 3 пути, гидратация, drift) | 4 | 4 | **16 (High)** | Smoke + Regression | TC-014-003..TC-014-009 | T1410, T1412, T1413 | [PENDING] | — |
| FR-1403 | Composite availability (override, max-buffers, 409 race) | 4 | 4 | **16 (High)** | Smoke + Regression | TC-014-010..TC-014-013 | T1411 | [PENDING] | — |
| FR-1404 | Money path (Σ, депозиты, idempotency, refund контейнера) | 5 | 3 | **15 (High)** | Smoke + Regression | TC-014-014..TC-014-018 | T1420 | [PENDING] | — |
| FR-1405 | Itemized surfaces (card/email/approvals/confirmation/UI) | 3 | 3 | 9 (Med) | Sanity | TC-014-019..TC-014-022 | T1430, T1431, T1432 | [PENDING] | — |
| FR-1406 | 013/GDPR compatibility | 3 | 2 | 6 (Med) | Regression | TC-014-023, TC-014-024 | T1433 | [PENDING] | — |

## NFR Traceability & Level 1 Evidence Table

| NFR ID | Категория | Требование | Метод валидации | Инструмент | Threshold | Evidence (файл) | Статус |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| NFR-1401 | Regression | Gates 0 exit; ≥ 212 существующих int зелёных | CLI gates | `tsc/eslint/vitest/build` | Exit 0 | [PENDING] | [ ] |
| NFR-1402 | Supply Chain | 0 новых runtime deps | Diff `package.json` | Git diff | `0` | [PENDING] | [ ] |
| NFR-1403 | Latency | `availability p95 < 50 ms`, 0 новых SQL на composite | Query-count assert + perf smoke | Vitest | p95 < 50 ms | [PENDING] | [ ] |
| NFR-1404 | Migration | Expand-only идемпотентный up/down | Migration smoke | `payload migrate` | 0 exit ×2 прогона | [PENDING] | [ ] |
| NFR-1405 | Fail-closed | 422 коды ДО intent; error-shapes расширен | Negative route tests | Vitest | 0 строк БД на отказ | [PENDING] | [ ] |
| NFR-1406 | Compat | Однопозиционный путь побитово идентичен | Golden-path regression | Vitest | 212/212 + parity asserts | [PENDING] | [ ] |

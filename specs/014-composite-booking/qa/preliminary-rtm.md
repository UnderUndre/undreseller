# Preliminary Requirements Traceability Matrix (Draft RTM) — 014-composite-booking

| Req ID | Тип | Формулировка | Impact | Prob | Risk Score | Обязательные техники верификации | Planned Verification Level |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| FR-1401 | FR | Expand-only схема: `items_json` ×2, `Product.addOn` + валидатор durationMin | 4 | 2 | 8 (Medium) | EP, Migration up/down smoke | Int test + DB migration check |
| FR-1402 | FR | Composite intake (`items[]`, капы 6/480, однородный режим, 3 пути + 007 гидратация + drift check) | 4 | 4 | **16 (High)** | BVA (1/6/7 позиций, Σ=480/481), EP, State Transition (intent drift), Negative | Int test (route + service) |
| FR-1403 | FR | Composite availability (resolver override, max-buffers, grid, 409 race) | 4 | 4 | **16 (High)** | BVA (Σ=75 на квант-сетке), Concurrency race, GiST adjacency | Int test (real PG) |
| FR-1404 | FR | Money path (Σ price/deposits, один PaymentIntent, idempotency с составом, refund контейнера по primary cutoff) | 5 | 3 | **15 (High)** | Decision Table (режимы), State Transition (hold → webhook → booked → cancel), BVA cutoff | Int test (STM + money) |
| FR-1405 | FR | Itemized surfaces (staff card, email, approvals, confirmation, UI multi-select) | 3 | 3 | 9 (Medium) | EP + UI check | Int test + Component |
| FR-1406 | FR | 013 compatibility (aiTriage primary, GDPR purge без изменений) | 3 | 2 | 6 (Medium) | Regression run | Int test (existing suites green) |
| NFR-1401 | NFR | Zero Regression (`validate/lint/test:int ≥ 212/build`) | 5 | 2 | 10 (Medium) | Regression suite | CI / Local verification |
| NFR-1402 | NFR | Zero New Runtime Dependencies | 4 | 1 | 4 (Low) | Diff `package.json` | Static check |
| NFR-1403 | NFR | Availability p95 < 50 ms, 0 новых SQL на composite-грид | 4 | 3 | 12 (Medium) | Perf smoke + query-count assert | Int test |
| NFR-1404 | NFR | Expand-only миграция с идемпотентным up/down | 4 | 2 | 8 (Medium) | Migration smoke | Int/DB check |
| NFR-1405 | NFR | Fail-closed: валидационные 422 ДО intent/строк БД; error-shapes снапшот расширен | 4 | 3 | 12 (Medium) | Negative route tests + snapshot | Int test |
| NFR-1406 | NFR | Backward compat: однопозиционный путь побитово идентичен | 5 | 2 | 10 (Medium) | Golden-path regression | Int test |

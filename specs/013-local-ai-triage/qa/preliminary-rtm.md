# Preliminary Requirements Traceability Matrix (Draft RTM) — 013-local-ai-triage

| Req ID | Тип | Формулировка | Impact | Prob | Risk Score | Обязательные техники верификации | Planned Verification Level |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| FR-1301 | FR | Expand-only схема (`SlotReservations`, `BookingIntents`, `ShopSettings`) + SQL миграция `up/down` | 4 | 2 | 8 (Medium) | EP, Migration up/down smoke | Int test + DB migration check |
| FR-1302 | FR | Приём `customerNotes` (`0..2000`) в `/api/booking`, 007 БД-гидратация, `SlotGrid.tsx`, триггер `ai-triage` | 4 | 3 | 12 (Medium) | BVA (`0, 1, 2000, 2001`), EP, UI check | Int test + Component/Route test |
| FR-1303 | FR | Чистый PII-санитайзер `sanitizeForLlm` (`[PHONE]`, `[EMAIL]`, `[ID]`, сохранение сумм `450 AED`) | 5 | 4 | **20 (Critical)** | Decision Table, BVA (8..19 цифр), Error Guessing / Attack Patterns, UAT | Unit/Int test + Eval PII Leak=0 |
| FR-1304 | FR | Чистый `fetch` клиент к LM Studio + SSRF-guard (`REMOTE_LLM_FORBIDDEN`) + timeout/retry | 5 | 4 | **20 (Critical)** | Decision Table (URL allow/deny), State/Retry, Error Guessing (SSRF bypass), UAT | Unit/Int test (`fetchImpl` mock) |
| FR-1305 | FR | Валидатор схемы `TriageExtraction` + детерминированный `routeTriageDecision` (5 условий) | 5 | 3 | **15 (High)** | Decision Table (5 условий × комбинации), BVA (`1499/1500/1501`, `0.79/0.80`), Negative | Unit/Int test |
| FR-1306 | FR | Асинхронная Payload Job `ai-triage` (`pending→processing→done\|failed`), `audit_events`, `telegram_outbox` | 4 | 4 | **16 (High)** | State Transition Machine, Concurrency/CAS dup check, Failure simulation | Int test (real PG + mock fetch) |
| FR-1307 | FR | `GET /api/approvals` (OPERATOR+) поля триажа + `gdprPurge` обнуление > 90 дней | 4 | 3 | 12 (Medium) | EP, RBAC negative (`403`), BVA (89/91 день) | Int test |
| FR-1308 | FR | Eval suite `tests/eval/triage-dataset.json` (≥ 25 кейсов) + `pnpm eval:ai` | 3 | 3 | 9 (Medium) | EP + Injection scenarios | Live LM Studio CLI run |
| NFR-1301 | NFR | Zero Regression (`validate`, `lint`, `test:int ≥ 202`, `build` = 0) | 5 | 2 | 10 (Medium) | Regression suite run | CI / Local verification |
| NFR-1302 | NFR | Zero New Runtime Dependencies (`package.json#dependencies` неизменен) | 4 | 1 | 4 (Low) | Diff check `package.json` | Static check |
| NFR-1303 | NFR | Latency Isolation (`0` LLM-вызовов в HTTP booking/availability, `< 5 ms` overhead) | 4 | 3 | 12 (Medium) | Spy/Assert 0 fetch calls on `/api/booking` | Int test |
| NFR-1304 | NFR | Memory Fencing (`app ≤ 500 MB RAM`, 0 LLM-сервисов в `docker-compose.yml`) | 4 | 2 | 8 (Medium) | Config inspection | Static check |
| NFR-1305 | NFR | `PII Leak Count = 0` в HTTP-теле к модели, логах и `audit_events` | 5 | 3 | **15 (High)** | BVA + Negative payload inspection + Eval assertion | Int test + Live Eval |
| NFR-1306 | NFR | Timeout `8000 ms` + max 1 retry + 100% сохранение броней при падении LLM | 4 | 3 | 12 (Medium) | Failure injection (500 / ECONNREFUSED / timeout / bad JSON) | Int test |

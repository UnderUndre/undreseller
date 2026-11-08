# Preliminary Requirements Traceability Matrix (Draft RTM)

| Req ID | Тип | Формулировка | Impact | Prob | Risk Score | Обязательные техники верификации | Planned Verification Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-401 | FR | Outbox: lease 30s, priorities, 429-cooldown, starvation boost, Telegram-only | 4 | 4 | **16** | **STM + Error Guessing + stress** | Automated (int) |
| FR-402 | FR | Staff pager: карточка + 5 CAS-действий + barrier 30s + auth 3 уровня | 4 | 4 | **16** | **DT (auth × actions) + STM (CAS) + UAT** | Automated (int) + Manual |
| FR-403 | FR | Client bot: confirm/decline + re-issue + cooldown + blacklist | 3 | 3 | 9 | EP + DT | Automated (int) |
| FR-404 | FR | GDPR: redaction CRITICAL, purge 90d, маскировка | 4 | 3 | 12 | BVA (90d ±1) + redaction-тесты | Automated (int) |
| FR-405 | FR | Webhook security: timing-safe, fail-closed, 200-деградация | 4 | 3 | 12 | Security DT | Automated (int) |
| FR-406 | FR | Blacklist: коллекция + 3 точки enforcement | 3 | 3 | 9 | DT (enforcement × surface) | Automated (int) |
| FR-407 | FR | TgLink: deep-link, идемпотентный upsert, PII-канон | 3 | 3 | 9 | EP + PII-тесты | Automated (int) |
| FR-408 | FR | Dispatch worker: SKIP LOCKED claim, attempts→dead | 4 | 4 | **16** | **STM (claim race) + Error Guessing (429/5xx)** | Automated (int) |
| NFR-401 | NFR | 129+ старых + ≥20 новых | 3 | 2 | 6 | Regression suite | Automated CI |
| NFR-402 | NFR | Ровно 1 новый dep (grammy) | 2 | 2 | 4 | diff package.json | Automated CI |
| NFR-403 | NFR | 0 PII в логах | 4 | 2 | 8 | Дени-лист тесты | Automated (int) |
| NFR-404 | NFR | ≤500 MB при dispatch | 3 | 2 | 6 | Замер (evidence / qa-signoff) | Manual evidence |

**Coverage**: 12/12 reqs → риски 15–19 (FR-401/402/408) требуют STM + DT + Error Guessing (+UAT на staff-пейджер).
**Note**: финальная RTM — после `/speckit.tasks` (stage 5.5).

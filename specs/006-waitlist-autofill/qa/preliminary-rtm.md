# Preliminary Requirements Traceability Matrix (Draft RTM)

| Req ID | Тип | Формулировка | Impact | Prob | Risk Score | Обязательные техники верификации | Planned Verification Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-601 | FR | Join: кап 3/телефон, дубли 409, audit | 3 | 3 | 9 | EP + DT | Automated (int) |
| FR-602 | FR | Matching+notify: FIFO top-5, камп-кап 3, email-канон | 4 | 3 | 12 | DT + Error Guessing | Automated (int) |
| FR-603 | FR | Claim: FSM CREATE_BOOKING (FREE→CONFIRMED / PREPAID→HELD 15m), гонка ×100, auto-advance | 5 | 4 | **20** | **STM + DT + EG + UAT** | Automated (int) + Manual |
| FR-604 | FR | Lifecycle sweep: expired/re-arm/камп-кап | 3 | 2 | 6 | EP | Automated (int) |
| FR-605 | FR | Unsubscribe по токену | 2 | 2 | 4 | Smoke | Automated (int) |
| NFR-601 | NFR | 153+ старых + ≥15 новых | 3 | 2 | 6 | Regression suite | Automated CI |
| NFR-602 | NFR | 0 новых deps | 2 | 2 | 4 | diff package.json | Automated CI |
| NFR-603 | NFR | Матчинг ≤50 ms; claim p95 < 100 ms | 3 | 2 | 6 | Замер (evidence) | Manual evidence |
| NFR-604 | NFR | PII: claim-ссылка без PII, дени-лист логов | 4 | 2 | 8 | PII-grep тест | Automated (int) |

**Coverage**: 10/10 reqs → Risk ≥20 (FR-603) требует STM+DT+EG+UAT.
**Note**: финальная RTM — после `/speckit.tasks` (stage 5.5).

# Preliminary Requirements Traceability Matrix (Draft RTM)

| Req ID | Тип | Формулировка | Impact | Prob | Risk Score | Обязательные техники верификации | Planned Verification Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-701 | FR | BookingIntent: HMAC codeHash, TTL 10m, future-slot guard, кап 2 live/email | 4 | 3 | 12 | EP + DT | Automated (int) |
| FR-702 | FR | Two-phase booking: OTP verify ≤5 attempts → FSM CREATE_BOOKING | 5 | 4 | **20** | **STM + DT + EG + UAT** | Automated (int) + Manual |
| FR-703 | FR | Honeypot: silent 200, audit, a11y-атрибуты | 3 | 3 | 9 | DT | Automated (int) |
| FR-704 | FR | Waitlist double-opt-in: pending→waiting, relay-guard | 4 | 3 | 12 | DT | Automated (int) |
| FR-705 | FR | Intent lifecycle sweep: expired/purged | 3 | 2 | 6 | EP | Automated (int) |
| FR-706 | FR | Repeat-client allowlist (skip OTP) | 3 | 2 | 6 | EP + spoofing-негатив | Automated (int) |
| FR-707 | FR | Seams code review (documented) | 3 | 2 | 6 | Отчёт в evidence | Manual evidence |
| NFR-701 | NFR | 164+ старых + ≥15 новых | 3 | 2 | 6 | Regression suite | Automated CI |
| NFR-702 | NFR | 0 новых deps | 2 | 2 | 4 | diff package.json | Automated CI |
| NFR-703 | NFR | intent create p95 < 30 ms; verify p95 < 50 ms | 3 | 2 | 6 | Замер (evidence) | Manual evidence |
| NFR-704 | NFR | OTP только HMAC; intents purge 30d; дени-лист | 4 | 2 | 8 | PII-grep тест | Automated (int) |

**Coverage**: 12/12 reqs → Risk ≥20 (FR-702) требует STM+DT+EG+UAT.
**Note**: финальная RTM — после `/speckit.tasks` (stage 5.5).

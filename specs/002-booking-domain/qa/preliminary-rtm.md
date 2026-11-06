# Preliminary RTM & Risk: 002-booking-domain

| Req ID | Суть | Impact | Prob | Risk |
| :--- | :--- | :--- | :--- | :--- |
| FR-201 | Bootstrap token | 4 | 2 | 8 |
| FR-202 | GiST EXCLUDE | 5 | 2 | 10 |
| FR-203 | Advisory lock | 5 | 2 | 10 |
| FR-204 | Catalog+hours+TZ | 4 | 2 | 8 |
| FR-205 | Availability API | 4 | 3 | 12 |
| FR-206 | Booking service+API | 5 | 3 | 15 |
| FR-207 | Rate limit | 3 | 2 | 6 |
| FR-208 | Approval API | 4 | 2 | 8 |
| FR-209 | Storefront flow | 3 | 2 | 6 |
| FR-210 | AuditEvents | 3 | 1 | 3 |
| NFR-201..205 | Регрессия/память/deps/миграция/pure | 2–4 | 1–2 | 2–8 |

**Coverage**: 14/14. Risk ≥20: нет; FR-206 (15) — money-adjacent → STM+DT проактивно. Профиль: EP + BVA + STM + Error Guessing.

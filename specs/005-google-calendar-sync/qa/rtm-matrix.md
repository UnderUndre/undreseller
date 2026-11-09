# RTM: 005-google-calendar-sync (Calendar Feed)

| Req ID | Risk | Tier | Test Cases | Task |
| :--- | :--- | :--- | :--- | :--- |
| FR-501 | 12 | Regression (Sec DT + BVA) | TC-005-001..003, TC-005-008 | T520 |
| FR-502 | 9 | Sanity (EP + RFC-структурные) | TC-005-004..006 | T510 |
| FR-503 | 8 | Sanity (PII-grep) | TC-005-007 | T520 |
| FR-504 | 6 | Sanity (EP) | TC-005-009..010 | T521 |
| NFR-501..504 | — | Smoke | TC-005-011..012 | T530 |

**Coverage**: 8/8 (100%). 12 TC. Risk ≥20 отсутствует; money-path не затронут. Security-DT (токен/ротация) проактивно — TC-005-001..003, 009.

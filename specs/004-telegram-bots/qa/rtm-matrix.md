# RTM: 004-telegram-bots

| Req ID | Risk | Tier | Test Cases | Task |
| :--- | :--- | :--- | :--- | :--- |
| FR-401 | **16** | **High (STM+EG)** | TC-004-001..004 | T420 |
| FR-402 | **16** | **High (DT+STM+UAT)** | TC-004-005..009 | T430 |
| FR-403 | 9 | Sanity (EP+DT) | TC-004-010..012 | T440, T431 |
| FR-404 | 12 | Regression (BVA) | TC-004-017..019 | T450 |
| FR-405 | 12 | Regression (Sec DT) | TC-004-005 (auth) + TC-004-020 | T410 |
| FR-406 | 9 | Sanity (DT) | TC-004-013..014 | T441 |
| FR-407 | 9 | Sanity (EP) | TC-004-015..016 | T440 |
| FR-408 | **16** | **High (STM+EG)** | TC-004-001..004 | T420 |
| NFR-401..404 | — | Smoke | TC-004-021..022 | T460 |

**Coverage**: 12/12 (100%). 22 TC. Risk 15–19 (FR-401/402/408) → STM+DT+Error Guessing — покрыты (UAT-02 на staff-пейджер; exploratory-чартер в test-cases).

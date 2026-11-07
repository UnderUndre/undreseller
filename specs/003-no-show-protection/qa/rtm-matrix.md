# RTM: 003-no-show-protection

| Req ID | Risk | Tier | Test Cases | Task |
| :--- | :--- | :--- | :--- | :--- |
| FR-301 | 15 | Regression (DT) | TC-003-001..002 | T310 |
| FR-302 | **20** | **Critical (STM+DT)** | TC-003-003..006 | T311 |
| FR-303 | **20** | **Critical (STM+DT+EG)** | TC-003-007..010 | T320 |
| FR-304 | 12 | Regression (BVA+DT) | TC-003-011..012 | T321 |
| FR-305 | 9 | Sanity (EP) | TC-003-013..014 | T330 |
| FR-306 | 12 | Regression (BVA) | TC-003-015..016 | T340 |
| FR-307 | 6 | Sanity (EP) | TC-003-017 | T350 |
| FR-308 | 12 | Regression (DT) | TC-003-018..019 | T310, T330 |
| NFR-301..304 | — | Smoke | TC-003-020..021 | T360 |

**Coverage**: 12/12 (100%). 21 TC. Risk ≥20 (FR-302, FR-303) → STM+DT+Exploratory+UAT — покрыты (UAT-02, UAT-03; exploratory-чартер в test-cases).

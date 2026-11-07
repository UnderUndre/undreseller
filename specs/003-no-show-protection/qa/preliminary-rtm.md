# Preliminary Requirements Traceability Matrix (Draft RTM)

| Req ID | Тип | Формулировка | Impact | Prob | Risk Score | Обязательные техники верификации | Planned Verification Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-301 | FR | Deposit policy `NONE \| FULL_PREPAYMENT` per-service, default NONE | 5 | 3 | 15 | BVA, Decision Table, негативные | Automated (int) |
| FR-302 | FR | PREPAID FSM: HELD→PAYMENT_PENDING→CONFIRMED/UNDERPAID; TTL 15m; late→PAID_REQUIRES_RESOLUTION | 5 | 4 | **20** | **STM + DT + Exploratory + UAT** | Automated (int) + Manual QA |
| FR-303 | FR | Webhooks: inbox-dedupe, ACK-матрица 200/5xx/400, PaymentEvent ledger, invariants | 5 | 4 | **20** | **STM + DT + Error Guessing + UAT** | Automated (int) |
| FR-304 | FR | Refund policy: cutoff-автовозврат / staff resolution, SLA 24h | 4 | 3 | 12 | BVA (cutoff ±1min), DT | Automated (int) + Manual |
| FR-305 | FR | Email reminders: CAS-отправка, delivery-log, retry ≤5 | 3 | 3 | 9 | EP + CAS-race тест | Automated (int) |
| FR-306 | FR | Cancel/Reschedule HMAC-токены: одноразовость, cutoff, scheduleVersion bump | 4 | 3 | 12 | BVA + token-матрица | Automated (int) |
| FR-307 | FR | Scheduler: idempotent + lease sweep, рестарт-безопасность | 3 | 2 | 6 | EP + restart-тест | Automated (int) |
| FR-308 | FR | Email capture: PREPAID требует email (422), NONE — опция, reminders при email | 4 | 3 | 12 | EP + DT (email × paymentMode) | Automated (int) |
| NFR-301 | NFR | Регрессия 72+ зелёная; новые ≥25 | 3 | 2 | 6 | Regression suite | Automated CI |
| NFR-302 | NFR | 0 новых deps (Stripe SDK в дереве; Resend = HTTP) | 2 | 2 | 4 | diff package.json | Automated CI |
| NFR-303 | NFR | Fail-closed money path: 0 silent-PAID, mismatch → operator-alert | 5 | 2 | 10 | DT + Error Guessing | Automated (int) |
| NFR-304 | NFR | ≤500 MB при sweep-нагрузке | 3 | 2 | 6 | Замер (evidence) | Manual evidence |

**Coverage**: 12/12 reqs → риски ≥20 (FR-302, FR-303) требуют DT+STM+Exploratory+UAT по конституции XII.
**Note**: финальная RTM — после `/speckit.tasks` (stage 5.5).

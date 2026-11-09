# Preliminary Requirements Traceability Matrix (Draft RTM)

| Req ID | Тип | Формулировка | Impact | Prob | Risk Score | Обязательные техники верификации | Planned Verification Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-501 | FR | Feed endpoint: HMAC timing-safe, 403-матрица, rate limit 10/60s | 4 | 3 | 12 | Security DT + BVA | Automated (int) |
| FR-502 | FR | ICS-тело: стабильный UID, UTC, STATUS/SEQUENCE, окно, пустой фид | 3 | 3 | 9 | EP + RFC-структурные | Automated (int) |
| FR-503 | FR | PII-граница: SUMMARY без телефона/контактов | 4 | 2 | 8 | PII-grep тест | Automated (int) |
| FR-504 | FR | Ротация токена: мгновенная инвалидация + audit | 3 | 2 | 6 | EP | Automated (int) |
| NFR-501 | NFR | 142+ старых + ≥10 новых | 3 | 2 | 6 | Regression suite | Automated CI |
| NFR-502 | NFR | 0 новых deps (hand-rolled RFC 5545) | 2 | 2 | 4 | diff package.json | Automated CI |
| NFR-503 | NFR | p95 фида < 50 ms | 3 | 2 | 6 | Замер (evidence) | Manual evidence |
| NFR-504 | NFR | Тело фида не логируется | 4 | 2 | 8 | Дени-лист тест | Automated (int) |

**Coverage**: 8/8 reqs → Risk ≥20 отсутствует; money-path не затронут.
**Note**: финальная RTM — после `/speckit.tasks` (stage 5.5).

# Regression Suite: 003-no-show-protection

**Базис**: 108 тестов 001+002 (int, 10 сьютов) — все зелёные до старта 003 (NFR-301).

## Обязательные регрессионные контуры

| Контур | Что защищаем | Сьют |
| :--- | :--- | :--- |
| FREE-track booking | NONE-услуги не изменяют поведения 002 (T310-флаг default NONE) | booking-service.int.spec |
| Double-booking броня | GiST+advisory не тронуты refund/email-изменениями | gist-race.int.spec |
| FSM kernel (pure) | FREE-матрица без деградации после PREPAID-правок | booking-fsm.int.spec |
| Bootstrap/access | token-guard, роли OPERATOR approval — без деградации | access-roles.int.spec |
| Availability engine | computeSlots pure + p95 < 50ms (B-tree не тронут) | availability-bva.int.spec |
| Error shapes | каталог кодов расширяется, старые снапшоты стабильны | error-shapes.int.spec |
| Payments invariants | assertProviderAmountMatch/assertValidInvoiceAmount в живом пути 003 | payments-invariants.int.spec |

## Гейт 0 (exit)
- `npm run validate` (tsc --noEmit) — 0
- lint — 0 errors
- `test:int` — 108 старых + ≥25 новых, зелёные
- `build` — 0 exit
- `npm audit` — 0 H/C
- Evidence: ACK-матрица лог (TC-003-007..010), CAS-гонка лог (TC-003-013), memory-замер ≤500 MB (TC-003-021)

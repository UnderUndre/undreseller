# Regression Suite: 004-telegram-bots

**Базис**: 129 тестов 001+002+003 (13 сьютов) — все зелёные до старта 004 (NFR-401).

## Обязательные регрессионные контуры

| Контур | Что защищаем | Сьют |
| :--- | :--- | :--- |
| FREE-track booking | NONE-услуги не меняются от bot-интеграций | booking-service.int.spec |
| PREPAID money path | FSM-матрица, webhooks, refund — боты не трогают деньги (taboo) | prepaid-booking / refund-policy |
| Double-booking броня | GiST+advisory не тронуты | gist-race.int.spec |
| Email-канон 003 | Resend-jobs живут без outbox (Q6: границы каналов) | tokens-sweep.int.spec |
| Bootstrap/access | token-guard, роли — без деградации | access-roles / bootstrap-token |
| Availability engine | computeSlots + p95 < 50 ms | availability.int.spec |
| Error shapes | каталог кодов расширяется (AUTH_DENIED/BARRIER_ACTIVE/BLACKLISTED/LINK_NOT_FOUND), старые снапшоты стабильны | error-shapes.int.spec |
| Payments invariants | живой путь 003 не тронут | payments-invariants.int.spec |

## Гейт 0 (exit)
- `npm run validate` (tsc --noEmit) — 0
- lint — 0 errors
- `test:int` — 129 старых + ≥20 новых, зелёные
- `build` — 0 exit
- `pnpm audit --prod` — 0 H/C (grammy проходит)
- Evidence: outbox claim-race лог (TC-004-001/002), CAS-матрица (TC-004-007/008), auth-матрица, p95-замер (TC-004-004), purge BVA лог (TC-004-018)

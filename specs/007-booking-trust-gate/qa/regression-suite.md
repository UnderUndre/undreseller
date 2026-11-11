# Regression Suite: 007-booking-trust-gate

**Базис**: 164 теста 001–006 (17 сьютов) — все зелёные до старта 007 (NFR-701).

## Обязательные регрессионные контуры

| Контур | Что защищаем | Сьют |
| :--- | :--- | :--- |
| Booking FSM / PREPAID | OTP-гейт живёт в РОУТЕ — сервисный контракт createBooking не меняется | booking-fsm / prepaid-booking |
| Waitlist claim | claim-токены 006 не зависят от booking-intents | waitlist |
| Double-booking броня | advisory+GiST не тронуты | gist-race |
| Cancel/refund policy | RELEASED-точки не мутируются (notifySlotFreed уже был) | refund-policy / tokens-sweep |
| Email канон | kind += 'intent' — старые kind стабильны | tokens-sweep |
| Telegram outbox | OTP не ходит через outbox | telegram-outbox |
| Bootstrap/access | гейт только на публичных роутах | access-roles / bootstrap-token |
| Error shapes | OTP_INVALID/INTENT_CAP/INTENT_DEAD/BLACKLISTED добавляются, старые стабильны | error-shapes |

## Гейт 0 (exit)
- `npm run validate` (tsc --noEmit) — 0
- lint — 0 errors
- `test:int` — 164 старых + ≥15 новых, зелёные
- `build` — 0 exit
- `pnpm audit --prod` — 0 H/C
- Evidence: brute-force лог (TC-007-005), OTP-матрица (TC-007-004..009), honeypot-лог (TC-007-010..011), p95-замер (TC-007-020)

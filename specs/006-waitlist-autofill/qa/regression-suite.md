# Regression Suite: 006-waitlist-autofill

**Базис**: 153 теста 001–005 (16 сьютов) — все зелёные до старта 006 (NFR-601).

## Обязательные регрессионные контуры

| Контур | Что защищаем | Сьют |
| :--- | :--- | :--- |
| Booking FSM / PREPAID | claim вызывает createBooking — FSM-контракт не расширяется | booking-fsm / prepaid-booking |
| Double-booking броня | claim-гонка опирается на advisory+GiST (не дублирует) | gist-race |
| Cancel/hold-sweep → RELEASED | notifySlotFreed — best-effort, не ломает cancel-path | tokens-sweep / refund-policy |
| Refund policy | RELEASED-точки не мутируются | refund-policy |
| Email канон | kind += 'waitlist' — старые kind стабильны | tokens-sweep |
| Telegram outbox | не затронут (MVP email-only) | telegram-outbox |
| Bootstrap/access | join публичный — access-канон не тронут | access-roles |
| Error shapes | WAITLIST_* коды добавляются, старые стабильны | error-shapes |

## Гейт 0 (exit)
- `npm run validate` (tsc --noEmit) — 0
- lint — 0 errors
- `test:int` — 153 старых + ≥15 новых, зелёные
- `build` — 0 exit
- `pnpm audit --prod` — 0 H/C
- Evidence: claim-гонка ×100 лог (TC-006-007), FIFO-матчинг лог (TC-006-004), p95-замер (TC-006-015)

# Regression Suite: 005-google-calendar-sync (Calendar Feed)

**Базис**: 142 теста 001–004 (15 сьютов) — все зелёные до старта 005 (NFR-501).

## Обязательные регрессионные контуры

| Контур | Что защищаем | Сьют |
| :--- | :--- | :--- |
| Booking FSM / PREPAID | Фид read-only — статус-писатели не тронуты | booking-service / prepaid-booking |
| Double-booking броня | GiST+advisory не тронуты | gist-race |
| Cancel/reschedule | STATUS:CANCELLED/DTSTART читают те же поля, не мутируют | tokens-sweep / refund-policy |
| Availability p95 | Фид не конкурирует за индекс (read-only) | availability |
| Telegram outbox | Не зависит от фида | telegram-outbox |
| Bootstrap/access | adminOnly-канон на rotate | access-roles |
| Error shapes | FEED_FORBIDDEN снапшот добавляется, старые стабильны | error-shapes |

## Гейт 0 (exit)
- `npm run validate` (tsc --noEmit) — 0
- lint — 0 errors
- `test:int` — 142 старых + ≥10 новых, зелёные
- `build` — 0 exit
- `pnpm audit --prod` — 0 H/C
- Evidence: escape-матрица лог (TC-005-005), p95-замер (TC-005-012), 403-матрица лог (TC-005-001)

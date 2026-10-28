# Contract: Google Calendar Adapter (FR-601..FR-604)

> Провайдер-нейтральный календарный слой по образцу `lib/payments/providerContract.ts` (004). Здесь: интерфейс, FSM→GC-матрица, идемпотентность, ошибки.

## 1. Интерфейс `lib/integrations/`

```ts
// gcalClient.ts — тонкая обёртка googleapis (auth refresh инкапсулирован)
export interface CalendarClient {
  pushEvent(input: PushEventInput): Promise<{ gcEventId: string; meetLink?: string }>;
  patchEvent(input: PatchEventInput): Promise<void>;
  deleteEvent(input: { calendarId: string; gcEventId?: string; orderId?: string }): Promise<void>;
  incrementalSync(input: { calendarId: string; resourceId?: string; syncToken?: string; windowDays?: number }):
    Promise<{ blocks: BusyBlock[]; nextSyncToken: string; fullSync: boolean }>;
  setTokenRefreshHandler(handler: (tokens: { refreshToken?: string; accessToken?: string }) => Promise<void>): void;
}

// gcalMapping.ts — чистая функция (Decision Table, тестируется без моков)
export type GcAction =
  | { kind: 'CREATE'; payload: PushEventInput }
  | { kind: 'PATCH'; payload: PatchEventInput }
  | { kind: 'DELETE'; gcEventId?: string }   // gcEventId unknown → lookup by extendedProperties
  | { kind: 'NOOP' };

export function mapFsmToGcAction(transition: FsmTransitionInput): GcAction;
```

## 2. FSM→GC Decision Table (FR-602, канон DB-терминов 004)

| Состояние/переход FSM | До этого было событие? | GC-действие | Примечания |
|---|---|---|---|
| → `BOOKED` (любой трек) | нет | `CREATE` | `summary = "<serviceTitle> — <orderNumber>"`, `description` = контакты (PII-редакция), `start/end` UTC, `extendedProperties.private = { undresellerOrderId, resourceId }`, Meet ⇔ `Item.remoteMeetingEnabled` |
| → `BOOKED` | да (перенос ранее) | `PATCH` (время/описание) | |
| → `CANCELLED` (любая `CancellationReason`) | да | `DELETE` | |
| reservation `RELEASED` при живом событии (коллизия `PAID_REQUIRES_RESOLUTION`, admin-отмена) | да | `DELETE` + audit `GCAL_PUSH` (kind=delete) | путь из аудиторского BLOCKER-2 |
| `UNDERPAID` / `PAYMENT_PENDING` / `PAYMENT_EXPIRED` | — | `NOOP` | push только на `BOOKED` |
| перенос (`scheduleVersion` ↑) | да | `PATCH` времени | |
| повтор любого перехода (реплей) | да | идемпотентно: upsert по `extendedProperties.undresellerOrderId` | ноль дублей |

## 3. Push-канал

- Асинхронно через outbox-инфраструктуру 004 (Inngest): сбой GC **никогда** не срывает бронь (fail-open, SC-006).
- Push-latency бюджет: ≤60 с p95 от перехода FSM.
- **Идемпотентное удаление (F3)**: при вызове `deleteEvent`, если Google API возвращает HTTP 404 (Not Found) или HTTP 410 (Gone), либо поиск по `extendedProperties.private.undresellerOrderId` не вернул события, операция завершается успехом (идемпотентный NOOP) с audit-следом `GCAL_PUSH` (kind=delete, status=already_deleted), без ретраев и без перехода в fail.
- Ошибки: `ReauthRequiredError` (401/`invalid_grant`) → `status = NEEDS_REAUTH` + алерт; `RateLimitedError` (429/403) → экспоненциальный бэкофф outbox-шейпинга; прочие 5xx → ретрай.

## 4. Sync-канал (FR-603)

- Цикл 15 мин per-подключение; **гранулярный advisory lock** `pg_try_advisory_xact_lock(hashtext('gcal_sync_' || credential.id))` — per-credential изоляция (F5: мастера не блокируют друг друга).
- `events.list({ syncToken, timeMin: now })` → дельта:
  - **Фильтрация собственных событий (F2)**: события, содержащие `extendedProperties.private.undresellerOrderId`, **строго игнорируются** и в `ExternalBusyBlock` не сохраняются (предотвращает ложную самоблокировку слотов при отменах и переносах).
  - Сторонние события: занятое (не `cancelled`, не `transparency:'transparent'`) → upsert `ExternalBusyBlock`; удалённое/освобождённое → delete по `(calendarId, gcEventId)`.
- `410 Gone` (истёк syncToken) → полный sync окна 30 дней вперёд (drop+reload, upsert-дедуп, с той же фильтрацией собственных событий).
- Пачки ≤50 событий; нормализация в UTC до записи; запрет сравнения наивных дат.

## 5. Consumer-driven contract tests (T021/T022, stubbed SDK)

| Сценарий | Ожидание |
|---|---|
| `BOOKED` первый раз | `CREATE`, в ответе gcEventId; Meet только при флаге |
| повторный `BOOKED` (реплей) | ровно одно событие (upsert) |
| `CANCELLED` после CREATE | `DELETE`, audit записан |
| коллизия → `RELEASED` при живом событии | `DELETE` + audit |
| `deleteEvent` при 404/410 от Google | NOOP (успех без retry/fail), audit `status=already_deleted` |
| `PAYMENT_PENDING` → ничего | `NOOP` |
| синхронный залп ×20 одинаковых переходов | 1 событие (идемпотентность push) |
| sync: 3 новых + 1 удалённое событие | +3/-1 busy-блоки |
| sync: событие с `undresellerOrderId` (своя бронь) | игнорируется, 0 записей в `ExternalBusyBlock` |
| sync: `410 Gone` | полный sync, upsert-дедуп, `nextSyncToken` обновлён |
| sync: N=0 изменений | 0 записей, `lastSyncAt` обновлён |
| sync: событие `transparency:'transparent'` | не импортируется |
| `invalid_grant` на push/sync | `NEEDS_REAUTH` + алерт, броня живёт |
| token refresh event | коллбэк обновляет токены в `IntegrationCredential.encryptedPayload` |
| другой ресурс: занятость A | слоты B не тронуты (изоляция per-resource) |
| Meet при `remoteMeetingEnabled=false` | `conferenceData` не передаётся |

## 6. STRIDE-примечание

Spoofing: state-CSRF на connect; Tampering: AES-256-GCM auth-tag; Repudiation: audit-события канона 004; Disclosure: deny-list +4 ключа, busy без ПДн; DoS: advisory lock + пачки ≤50 + бэкофф; Elevation: OWNER-gate, GC не мутирует БД.

# T062: Quickstart Tracer — прогоны (evidence)

**Дата**: 2026-10-31 · **Коммит**: Phase 1–5 + Phase 7 (T001..T061)
**Статус**: ⏳ PENDING MANUAL RUN — трейсер требует живого Google Cloud test-проекта (OAuth consent + реальный календарь) и не автоматизируется в CI.

## Что верифицировано автоматикой (unit/contract, stubbed SDK)

| Шаг трейсера | Покрытие |
|---|---|
| 2. Push идемпотентность | gcal-sync.test.ts (extendedProperties marker, upsert), gcal-mapping.test.ts (реплеи → 1 событие) |
| 4. Import + фильтрация своих событий | gcal-sync.test.ts (F2 strictly ignored; transparent/cancelled skip) |
| 6. Reauth fail-open | gcalPush ReauthRequiredError → NEEDS_REAUTH, бронь живёт (path-тест) |
| 9. ICS валидность | ics-builder.test.ts (RFC 5545 структура, TZID, UID-стабильность, CRLF folding) |
| 10. zod: npm audit 0 H/C | T051/T052: audit exit 0; 51 suites / 418 tests green; снапшоты 400-форм идентичны |

## Что требует ручного прогона (чек-лист)

1. Connect (реальный OAuth consent) → статус CONNECTED; `encryptedPayload NOT LIKE 'v1:%'` → 0 строк.
2. Бронь → событие в GC ≤60 с (хронометраж → NFR-602b evidence).
3. Replay того же перехода → 1 событие (глазами в GC).
4. Стороннее событие GC → слот исчез ≤15 мин; busy-строка в ExternalBusyBlock.
5. Reauth: отзыв доступа → NEEDS_REAUTH + баннер.
6. ICS: письмо с .ics → импорт в GC открывает событие с TZID.
7. **TC-GCAL-043**: full-sync 120 событий → RSS до/пик/после → `evidence/gcal-memory.md` (гейт ≤500 MB NFR-601).

Прогнать на свежем клоне до QA-signoff; результаты приложить в этот файл.

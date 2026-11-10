# SpecKit Review: 006-waitlist-autofill

**Reviewer**: antigravity
**Reviewed at**: 2026-11-10T21:00:00Z
**Commit**: 725ce8dff9ff94f1f3772b1e44b5aae1c02d8040 / rev 1.2
**Artifacts reviewed**: spec.md (rev 1.2), plan.md, tasks.md, research.md (D1–D8), requirements-audit.md (PASS run #3), reviews/analyze.md (run #2), qa/ (preliminary-rtm.md, rtm-matrix.md, test-cases.md, regression-suite.md, uat-scenarios.md), .specify/memory/constitution.md (v1.10.1), undreplans/docs/projects/undreseller/undreseller-business-plan.md (v2.7.0)

## Summary

Пакет спецификации `006-waitlist-autofill` (Smart Waitlist поверх фундамента 001–005) подвергнут независимому состязательному аудиту (adversarial probe) по 14 измерениям SpecKit (A–N) со сквозной сверкой с кодовой базой (`src/lib/booking/bookingService.ts`, `src/jobs/holdSweep.ts`, `src/jobs/bookingEmail.ts`, `src/components/booking/AcknowledgeClient.tsx` и `src/payload.config.ts`).

Аудит выявил **13 находок** (4 CRITICAL, 5 HIGH, 3 MEDIUM, 1 LOW), включая риски подмены слота клиентом при claim, перекрытие catch-all роутов Payload админки, сбои предоплатных броней при отсутствии email и каскадный спам очереди при отказе 409 на уже занятый слот. Все 13 замечаний полностью устранены в спецификации rev 1.2, плане, задачах, исследовании решений (D1–D8) и сьюте тестов. Пакет спецификации полностью вычищен, согласован и готов к реализации.

## Findings & Resolutions

| ID | Severity | Area | Finding | Resolution (Rev 1.2) | Status |
| --- | --- | --- | --- | --- | --- |
| F1 | CRITICAL | Architecture / Security | В схеме БД, HMAC и URL отсутствовала привязка к координатам слота (`startTime`/`endTime`) — эндпоинт claim не знал время брони либо допускал подмену времени клиентом. | В коллекцию `WaitlistEntries` добавлены поля `notifiedSlotStart` и `notifiedSlotEnd` (D4, T610); `slotStartIso` включён в HMAC-токен (D2, T611); в `POST /api/waitlist/[entryId]/claim` время слота читается строго из строки БД (D1, T621). | **RESOLVED** |
| F2 | CRITICAL | Architecture / Route Shadowing | Слаг коллекции `'waitlist'` конфликтовал с кастомными эндпоинтами `src/app/api/waitlist/*`, блокируя запросы админки к Payload REST API (`405 Method Not Allowed`). | Коллекции присвоен слаг `'waitlist-entries'` (таблица `waitlist_entries`, файл `WaitlistEntries.ts`, D7, T610), а публичные эндпоинты сохранены на `/api/waitlist`. | **RESOLVED** |
| F3 | CRITICAL | Domain Logic / Email | Опциональный `email` в `US1` при `email-only MVP` приводил к появлению недостижимых записей в top-5 и падению `createBooking` с `422 EMAIL_REQUIRED` на услугах с предоплатой. | Поле `email` зафиксировано как обязательное при `join` (`US1`, `FR-601`, `T610`, `WaitlistJoinForm.tsx`). | **RESOLVED** |
| F4 | CRITICAL | FSM / Concurrency | Спецификация требовала вызывать `auto-advance` следующему кандидату при `409 SLOT_TAKEN`, что приводило к каскадному спаму по занятому слоту. | Зафиксирован строгий инвариант: при `409 SLOT_TAKEN` auto-advance НЕ вызывается (слот занят). Проигравшие возвращаются в `status = 'waiting'` (re-arm). Auto-advance вызывается ТОЛЬКО если слот свободен при истечении 30m TTL в sweep или при `unsubscribe` (D4, T621, TC-006-010). | **RESOLVED** |
| F5 | HIGH | Logical Consistency | В `spec.md` оставались артефакты от rev 1.0 (заглушка `x` в §1.2, упоминания «10m HOLD» и Telegram в MVP). | В `spec.md` заполнен раздел §1.2, формулировки приведены к единому стандарту `FSM CREATE_BOOKING` (`FREE->CONFIRMED`, `PREPAID->HELD 15m`) и `email-only MVP`. | **RESOLVED** |
| F6 | HIGH | Architecture / Integration | Были учтены только 4 точки `RELEASED` вместо 6 фактических (пропущены `cancelBookingByClientChat` 004 и `payment_intent.payment_failed` 003), а SQL не выбирал все поля. | Все 6 точек перехода в `RELEASED` зафиксированы в `plan.md`, `research.md` (D3) и `tasks.md` (T620); SQL-запросы дополнены `RETURNING resource_id, item_id, start_time, end_time`. | **RESOLVED** |
| F7 | HIGH | Cron / Operational | `waitlist-sweep` был запланирован `daily`, что блокировало 30-минутный TTL кампаний на 24 часа. | Расписание `waitlist-sweep` изменено на каждые 5 минут (`*/5 * * * *`, D8, T630); задача и коллекция зарегистрированы в `src/payload.config.ts`. | **RESOLVED** |
| F8 | HIGH | Domain Logic / Edge Cases | Отсутствовали проверки горизонта `expiresAt` и фильтрация прошедших слотов при отмене. | В `FR-601`/`T610` добавлена валидация `now < expiresAt <= now + 60d`. В `notifySlotFreed`/`waitlist-match` слоты с `slotStart <= now` игнорируются, а кандидаты фильтруются по `expiresAt >= slotStart` (D3, T620). | **RESOLVED** |
| F9 | HIGH | UX / Concurrency | Отсылка к `AcknowledgeClient` ошибочно трактовала `409` как успех для проигравших кандидатов в очереди. | Отсылка к `AcknowledgeClient` удалена; при `409` claim-страница отображает честный отказ; победитель использует детерминированный `idempotencyKey` (D6, T622). | **RESOLVED** |
| F10 | MEDIUM | Token Security | Токен отписки разделял 30-минутный TTL кампании с claim-токеном, делая отписку невозможной после истечения слота. | В `claimToken.ts` разделены `claimToken` (TTL 30m с привязкой слота) и `unsubscribeToken` (валиден на весь жизненный цикл записи, D2, T611). | **RESOLVED** |
| F11 | MEDIUM | Security & Compliance | Отсутствовали проверка по `Blacklist` при `join`, защита системных полей коллекции и GDPR-очистка. | Добавлена проверка по коллекции `Blacklist` (403); системные поля закрыты `access: () => false`; в `gdprPurge.ts` добавлена очистка терминальных записей > 90 дней (D8, T610, T630). | **RESOLVED** |
| F12 | MEDIUM | Commercial Sync | В бизнес-плане v2.7.0 номер 006 был отведён под ЮKassa, что создавало расхождение нумерации. | Зафиксирована согласованная нумерация: 006 = `waitlist-autofill`, 007 = `yookassa-adapter`. | **RESOLVED** |
| F13 | LOW | Performance & Typing | Отсутствовали композитные индексы для матчинга и кап-проверок, а `logDelivery` требовал расширения типа. | Добавлены индексы `(resource_id, service_id, status)` и `(phone, status)` в `T610`; типизация `logDelivery` в `resendAdapter.ts` расширена на `kind: 'confirmation' | 'reminder' | 'waitlist'`. | **RESOLVED** |

## Commercial / business plan notes

- **Plans loaded**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.7.0 (`cad0f22`).
- **Focus laws / SKU floors checked**:
  - Нумерация дорожной карты синхронизирована (006 = Waitlist, 007 = ЮKassa);
  - Правило Scope Knife («ровно 1 внешняя бизнес-интеграция») строго соблюдено: 0 новых внешних сервисов, 0 новых npm-пакетов;
  - Функционал напрямую монетизирует No-Show потери ($1,500–$4,000/мес у Primary ICP).
- **Drift**:
  - Отсутствует. Бизнес-план и спецификация полностью гармонизированы.

## Alternative approaches considered

1. **Привязка координат слота (`notifiedSlotStart/End`) vs Ссылка на `reservationId`**:
   Прямое хранение времени и включение `slotStart` в HMAC исключает необходимость подгружать освободившуюся бронь из архива и обеспечивает мгновенный вызов `bookingService.createBooking`.
2. **Мгновенный re-arm со-кандидатов партии при claim**:
   Возврат остальных 4 записей партии в `waiting` в момент победы первого кандидата сохраняет FIFO-очередь активной для следующих освобождений без ожидания 30-минутного крона.
3. **Строгий запрет auto-advance при 409**:
   Полностью устраняет риск «лавины писем» по уже занятому слоту, направляя уведомления следующим кандидатам только когда слот действительно свободен.

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-11-10T21:00:00Z
commit: 725ce8dff9ff94f1f3772b1e44b5aae1c02d8040
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

# Implementation Plan: 006 (006-waitlist-autofill)

> "Очередь — это труба, в которой вода сама находит свободный стояк, но только если кран опломбирован HMAC-ом, а при гидроударе 409 насос не заливает соседей." — Валера

**Branch**: `main` (single-branch lineage — IX-девиация) | **Date**: 2026-11-10 | **Spec**: rev 1.2 (post-antigravity review fixes F1–F13)
**Input**: spec rev 1.2 + requirements-audit (rev 1.2) + research.md (D1–D8) + план v2.7.0

## Summary

Smart Waitlist:
1. Публичный `POST /api/waitlist` с валидацией (name, phone, обязательный email в MVP, `now < expiresAt <= now + 60d`), проверкой `Blacklist` (403), капом 3/телефон и защитой от дублей (409);
2. Коллекция `WaitlistEntries` со слагом `waitlist-entries` (исключает route shadowing) и композитными индексами `(resource_id, service_id, status)` и `(phone, status)`;
3. Триггеры на все 6 точек `RELEASED` (с проверкой `slotStart > now`) -> Payload Job `waitlist-match` -> FIFO top-5 -> фиксация `notifiedSlotStart/End` в БД -> email с подписанной claim-ссылкой (`HMAC(campaignCount:entryId:slotStartIso)`, TTL 30 мин) и unsubscribe-ссылкой;
4. Claim через `bookingService.createBooking` (FREE->CONFIRMED, PREPAID->HELD 15m) со временем слота строго из БД. При победе — остальные кандидаты re-arm в `waiting`; при 409 — честный отказ и re-arm проигравшего БЕЗ ложного auto-advance;
5. Payload Job `waitlist-sweep` каждые 5 минут (`*/5 * * * *`) для re-arm и камп-капа 3, с auto-advance только на действительно свободные слоты;
6. GDPR 90d purge в `gdprPurge.ts`.

## Technical Context

**Language/Version**: Next.js 16 + Payload 3.93 + React 19 + PostgreSQL 16. **Testing**: vitest int (join, blacklist, FIFO, race x100, sweep 5m, auto-advance rules, PII-grep). **New deps**: 0 (NFR-602). **Storage**: новая коллекция `WaitlistEntries` (слаг `waitlist-entries`) + расширение `EmailDeliveryLog.kind` enum на `'waitlist'`.

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS/N/A | без изменений |
| VI | ON TRACK | analyze + antigravity review fixes; >=2 external PASS до implement |
| VII | PASS | теги батчем (`review/006-waitlist-autofill/v1`) |
| VII-B | PASS | план v2.7.0 (006 waitlist, 007 ЮKassa — нумерация синхронизирована) |
| IX | DEVIATION (lineage) | как 001–005 |
| X | PASS | additions-only (новая коллекция + enum-значение) |
| XI | PASS | 0 спайков |
| XII | **ON TRACK — money-adjacent** | FR-603 Risk=20 -> STM+DT+EG+UAT обязательны |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
src/collections/WaitlistEntries.ts       # NEW: слаг waitlist-entries, поля (name/phone/email/serviceId/resourceId/status/campaignCount/activeCampaignAt/notifiedSlotStart/notifiedSlotEnd), композитные индексы, adminOnly доступ
src/lib/waitlist/waitlistService.ts      # NEW: join (blacklist/кап/дубли), notifySlotFreed (6 точек RELEASED, slotStart > now), match (FIFO top-5), claim (FSM через bookingService, time from DB, auto-advance guard), sweep (5m, auto-advance on free slots)
src/lib/waitlist/claimToken.ts           # NEW: HMAC claimToken(slotStartIso) + unsubscribeToken, timing-safe
src/app/api/waitlist/route.ts            # NEW: POST join (rate limit, валидация)
src/app/api/waitlist/[entryId]/claim/route.ts   # NEW: POST claim (HMAC+status guard -> FSM)
src/app/api/waitlist/[entryId]/route.ts  # NEW: DELETE unsubscribe (unsubToken guard -> cancelled + auto-advance if slot was active)
src/jobs/waitlistMatch.ts                # NEW: Payload Job — матчинг + письма (D3)
src/jobs/waitlistSweep.ts                # NEW: Payload Job cron */5 * * * * — expired/re-arm/auto-advance (D4, D8)
src/collections/EmailDeliveryLog.ts      # MOD: kind select += 'waitlist'
src/lib/email/resendAdapter.ts           # MOD: logDelivery typing kind += 'waitlist'
src/lib/booking/bookingService.ts        # MOD: RETURNING resource_id, item_id, start_time, end_time и вызов notifySlotFreed() во всех 5 точках RELEASED
src/jobs/holdSweep.ts                    # MOD: RETURNING resource_id, item_id, start_time, end_time и вызов notifySlotFreed() в 6-й точке RELEASED
src/jobs/gdprPurge.ts                    # MOD: удаление терминальных waitlist_entries старше 90 дней
src/payload.config.ts                    # MOD: регистрация WaitlistEntries в collections и waitlistSweepTask в jobs.tasks
src/app/(app)/book/[slug]/page.tsx       # MOD: SlotGrid передача контекста для формы ожидания
src/components/booking/WaitlistJoinForm.tsx  # NEW: инлайн-форма подписки (name, phone, email обязателен)
src/app/(app)/book/waitlist-claim/page.tsx   # NEW: claim-страница (детали слота, явный Confirm, честное сообщение при 409, кнопка отписки)
tests/int/waitlist.int.spec.ts           # NEW: сьют тестов (join/blacklist/FIFO/claim-гонка x100/sweep 5m/no-spam-on-409/PII)
```

## Threat Modeling (STRIDE)

- **S (Spoofing)**: HMAC-токен с привязкой к версии кампании, entryId и `slotStartIso` (клиент не может подделать время брони); timingSafeEqual; rate limit на join; OWNER-only админка.
- **T (Tampering)**: время слота читается сервером строго из `notifiedSlotStart` в БД; статус-мутации через атомарные CAS-запросы; бронь через `bookingService` под advisory lock + GiST.
- **R (Repudiation)**: аудит-события `waitlist.join`, `waitlist.notified`, `waitlist.converted`, `waitlist.expired`, `waitlist.cancelled`.
- **I (Information Disclosure)**: токены без открытого PII; адреса в `EmailDeliveryLog` хешируются солью `PAYLOAD_SECRET`; закрытие доступа к системным полям коллекции.
- **D (Denial of Service)**: rate limit 10/60s; кап 3 записей на телефон; фильтрация Blacklist; Payload Job буферизует пики отмен; камп-кап 3 предотвращает зацикливание.
- **E (Elevation of Privilege)**: коллекция `waitlist-entries` защищена `adminOnly`; слаг `waitlist-entries` не перекрывает REST API.

## Rollback

Additions-only: новая коллекция `WaitlistEntries`, новые роуты и джобы. Вызовы `notifySlotFreed` в точках RELEASED изолированы try/catch и не блокируют основные транзакции бронирования. Откат = git revert.

## Risks

| Риск | Вер-ть | Митигация |
|---|---|---|
| Notify-цикл (hold-expiry <-> match) | низкая | камп-кап 3 (D4) + sweep 5m re-arm |
| Каскадный спам при 409 | устранено (F4) | при 409 слот занят -> auto-advance НЕ вызывается |
| Подмена слота клиентом при claim | устранено (F1) | `slotStart` читается из БД + подписан в HMAC |
| Конфликт URL админки и API | устранено (F2) | слаг коллекции `waitlist-entries` |
| Кража слота витриной | средняя | честная семантика first-to-claim; понятное сообщение при 409 |

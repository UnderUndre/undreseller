# Implementation Plan: 006 (006-waitlist-autofill)

> "Очередь — это труба, в которой вода сама находит свободный стояк." — Валера

**Branch**: `main` (single-branch lineage — IX-девиация) | **Date**: 2026-11-10 | **Spec**: rev 1.1 (audit PASS run #2)
**Input**: spec rev 1.1 + requirements-audit (PASS run #2) + research.md (D1–D6) + план v2.7.0

## Summary

Smart Waitlist: (1) публичный join с кап-анти-спамом (3/телефон, дубли 409); (2) триггер на RELEASED → Payload Job `waitlist-match` → FIFO top-5 → email с claim-ссылкой (HMAC, TTL 30 мин); (3) claim = FSM `CREATE_BOOKING` (FREE→CONFIRMED / PREPAID→HELD 15m) через bookingService — гонка закрыта advisory+GiST каноном; проигравшие → auto-advance; (4) sweep — expired/re-arm с камп-капом 3; (5) unsubscribe + OWNER-коллекция. Ноль новых deps, ноль новых внешних сервисов.

## Technical Context

**Language/Version**: без изменений (001–005 фундамент). **Testing**: vitest int (join-матрица, FIFO, claim-гонка ×100, lifecycle, PII-grep). **New deps**: 0 (NFR-602). **Storage**: новая коллекция `Waitlist` (+ EmailDeliveryLog.kind enum + 'waitlist' — additions-only).

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS/N/A | без изменений от 005 |
| VI | ON TRACK | analyze + внутренние ревью; ≥2 external до implement |
| VII | PASS | теги батчем на коммите контура |
| VII-B | PASS | план v2.7.0 без дельты (waitlist не трогает ICP/цены/рельсы) |
| IX | DEVIATION (lineage) | как 001–005 |
| X | PASS | additions-only (новая коллекция + enum-значение) |
| XI | PASS | 0 спайков |
| XII | **ON TRACK — money-adjacent** | FR-603 Risk=20 → STM+DT+EG+UAT обязательны |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
src/collections/Waitlist.ts              # NEW: entry (name/phone/email/service/resource/status/campaignCount/...)
src/lib/waitlist/waitlistService.ts      # NEW: join (кап/дубли), notifySlotFreed (матчинг FIFO top-5), claim (FSM через bookingService), lifecycle
src/lib/waitlist/claimToken.ts           # NEW: вычислимый HMAC с солью кампании (канон 005)
src/app/api/waitlist/route.ts            # NEW: POST join (rate limit, валидация)
src/app/api/waitlist/[entryId]/claim/route.ts   # NEW: POST claim (HMAC+status guard → FSM)
src/app/api/waitlist/[entryId]/route.ts  # NEW: DELETE unsubscribe (token)
src/app/api/admin/waitlist/[entryId]/route.ts   # NEW: OWNER list-детали (опц.)
src/jobs/waitlistMatch.ts                # NEW: Payload Job — матчинг + письма (D3)
src/jobs/waitlistSweep.ts                # NEW: Payload Job daily — expired/re-arm (D4)
src/collections/EmailDeliveryLog.ts      # MOD: kind += 'waitlist'
src/lib/booking/bookingService.ts        # MOD: notifySlotFreed() вызов из точек RELEASED (cancel/PI-fail/hold-expiry/reject)
src/app/(app)/book/[slug]/page.tsx       # MOD: SlotGrid получает флаг пустоты → WaitlistJoinForm
src/components/booking/WaitlistJoinForm.tsx  # NEW: инлайн-форма подписки
src/app/(app)/book/waitlist-claim/page.tsx   # NEW: claim-страница (явный Confirm, D6)
tests/int/waitlist.int.spec.ts           # NEW: join-матрица/FIFO/claim-гонка ×100/lifecycle/PII
```

## Threat Modeling (STRIDE)

- **S**: вычислимый HMAC claim-токен; rate limit на join; OWNER-only админ. **T**: claim через единственный status-writer (advisory+GiST); CAS-переходы статусов записи. **R**: audit `waitlist.join/converted/expired/unsubscribed`. **I**: токен без PII; письма — услуга/время; дени-лист. **D**: job-очередь буферизует пики отмен; кап-кампаний против циклов. **E**: join публичный (rate limit + кап), мутации статусов — только сервис.

## Rollback

Additions-only: новая коллекция/роуты/джобы; release-точка получает один вызов notifySlotFreed (best-effort, try/catch); откат = git.

## Risks

| Риск | Вер-ть | Митигация |
|---|---|---|
| Notify-цикл (hold-expiry↔match) | низкая | камп-кап 3 (D4) + sweep re-arm |
| Claim-гонка с витриной | средняя | advisory+GiST канон 002 — тест ×100; проигравший → auto-advance |
| Спам-подписки ботом | низкая | rate limit + кап 3/телефон + expiresAt |
| Письмо уходит медленнее, чем слот займут | средняя | честная семантика: first-to-claim; в письме «слот может быть уже занят» |

## Next

`/speckit.tasks` — выполнено: 6 задач, 3 lane'а (см. tasks.md).

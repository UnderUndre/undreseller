# Implementation Plan: 007 (007-booking-trust-gate)

> "Дверь без замка — это не дверь, а дыра с претензиями." — Валера

**Branch**: `main` (single-branch lineage — IX-девиация) | **Date**: 2026-11-11 | **Spec**: rev 1.1 (audit PASS run #2)
**Input**: spec rev 1.1 + requirements-audit (PASS run #2) + research.md (D1–D7) + план v2.7.1

## Summary

Trust Gate: (1) коллекция `booking-intents` + двухфазный `POST /api/booking` (OTP HMAC + attempts≤5 + future-slot guard + кап 2 live/email); (2) honeypot на booking/waitlist формах (silent 200 + audit + a11y); (3) waitlist double-opt-in (`pending` → confirm-письмо → `waiting`, relay-guard в матчинге); (4) intent lifecycle sweep (expired/purged); (5) repeat-client allowlist (skip OTP по verified-истории); (6) documented seams code review. FSM 001/002 не тронут — интент не бронь.

## Technical Context

**Language/Version**: без изменений (001–006 фундамент). **Testing**: vitest int (OTP-матрица, brute-force guard, honeypot, double-opt-in, allowlist, PII) + fake-Resend наслоение (канон 006). **New deps**: 0. **Storage**: новая коллекция `booking-intents` (additions-only).

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS/N/A | без изменений от 006 |
| VI | ON TRACK | analyze + внутренние ревью; ≥2 external до implement |
| VII | PASS | теги батчем на коммите контура |
| VII-B | PASS | план v2.7.1 без дельты (защита инвентаря, не ICP/цены/рельсы) |
| IX | DEVIATION (lineage) | как 001–006 |
| X | PASS | additions-only (новая коллекция) |
| XI | PASS | 0 спайков |
| XII | **ON TRACK — calendar-integrity** | FR-702 Risk=20 → STM+DT+EG+UAT обязательны |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
src/collections/BookingIntents.ts        # NEW: slug booking-intents (F2-канон именования), adminOnly, system fields closed
src/lib/waitlist/../intents/intentService.ts  # NEW: createIntent (future-guard, кап 2, advisory hashtext), verifyIntent (HMAC+attempts), consumeIntent
src/lib/booking/otp.ts                   # NEW: генерация 6-значного кода + HMAC + timing-safe verify (канон tokens.ts)
src/app/api/booking/route.ts             # MOD: two-phase (D3), honeypot check
src/app/api/waitlist/route.ts            # MOD: honeypot check + join → pending
src/lib/waitlist/waitlistService.ts      # MOD: join → pending (вместо waiting), confirmWaitlistEntry (opt-in)
src/app/api/waitlist/[entryId]/confirm/route.ts  # NEW: double-opt-in confirm (HMAC, TTL 48h)
src/jobs/intentSweep.ts                  # NEW: Payload Job 5m — expired intents, GDPR 30d purge (совместно с gdprPurge)
src/jobs/waitlistJobs.ts                 # MOD: sweep pending>48h → expired
src/components/booking/BookingFormOTP.tsx  # NEW: OTP-шаг в форме брони (ввод кода, resend)
src/components/booking/SlotGrid.tsx      # MOD: honeypot-поле + OTP-шаг
src/components/booking/WaitlistJoinForm.tsx  # MOD: honeypot-поле + «подтвердите email» сообщение
src/app/(app)/book/waitlist-confirm/page.tsx  # NEW: double-opt-in landing
src/app/(payload)/admin/...              # adminOnly-канон, ничего кастомного
tests/int/trust-gate.int.spec.ts         # NEW: OTP-матрица/brute-force/honeypot/opt-in/allowlist/PII
```

## Threat Modeling (STRIDE)

- **S**: OTP HMAC-only; интент-токены timing-safe; honeypot silent. **T**: attempts≤5 гейт; CAS consumed; слот-время строго из БД интента. **R**: audit `intent.created/consumed/dead`, `honeypot.hit`, `waitlist.optin`. **I**: коды HMAC; письма — код+услуга; purge 30d. **D**: rate limit фазы 1 (3/10min per email+IP); job-канон. **E**: гейт только на публичных роутах; Local API не тронут.

## Rollback

Additions-only: новая коллекция/роут-ветки/компоненты; `POST /api/booking` двухфазность за флагом фазы (отсутствие intentId = старый однопазный контракт для service-вызовов... нет — публичный роут: absence of otp → 202 intent; откат = git revert route + collection).

## Risks

| Риск | Вер-ть | Митигация |
|---|---|---|
| Двухфазность режет конверсию | средняя | allowlist repeat-client (FR-706); OTP-шаг в той же форме (без перехода письма→страницы) |
| Resend latency при OTP | низкая | TTL 10m; resend ≤3/10min; job-retry канон |
| Concurrent verify | низкая | CAS consumed + advisory |
| OTP-письмо в спаме | средняя | runbook: проверка папки; resend-кнопка; Resend-домен — qa-signoff |

## Next

`/speckit.tasks` — выполнено: 7 задач, 3 lane'а (см. tasks.md).

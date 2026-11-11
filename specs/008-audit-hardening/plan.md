# Implementation Plan: 008 (audit-hardening)

> "Течь не там, где капает, а там, где прорвёт." — Валера

**Branch**: `main` (single-branch lineage — IX-девиация) | **Date**: 2026-11-12 | **Spec**: rev 1.0 (requirements-audit PASS run #1)
**Input**: spec rev 1.0 + requirements-audit PASS + два аудита (code-review 48 / security 33) + план v2.7.1 (без дельты)

## Summary

Харденинг 001–007 по обоим аудитам: (1) полная миграция + CI fresh-migrate smoke; (2) серверный idempotencyKey (A01 IDOR закрыт); (3) server-side привязка карточка↔чат в Telegram staff-контуре; (4) webhook CAS + job без секретов + refund CAS + amount-сверка; (5) grid-валидация trust-cookie пути; (6) UX-тупики воронки (локальное время, контраст, OTP-выход, honest confirm-order, login copy, stale grid); (7) release-гейты: e2e под OTP-контракт, route-тест-матрица, error-shapes снапшот; (8) инфра: закрытый Postgres, security headers, fail-closed IP, boot-guard, availability RL+кэш, graphql off в prod; (9) GDPR-анонимизация >90д + JSON-LD escape.

## Technical Context

**Language/Version**: без изменений (001–007 фундамент). **Testing**: vitest int (route-матрица по calendar-feed канону, STM webhook/refund, BVA idempotency) + e2e переписанный под OTP-контракт + OTP-хелпер (HMAC-подбор по env-секрету, ноль правок прод-кода). **New deps**: 0. **Storage**: additions-only миграция (создание недостающего, без rename/drop).

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS/N/A | без изменений от 007 |
| VI | ON TRACK | analyze + internal re-check; ≥2 external до implement (или owner override) |
| VII | PASS | теги батчем на коммитах контура (spec/req-audit/clarify уже поставлены) |
| VII-B | PASS | план v2.7.1 без дельты (hardening, waiver по прецеденту 002/003/004) |
| IX | DEVIATION (lineage) | как 001–007 |
| X | PASS | additions-only миграция; ни одного rename/drop |
| XI | PASS | 0 спайков |
| XII | **ON TRACK — money-path integrity** | FR-804 Risk 15 → STM обязательны |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
src/migrations/20261112_complete_domain_schema.ts  # NEW: все доменные таблицы/enum-значения/колонки 002–007 (IF NOT EXISTS-идемпотентность) — F-BE-01
src/lib/booking/bookingService.ts                  # MOD: findBookingByIdempotencyKey email-guard (F-BE-02), webhook CAS rowCount + re-read (F-BE-03), job input без секретов (F-BE-05), refund CAS (SEC-A-05), charge.refunded amount-сверка (SEC-A-15), reschedule grid — нет (бэклог)
src/app/api/booking/route.ts                       # MOD: серверный idempotencyKey (детерминированный, клиентский игнорируется), grid-валидация trust-cookie пути (SEC-A-08)
src/app/api/waitlist/[entryId]/claim/route.ts      # MOD: делегация в claimWaitlistEntry, клиентский key удалён (F-BE-12)
src/lib/booking/refundService.ts                   # MOD: транзакция + CAS status='refunding' (SEC-A-05/F-BE-06)
src/jobs/bookingEmail.ts + bookingService.queue    # MOD: input без токенов — джоба CAS-генерит одноразовые линки сама (F-BE-05)
src/lib/telegram/staffBot.ts                       # MOD: card→chat server-side binding, auth-denied на mismatch (F-BE-04), complete через FSM (SEC-A-06)
src/lib/telegram/staffAuth.ts                      # MOD: удаление тавтологии L3
src/lib/telegram/staffCard.ts                      # MOD: сохранение chat-binding в outbox metadata при отправке карточки
src/lib/telegram/clientBot.ts                      # MOD: acknowledge tg_links-гейт (SEC-A-07)
src/components/booking/SlotGrid.tsx                # MOD: catch в submit (F-UX-04), setSlots([]) при ошибке (F-UX-17), onBack прокид
src/components/booking/BookingFormOTP.tsx          # MOD: onBack «Выбрать другой слот», autoFocus (F-UX-03)
src/components/checkout/ConfirmOrder.tsx           # MOD: error-экран + retry (F-UX-05)
src/components/booking/LocalTime.tsx               # NEW: client-side time render (suppressHydrationWarning) — F-UX-01
src/app/(app)/book/confirmation/[id]/page.tsx      # MOD: LocalTime
src/app/(app)/book/waitlist-claim/page.tsx         # MOD: LocalTime + RU-копия invalid-link (F-UX-07 частично)
src/app/(app)/login/page.tsx                       # MOD: customer-копия без админ-линка (F-UX-06)
src/app/(app)/globals.css                          # MOD: --error/--success контраст 4.5:1 (F-UX-02) + cursor-pointer базовый слой (F-UX-11 дёшево)
next.config.ts                                     # MOD: headers() CSP/XFO/XCTO/Referrer-Policy + poweredByHeader:false (SEC-B-02)
docker-compose.yml                                 # MOD: 127.0.0.1:5432 bind + ${POSTGRES_PASSWORD:?err} (SEC-B-01)
src/lib/security/rateLimiter.ts                    # MOD: clientIpFrom fail-closed (SEC-A-01/B-18), вызов assertSingleInstance на boot (SEC-A-03)
src/app/api/availability/route.ts                  # MOD: checkRateLimit + кэш (SEC-B-05)
src/lib/availability/slotCache.ts                  # NEW: in-memory TTL-кэш (15-30с, bounded — канон rateLimiter)
src/payload.config.ts                              # MOD: graphql.disable() в prod (SEC-B-03)
src/jobs/gdprPurge.ts                              # MOD: анонимизация customer_* в orders/slot_reservations >90д (SEC-B-08)
src/app/(app)/products/[slug]/page.tsx             # MOD: JSON-LD </script> escape (SEC-B-09)
tests/int/booking-route.int.spec.ts                # NEW: HTTP-матрица двухфазности (F-TQ-02/04)
tests/int/trust-gate.int.spec.ts                   # MOD: route-тесты trust-cookie + honeypot HTTP (F-TQ-03/04)
tests/int/error-shapes.int.spec.ts                 # MOD: каталог 007 (F-TQ-05) + TTL-ветка opt-in (F-TQ-06)
tests/e2e/booking.e2e.spec.ts                      # MOD: переписан под OTP-контракт (F-TQ-01)
tests/helpers/otpFromDb.ts                         # NEW: OTP-код из БД HMAC-подбором (e2e, без правок прод-кода)
.specify/…/ci или workflow-заметка                 # fresh-migrate+smoke гейт (US1) — по факту репо (script/checklist)
```

## Threat Modeling (STRIDE)

- **S**: card↔chat server-side binding; idempotencyKey детерминирован от email+услуга+слот; OTP HMAC канон не трогается. **T**: webhook CAS+re-read; refund CAS; amount-сверка charge.refunded; JSON-LD escape. **R**: анонимизация сохраняет audit-историю; намеренно ноль новых audit-типов. **I**: accessToken не логируется; job input без секретов; GDPR-анонимизация; security headers (Referrer-Policy). **D**: availability RL+кэш; fail-closed IP; graphql off. **E**: auth-denied на чужой chat; acknowledge tg_links-гейт; complete через FSM.

## Rollback

Additions-only миграция откатывается revert'ом файла миграции; каждый US — изолированный блок коммитов (1 US = 1 commit) → точечный revert без каскада. Contract changes (серверный idempotencyKey, error-shapes) снапшотятся в error-shapes до мерджа.

## Risks

| Риск | Вер-ть | Митигация |
|---|---|---|
| Миграция конфликтует с dev-push схемой | средняя | IF NOT EXISTS-идемпотентность + тест на pre-existing схеме |
| Job-генерация линков при ретрае даёт вторые линки | низкая | генерация только при пустом hash (CAS-guard) |
| Кэш availability отдаёт устаревший слот | низкая | TTL ≤30с → существующий SLOT_TAKEN 409 честно ловит |
| e2e flakiness после переписывания | средняя | OTP-хелпер детерминирован; fake Resend канон |
| header CSP ломает Next inline bootstrap | средняя | nonce/strict-dynamic + браузерная проверка (канон nextjs-15-5) |

## Next

`/speckit.tasks` → tasks.md (9 фаз-групп, dependency graph).

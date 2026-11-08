# Implementation Plan: 004 (004-telegram-bots)

> "Бот без outbox — это стенная газета: повесил и молись, что прочитают." — Валера

**Branch**: `main` (single-branch lineage — IX-девиация) | **Date**: 2026-11-08 | **Spec**: rev 1.1 (audit PASS run #2)
**Input**: spec rev 1.1 + requirements-audit (PASS) + research.md (D1–D8) + 002/003 as-built (`c5f3bf1`, `3697b3d`)

## Summary

Telegram-контур на grammY (единственный новый dep): (1) dual-bot инфраструктура + timing-safe webhook-роуты с fail-closed/200-деградацией; (2) durable TelegramOutbox — CAS-claim (SKIP LOCKED), приоритеты CRITICAL/HIGH/NORMAL, 429-cooldown, starvation boost, dispatch каждые 30 c батчем ≤25; (3) staff pager — карточка + 5 действий (approve/reject/reschedule/complete/blacklist) через CAS `scheduleVersion` + confirm-barrier 30s + 3-уровневая авторизация; (4) client bot — deep-link TgLink, confirm=acknowledgement/decline=FSM cancel, cooldown, blacklist enforcement; (5) GDPR — redaction карточки CRITICAL-приоритетом + nightly purge TgLink 90d; (6) staff re-issue reschedule-токена (доменный сервис). Боты опциональны: без токенов — no-op деградация.

## Technical Context

**Language/Version**: без изменений (001–003 фундамент). **Testing**: vitest int с **mock Bot API** (фейковый fetch-транспорт grammY — без сети) +(go) playwright не требуется. **New dep**: `grammy` (единственный, NFR-402). **Jobs**: Payload Jobs — `outbox-dispatch` (6-field cron `*/30 * * * * *`, батч ≤25) + `gdpr-purge` (nightly) — добавляются к `jobs.tasks` 003.

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS/N/A | без изменений от 003 |
| VI | ON TRACK | analyze + внутренние ревью; ≥2 external до implement |
| VII | PASS | теги батчем на коммите контура (канон 001–003) |
| VII-B | PASS (waiver приложен) | Telegram-уведомление — финал сквозного процесса §2.2 плана |
| IX | DEVIATION (lineage) | как 001–003 |
| X | PASS | только additions (новые коллекции/поля, nullable) |
| XI | PASS | 0 спайков (контракт grammY verifyed по docs, dispatch — по dist Payload) |
| XII | **ON TRACK** | Risk 16 (FR-401/402/408) → STM+DT+Error Guessing обязательны |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
# Phase 1 — infra + webhooks (US1)
package.json                            # MOD: + grammy (единственный dep, D1)
src/lib/telegram/botManager.ts          # NEW: ленивая инициализация, healthcheck, waitForBots, no-op деградация
src/lib/telegram/security.ts            # NEW: timing-safe secret compare, fail-closed
src/app/api/telegram/staff/webhook/route.ts   # NEW: POST (secret → bot.handleUpdate)
src/app/api/telegram/client/webhook/route.ts  # NEW: POST
# Phase 2 — outbox (US2, FR-401/408)
src/collections/TelegramOutbox.ts       # NEW: priority/status/lease/availableAt/attempts
src/lib/telegram/outbox.ts              # NEW: enqueue(), classifyError(), starvation-boost ORDER BY
src/jobs/outboxDispatch.ts              # NEW: Payload Job */30s, SKIP LOCKED claim, batch ≤25
src/payload.config.ts                   # MOD: collections += TelegramOutbox/Blacklist/TgLink; jobs.tasks += dispatch/purge
# Phase 3 — staff pager (US3, FR-402)
src/lib/telegram/staffAuth.ts           # NEW: 3-уровневая авторизация (ShopSettings → env → chat карточки)
src/lib/telegram/staffBot.ts            # NEW: карточка (маскированный телефон), inline-кнопки, confirm-barrier
src/lib/telegram/staffActions.ts        # NEW: approve/reject → approveBooking CAS; complete → order-level; blacklist
src/globals/ShopSettings.ts             # MOD: staffChatIds, defaultLocale
src/lib/booking/bookingService.ts       # MOD: + issueRescheduleToken (D7, CAS + audit)
# Phase 4 — client bot (US4, FR-403/407)
src/collections/TgLink.ts               # NEW: chatId unique, orderId
src/collections/Blacklist.ts            # NEW: chatId, phone?, reason, createdBy
src/lib/telegram/clientBot.ts           # NEW: /start linking, confirm/decline callbacks, cooldown 24h
src/lib/telegram/blacklist.ts           # NEW: enforcement (403, скрытие кнопок, очистка reply-markup)
# Phase 5 — GDPR (US5, FR-404)
src/jobs/gdprPurge.ts                   # NEW: nightly, TgLink purge 90d BVA, outbox meta 30d
src/lib/telegram/redaction.ts           # NEW: терминальная редакция карточки через outbox CRITICAL
# Phase 6 — closeout
tests/int/*.int.spec.ts                 # NEW: outbox-race/cas-actions/auth-matrix/webhook-security/gdpr
```

## Threat Modeling (STRIDE)

- **S**: webhook secret timing-safe ×2; staff-auth 3 уровня; blacklist — fail-closed. **T**: CAS scheduleVersion на всех мутациях; SKIP LOCKED claim; confirm-barrier на деструктив. **R**: AuditEvents на каждый bot-action; PaymentEvents не затронуты (боты без денег). **I**: маскированный телефон, notes-индикатор без текста, PII-дени-лист в логах, redaction на терминале, purge 90d. **D**: outbox буферизует Telegram-недоступность; 429-cooldown; starvation boost. **E**: боты без денег (taboo); complete — order-level, не FSM.

## Rollback

Все изменения — additions; без Telegram-токенов боты no-op (outbox копит), webhook-роуты 403 fail-closed; откат = git; коллекции не мешают 002/003 путям.

## Risks

| Риск | Вер-ть | Митигация |
|---|---|---|
| grammY API ≠ ожиданиям (версия) | низкая | docs-контракт проверен (D1); transport инъекцией — тесты без сети |
| SKIP LOCKED + drizzle-раннер | низкая | drizzle поддерживает raw SQL FOR UPDATE SKIP LOCKED; fallback — advisory-канон 002 |
| 6-field cron в Payload autoRun | низкая | docs подтверждают 6-field (`'* * * * * *'`); fallback — 1m cron + увеличенный батч |
| Telegram 429 retry_after parse | низкая | классификатор ошибок D2; e2e-проверка на qa-signoff |
| PII в outbox-метаданных | средняя | metaJson redact-gate + 30d meta-purge (D6); NFR-403-тест |

## Next

`/speckit.tasks` — выполнено: 9 задач, 4 lane'а (см. tasks.md); closeout — sync barrier.

# Tasks: 004 (004-telegram-bots)

**Input**: spec rev 1.1, plan.md, research.md (D1–D8), requirements-audit PASS (run #2)
**Organization**: Phase 1 infra+webhooks → Phase 2 outbox → Phase 3 staff pager → Phase 4 client bot → Phase 5 GDPR → closeout.

## Phase 1: Infra + webhooks (US1)

- [ ] T410 [BE] [US1] FR-405: `+grammy` dep; `botManager.ts` (ленивая инициализация по env, healthcheck, waitForBots, no-op деградация); `security.ts` (timing-safe secret); webhook-роуты staff/client (`X-Telegram-Bot-Api-Secret-Token`, fail-closed 403 без секрета, 200-деградация при bot-init fail); security-DT тесты (secret × origin × degrade)

## Phase 2: Outbox (US2)

- [ ] T420 [BE] [US2] FR-401/408: `TelegramOutbox` коллекция (priority, status, leaseUntil, availableAt, attempts, lastError, metaJson redact-gate); `outbox.ts` (enqueue, classifyError: PERMANENT_NO_OP/RATE_LIMIT_429/TRANSIENT, starvation-boost ORDER BY); `outboxDispatch.ts` Payload Job (6-field cron каждые 30 c, SKIP LOCKED claim, батч ≤25, attempts ≥5 → dead); регистрация в payload.config; STM-тесты: claim-race двух воркеров → 0 дублей; kill-worker (lease expiry) → 0 потерь; 429 → cooldown → доставка; stress: burst 100 → drain, steady p95 замер

## Phase 3: Staff pager (US3)

- [ ] T430 [BE] [US3] FR-402: `staffAuth.ts` (L1 ShopSettings.staffChatIds → L2 env TELEGRAM_STAFF_CHAT_IDS → L3 чат карточки); `staffBot.ts` (карточка: маскированный телефон `+7••• ••• •• 45`, notes-индикатор, слот в TZ инстанса; inline-кнопки); `staffActions.ts` (approve/reject → approveBooking CAS; complete → order `completed` + audit; blacklist → confirm-barrier); confirm-barrier 30s (ин-мемори, идемпотентный ACK); ShopSettings `staffChatIds` + `defaultLocale` (botStrings ru/en); DT: auth-матрица 3×5 (0 несанкционированных мутаций); CAS: двойной клик → ALREADY_PROCESSED
- [ ] T431 [BE] [US3/US4] FR-403/D7: `issueRescheduleToken` в bookingService (новый nonce, CAS bump schedule_version + advisory lock, audit `booking.reschedule-token-issued`); staff reschedule → deep-link клиенту через outbox NORMAL

## Phase 4: Client bot (US4)

- [ ] T440 [BE] [US4] FR-407/403: `TgLink` (chatId unique, orderId) + `Blacklist` (chatId, phone?, reason, createdBy) коллекции; `clientBot.ts` (`/start <accessToken>` → идемпотентный upsert, повторный /start того же order — no-op); confirm = acknowledgement CAS bump; decline → FSM CUSTOMER_CANCEL + staff alert (outbox HIGH); 24h cooldown анти-спам (per chatId+action); EP/DT: linking-матрица (valid token / повтор / невалидный), cooldown-границы
- [ ] T441 [BE] [US4] FR-406: `blacklist.ts` enforcement — client callbacks 403 + 0 мутаций, кнопки не рендерятся, старая клавиатура очищается (editMessageReplyMarkup через outbox); staff blacklist через confirm-barrier; DT: enforcement × surface матрица (SC-003)

## Phase 5: GDPR (US5)

- [ ] T450 [BE] [US5] FR-404: `redaction.ts` — терминальный переход брони → enqueue editMessageText CRITICAL=100 (текст → `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ]`; fail → retry outbox); `gdprPurge.ts` nightly (TgLink purge 90d после терминала — BVA ±1 день; outbox metaJson > 30d → delete); маскировка телефона — общий хелпер; тесты: redaction-fail retry, purge BVA 89/90/91 дней, PII-дени-лист (логи без chatId/телефонов)

## Phase 6: Closeout

- [ ] T460 [SETUP] Регрессия: `pnpm generate:types`, полный гейт 0 exit (validate/lint/int/build), 129+ старых зелёные, evidence (outbox-race лог, CAS-матрица, auth-матрица, p95-замер), tasks-статусы

## Dependency Graph

```
T410 → T420
T420 → T430
T430 → T431
T430 → T440
T440 → T441
T420 → T450
T431, T441, T450 → T460
```

### Self-Validation
- [x] IDs существуют, циклов нет, orphan'ов нет

**Critical Path**: T410 → T420 → T430 → T440 → T441 → T460 (6 задач). **Total**: 9 задач.

## Parallel Lanes

| Lane | Tasks | Blocked By |
| ---- | ----- | ---------- |
| 1 | T410 → T420 | — |
| 2 | T430 → T431, T440 → T441 | T420 |
| 3 | T450 | T420 |
| 4 | T460 | все |

## Agent Dispatch

| Agent | Tasks |
| ----- | ----- |
| [BE] | T410, T420, T430, T431, T440, T441, T450 |
| [SETUP] | T460 |

## Notes
- TDD-Lite; Risk 16 (T420/T430) → STM+DT+Error Guessing до кода; Telegram-транспорт в тестах — инъекция fake fetch (0 сети); error-catalog: AUTH_DENIED/BARRIER_ACTIVE/BLACKLISTED/LINK_NOT_FOUND — снапшот-сьют расширяется.

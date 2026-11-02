# Tasks: 007 (007-code-review-fixes)

> "1 задача = 1 коммит = 1 секунда роллбэка." — Канон WRAP

**Input**: Design documents from `/specs/007-code-review-fixes/` (spec.md rev 1.1, plan.md, research.md D1–D6, requirements-audit PASS, qa/preliminary-rtm.md)
**Prerequisites**: plan.md, spec.md (US1–6), requirements-audit PASS

**Organization**: US1 (P0 security) → US2/US3 (P1) → US4/US5 (P2) → US6 (P3) → closeout. Все задачи T010–T017 независимы по файлам (единственный писатель на файл) — полный параллелизм; T020/T021 — sync barrier.

## Format: `[ID] [AGENT] [Story?] Description`

## Agent Tags

| Tag | Agent | Domain |
| --- | --- | --- |
| `[BE]` | backend-specialist | сервисы + юнит-тесты |
| `[SEC]` | security-auditor | STRIDE-верификация |
| `[SETUP]` | orchestrator | evidence, closeout |

---

## Phase 1: Security fixes (US1, P0)

- [X] T010 [BE] [US1] FR-701: `lib/bot/magicReschedule.ts` — `getRescheduleSecret()` throw при отсутствии обоих env, `verifyMagicRescheduleToken` явная ошибка `RESCHEDULE_SECRET_UNCONFIGURED`; `app/api/bot/staff/webhook/route.ts` — конфиг-ошибка → `answerCallbackQuery` alert + HTTP **503** + `[RESCHEDULE_SECRET_UNCONFIGURED]`; тесты: env-absent матрица (оба отсутствуют → throw/503; один задан → fallback работает; оба заданы → primary; verifyToken при отсутствии env → unconfigured)
- [X] T011 [BE] [US1] FR-702: `lib/notifications/deliveryLog.ts` — отсутствие `DELIVERY_LOG_SALT` и `ADMIN_TOKEN` → цель `UNHASHED` + boot-алерт `[DELIVERY_LOG_SALT_UNCONFIGURED]`; удалён дефолт `'undreseller-dl-salt'`; тесты: no-salt → UNHASHED, with-salt → хеш, grep-пруф 0 дефолтных солей в lib

## Phase 2: Contract fixes (US2/US3, P1)

- [X] T012 [BE] [US2] FR-703: `app/api/admin/bookings/[id]/route.ts` — `RESCHEDULE` → 501 JSON `{ error: "RESCHEDULE is not implemented (planned <=007)" }`; тест: 501 + 0 изменений в БД + 0 новых AuditEvent
- [X] T013 [BE] [US3] FR-704: Provider-aware инвариант суммы: `lib/payments/fulfillment.ts` — для `TELEGRAM_STARS` сверка `amountMinor === (order.starsPrice ?? Math.max(1, Math.round(order.totalMinor / 2))) && currency === 'XTR'`; для `STRIPE`/`CRYPTO_GATEWAY` сверка `amountMinor === order.totalMinor && currency.toUpperCase() === order.currency.toUpperCase()`; `lib/payments/providerContract.ts` + `lib/payments/stripe.ts` + `app/api/payments/stripe/webhook/route.ts` — передача `parsed.currency`; mismatch → `PAID_REQUIRES_RESOLUTION` + `AMOUNT_MISMATCH_MANUAL_RESOLUTION` + refund-request `idempotencyKey: amount_mismatch_<orderId>_<providerRef>` (PaymentEvent записывается всегда — ledger факта); контрактные тесты: happy-path crypto unchanged, Telegram Stars valid/invalid XTR, Stripe EUR/USD dynamic currency, mismatch amount ±1 minor, ретрай того же providerRef после mismatch → ALREADY_PAID no-op

## Phase 3: SRE hardening (US4/US5, P2)

- [X] T014 [BE] [US4] FR-705: `AbortSignal.timeout(10_000)` на `lib/email/emailProvider.ts` (Resend send), `lib/payments/nowpayments.ts` (invoice create), `lib/bot/whatsappClient.ts`; в `whatsappClient.ts` при `AbortError`/`TimeoutError` цикл retry немедленно прерывается (break); таймаут → существующие FAILED-ветки; тесты: hung-upstream mock (задержка >10 с, fake timers) → FAILED ≤10.5 с; WhatsApp retry break on timeout; grep-пруф: 3/3 call-site с signal
- [X] T015 [BE] [US5] FR-706: `lib/security/staffSignIn.ts` — `userExists` guard (несуществующие пользователи не пишутся в lockout), eviction записей с `(lockedUntil === null || lockedUntil < now) && updatedAt < now-15min` + hard-cap 1000 с вытеснением старейших, а при 1000 активных локов — вытеснение `min(lockedUntil)`; BVA-тесты: 999/1000/1001 записей, unknown email no-op, active-lock survival & emergency eviction, спрей 5000 email → Map ≤1000
- [X] T016 [BE] [US5] FR-707: `app/api/bot/whatsapp/webhook/route.ts` GET — `hub.verify_token` через буферы `Buffer.byteLength` length-guard + `timingSafeEqual` (ноль RangeError при multi-byte UTF-8); тесты: валидный → 200+challenge, неверный/разной длины/multi-byte UTF-8 → 403, ноль RangeError

## Phase 4: GC reconciliaton (US6, P3)

- [X] T017 [BE] [US6] FR-708: `lib/jobs/inngest.ts` `gcal-reconcile` — окно 7 дней, `orderBy: { updatedAt: 'asc' }`, `take: 50`; тест: бронь изменённая 3 дня назад попадает в выборку, шторм 60 заказов дренируется циклами

## Phase 5: Closeout (sync barrier)

- [X] T020 [SEC] STRIDE-верификация 007: SC-001..005 grep-пруфы (0 дефолтных секретов/солей, 3/3 fetch с signal, 501/503 контракты) + regression-гейт 418+ тестов / 7 снапшотов; `evidence/stride-verification.md`
- [X] T021 [SETUP] Evidence: `evidence/lockout-rss.json` (5000 спрей-попыток, сырой json-лог — NFR-703/audit R2); tasks.md статусы; подготовка `/speckit.test-design`

---

## Dependency Graph

```
T010 → T020
T011 → T020
T012 → T020
T013 → T020
T014 → T020
T015 → T020, T021
T016 → T020
T017 → T020
T020 → T021
```

### Self-Validation Checklist

- [x] Every task ID referenced exists above
- [x] No circular dependencies
- [x] No orphan IDs
- [x] Fan-in `+` only, fan-out `,` only
- [x] No chained arrows on a single line

Примечания: T010–T017 — независимые файлы (единственный писатель на файл), стартуют немедленно после T051-базовой линии 006 (уже выполнена); T020 — fan-in всех восьми; файл-конфликтов нет.

---

## Parallel Lanes

| Lane | Agent Flow | Tasks | Blocked By |
| ---- | ---------- | ----- | ---------- |
| 1–8 | [BE] по одному на задачу | T010…T017 | — (все параллельно) |
| 9 | [SEC] | T020 | T010–T017 |
| 10 | [SETUP] | T021 | T015, T020 |

---

## Agent Summary

| Agent | Tasks | Can Start After |
| ----- | ----- | --------------- |
| [BE] | 8 (T010–T017) | immediately |
| [SEC] | 1 (T020) | T010–T017 |
| [SETUP] | 1 (T021) | T015, T020 |

**Critical Path**: T013 → T020 → T021 (10 задач).

**Total**: 10 задач.

---

## Agent Dispatch Plan

| Agent | Subagent/Command | Skills | Input Context | Tasks | Files |
| ----- | ---------------- | ------ | ------------- | ----- | ----- |
| `[BE]` | backend-specialist | api-patterns, nodejs-best-practices, typescript-expert, clean-code | spec §2/§4, research D1–D6, preliminary-rtm | T010–T017 | см. Source-таблицу plan.md (по файлу на задачу) |
| `[SEC]` | security-auditor | vulnerability-scanner, code-review-checklist | plan §STRIDE, spec §2 US1/US5 | T020 | project-wide |
| `[SETUP]` | orchestrator | architecture, clean-code | research D4, audit R2 | T021 | evidence/, tasks.md |

---

## Implementation Strategy

**Independent Parallel Fixes**: каждый фикс — отдельный файл + отдельные тесты, феatura-флагов не нужно (поведение при совпадении условий идентично прежнему). Regression-гейт NFR-701 после каждого коммита: `npm run validate && npm test` (418+ / 51 / 7 снапшотов).

**Constitution VI**: implement заблокирован до analyze PASS + ≥2 внешних ревью PASS.

## Notes

- Тесты в каждой задаче — TDD-Lite, канон coding-standards: никаких `as any`/`console.log`/raw SQL.
- Snapshot: `tasks/007-code-review-fixes/v1` этим коммитом (Principle VII).

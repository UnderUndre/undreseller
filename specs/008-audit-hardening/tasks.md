# Tasks: 008 (audit-hardening)

**Input**: spec rev 1.0, plan.md, requirements-audit PASS run #1, аудиты code-review (48) / security (33)
**Organization**: Phase 1 деньги+доступ (P0) → Phase 2 route+schema → Phase 3 UX → Phase 4 infra+compliance → Phase 5 gates → closeout.

## Phase 1: Money path + access (US2/US3/US4 — Risk 15)

- [ ] T810 [BE] [US4] FR-804: webhook CAS — `RETURNING schedule_version`, 0 rows → re-read (RELEASED → late-payment ветка / HELD → CAS-retry), order не трогается до CAS; `charge.refunded` — amount-сверка с orders.amount, partial ≠ full; refundService — транзакция + CAS `status='refunding' RETURNING id` + Stripe idempotencyKey. **STM-тесты: webhook×cancel, refund×refund** (Risk 15)
- [ ] T811 [BE] [US4] FR-804: job input без секретов — bookingEmailTask получает reservationId, джоба CAS-генерит одноразовые линки (только при пустом hash), letter собирается в хендлере
- [ ] T812 [BE] [US2] FR-802: серверный idempotencyKey = детерминированный HMAC(email+productId+startIso) в booking route (клиентский key игнорируется), findBookingByIdempotencyKey email-guard (чужой email → 404 без accessToken); claim-роут делегирует claimWaitlistEntry. **BVA-тесты: перебор чужих ключей → 0 accessToken**
- [ ] T813 [BE] [US3] FR-803: staffCard сохраняет chat-binding в outbox; staffBot колбэк резолвит chat карточки из outbox по message_id — mismatch → auth-denied; L3-тавтология удалена; complete через FSM; clientBot acknowledge tg_links-гейт. **Decision-Table тесты: chat×карточка×роль**

## Phase 2: Schema + trust route (US1/US5)

- [ ] T820 [DB] [US1] FR-801: миграция `complete_domain_schema` — все доменные таблицы/enum-значения/колонки 002–007 (IF NOT EXISTS-идемпотентность, additions-only); fresh-migrate smoke (пустая БД → migrate → бронь через публичный API → 201) в тест-контуре
- [ ] T821 [BE] [US5] FR-805: trust-cookie путь через resolveAvailability grid (422 вне сетки/несуществующий ресурс — не 500); SlotGrid.submit catch + setSlots([]) (F-UX-04/17)

## Phase 3: UX funnel (US6)

- [ ] T830 [FE] [US6] FR-806: LocalTime client-компонент (confirmation + waitlist-claim), globals.css контраст (--error/--success 4.5:1 обе темы) + cursor-pointer базовый слой, BookingFormOTP onBack+autoFocus, ConfirmOrder error-экран+retry, login customer-копия
- [ ] T831 [FE] [US6] FR-806 DT: контраст-чеклист обе темы (программная проверка OKLCH L-значений), тупик-матрица (каждый error-стейт имеет видимый выход)

## Phase 4: Infra + compliance (US8/US9)

- [ ] T840 [OPS] [US8] FR-808: docker-compose 127.0.0.1:5432 + `${POSTGRES_PASSWORD:?err}`; next.config headers() CSP/XFO/XCTO/Referrer-Policy + poweredByHeader:false; clientIpFrom fail-closed; assertSingleInstance вызов на boot
- [ ] T841 [BE] [US8] FR-808: availability RL + slotCache (bounded TTL 15-30с); graphql.disable() в prod
- [ ] T842 [BE] [US9] FR-809: gdprPurge анонимизация customer_* orders/slot_reservations >90д (терминальные only); JSON-LD `</script>` escape
- [ ] T843 [BE] [US6] FR-806-аккуратно: проверка CSP против Next inline bootstrap (nonce/strict-dynamic) — браузерная верификация, curl лжёт (канон nextjs-15-5)

## Phase 5: Release gates (US7)

- [ ] T850 [E2E] [US7] FR-807: booking.e2e переписан под OTP-контракт (email → otp-step → verify → confirmed; вкладка-гонка → 409 на verify); tests/helpers/otpFromDb.ts (HMAC-подбор по env-секрету)
- [ ] T851 [E2E] [US7] FR-807: booking-route.int.spec.ts — HTTP-матрица (202/201/400/409/429/Retry-After, intentId-без-otp → 400, honeypot → 200 + 0 строк ×3 таблицы, INVALID_JSON); trust-cookie route-тесты (happy 201 без OTP, mismatch → OTP, tampered → OTP, Set-Cookie атрибуты)
- [ ] T852 [E2E] [US7] FR-807: error-shapes снапшот + каталог 007 (code→status→shape, RATE_LIMITED+retryAfterSec); TTL-ветка opt-in (confirm после 48h → 403)

## Phase 6: Closeout

- [ ] T860 [SETUP] Полный гейт: generate:types, validate/lint/int/build/e2e — 0 exit; fresh-migrate smoke повторный; evidence (STM-логи, контраст-отчёт, headers-проверка, migrate-лог) в specs/008-audit-hardening/evidence/; tasks-статусы

## Dependency Graph

```
T810 → T811 (job без секретов переиспользует CAS-канон)
T812 → T821 (trust-route grid поверх серверного ключа)
T813 → T850 (e2e staff-гейты после тавтологии-фикса)
T820 → T860 (fresh-migrate smoke — последний)
T830 → T843 (CSP-проверка после контраст-правок)
T840, T841, T842 → T860
T850, T851, T852 → T860
```

### Self-Validation
- [x] IDs существуют, циклов нет, orphan'ов нет

**Critical Path**: T810 → T812 → T821 → T850 → T860 (5 задач). **Total**: 13 задач.

## Parallel Lanes

| Lane | Tasks | Blocked By |
| ---- | ----- | ---------- |
| 1 | T810 → T811 | — |
| 2 | T812 → T821 | — |
| 3 | T813 → T850 | — |
| 4 | T830 → T843 | — |
| 5 | T840, T841, T842 | — |
| 6 | T851, T852 | T812 (route-контракт) |
| 7 | T820, T860 | все |

## Agent Dispatch

| Agent | Tasks |
| ----- | ----- |
| [BE] | T810, T811, T812, T813, T821, T841, T842, T851(частично), T852 |
| [DB] | T820 |
| [FE] | T830, T831, T843 |
| [OPS] | T840 |
| [E2E] | T850, T851, T852 |
| [SETUP] | T860 |

## Notes
- TDD-Lite; Risk 15 (FR-802/803/804) → STM+Decision Table+негатив до кода (обязательства requirements-audit run #1).
- NFR-802: 0 новых deps. NFR-801: ≥25 новых тестов (route-матрица ~15 + STM/DT ~6 + снапшот ~4).
- Ожидаемое изменение HTTP-контрактов (серверный key, 404-унификация) фиксируется в error-shapes ДО мерджа (Via Negativa §1.3).

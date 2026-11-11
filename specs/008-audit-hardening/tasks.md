# Tasks: 008 (audit-hardening)

**Input**: spec rev 1.1 (antigravity F1–F11 интегрированы), plan.md, requirements-audit PASS run #1, аудиты code-review (48) / security (33)
**Organization**: Phase 1 деньги+доступ (P0) → Phase 2 route+schema → Phase 3 UX → Phase 4 infra+compliance → Phase 5 gates → closeout.

## Phase 1: Money path + access (US2/US3/US4 — Risk 15)

- [X] T810 [BE] [US4] FR-804: webhook CAS — `RETURNING schedule_version`, 0 rows → re-read (RELEASED → late-payment ветка / HELD → CAS-retry), order не трогается до CAS; `charge.refunded` — amount-сверка с orders.amount, partial ≠ full; refundService — транзакция + `SELECT … FOR UPDATE` по orders (БЕЗ нового статуса — antigravity F2) + детерминированный Stripe idempotencyKey `refund-<orderId>` + запись статуса сразу в финальное значение. **STM-тесты: webhook×cancel, refund×refund** (Risk 15)
- [X] T811 [BE] [US4] FR-804: таска письма → `deleteJobOnComplete: true` — input с токенами стирается после отправки (antigravity F1: генерация в джобе ломает ссылки на confirmation-экране; хэши в БД не перезаписываются)
- [X] T812 [BE] [US2] FR-802: серверный idempotencyKey = детерминированный HMAC(email+productId+startIso) в booking route (клиентский key игнорируется), findBookingByIdempotencyKey email-guard (чужой email → 404 без accessToken) **с координированной передачей intent.email из intentService (antigravity F6)**; claim-роут делегирует claimWaitlistEntry. **BVA-тесты: перебор чужих ключей → 0 accessToken**
- [X] T813 [BE] [US3] FR-803: staffCard сохраняет sent_message_id + to_chat_id при отправке; staff webhook route пробрасывает message_id колбэка (antigravity F4); staffBot резолвит карточку строго по `sent_message_id AND to_chat_id` + staff allow-list — mismatch → auth-denied; L3-тавтология удалена; complete через FSM; clientBot acknowledge tg_links-гейт. **Decision-Table тесты: chat×карточка×роль**

## Phase 2: Schema + trust route (US1/US5)

- [X] T820 [DB] [US1] FR-801+FR-810: миграция `complete_domain_schema` (IF NOT EXISTS-идемпотентность, additions-only) + отдельная миграция enum-значений (ALTER TYPE вне транзакции с использованием — antigravity F7) + регистрация в src/migrations/index.ts + валидный down(); fresh-migrate smoke (пустая БД → migrate → бронь через публичный API → 201) в тест-контуре
- [X] T821 [BE] [US5] FR-805: trust-cookie путь через resolveAvailability grid (422 вне сетки/несуществующий ресурс — не 500); семантика по antigravity F11: loadSlots catch → setSlots([]) (устаревший грид уходит), submit catch → setError БЕЗ очистки грида (F-UX-04)

## Phase 3: UX funnel (US6)

- [X] T830 [FE] [US6] FR-806: LocalTime client-компонент (confirmation + waitlist-claim), globals.css контраст (--error/--success 4.5:1 обе темы) + cursor-pointer базовый слой, BookingFormOTP onBack+autoFocus+`data-testid="booking-conflict"` (antigravity F10), ConfirmOrder error-экран+retry, login customer-копия
- [X] T831 [FE] [US6] FR-806 DT: контраст-чеклист обе темы (программная проверка OKLCH L-значений), тупик-матрица (каждый error-стейт имеет видимый выход)

## Phase 4: Infra + compliance (US8/US9)

- [X] T840 [OPS] [US8] FR-808: docker-compose 127.0.0.1:5432 + `${POSTGRES_PASSWORD:?err}`; next.config headers() статическая CSP **script-src 'self' 'unsafe-inline'** (RSC/Payload-совместимая — antigravity F5) + XFO/XCTO/Referrer-Policy + poweredByHeader:false; контракт `clientIpFrom → string | null` (null → отказ лимита, не общий bucket — antigravity F9); assertSingleInstance через `instrumentation.ts register()` (не модульный вызов — antigravity F8)
- [X] T841 [BE] [US8] FR-808: availability RL + slotCache (bounded TTL 15-30с); graphql.disable() в prod
- [X] T842 [BE] [US9] FR-809: gdprPurge анонимизация customer_* orders/slot_reservations >90д (терминальные only); JSON-LD `</script>` escape; **секреты/PII из stdout: console.log в sendOrderAccessEmail удалён (antigravity F3, SEC-A-02), `[003-debug]` и сырые webhook-объекты → payload.logger**
- [X] T843 [BE] [US6] FR-806-аккуратно: браузерная верификация CSP (curl лжёт — канон nextjs-15-5); при блокировке гидрации — ослабление до документированной CSP-базовой линии

## Phase 5: Release gates (US7)

- [X] T850 [E2E] [US7] FR-807: booking.e2e переписан под OTP-контракт (email → otp-step → verify → confirmed; вкладка-гонка → 409 на verify с testid booking-conflict); tests/helpers/otpFromDb.ts (HMAC-подбор по env-секрету)
- [X] T851 [E2E] [US7] FR-807: booking-route.int.spec.ts — HTTP-матрица (202/201/400/409/429/Retry-After, intentId-без-otp → 400, honeypot → 200 + 0 строк ×3 таблицы, INVALID_JSON); trust-cookie route-тесты (happy 201 без OTP, mismatch → OTP, tampered → OTP, Set-Cookie атрибуты)
- [X] T852 [E2E] [US7] FR-807: error-shapes снапшот + каталог 007 (code→status→shape, RATE_LIMITED+retryAfterSec); TTL-ветка opt-in (confirm после 48h → 403)

## Phase 6: Closeout

- [X] T860 [SETUP] Полный гейт: generate:types, validate/lint/int/build/e2e — 0 exit; fresh-migrate smoke повторный; evidence (STM-логи, контраст-отчёт, headers-проверка, migrate-лог) в specs/008-audit-hardening/evidence/; tasks-статусы

## Dependency Graph

```
T810 → T811 (deleteJobOnComplete на переиспользуемой таске письма)
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
- Antigravity-интеграция ревизии 1.1: F1→T811, F2→T810, F3→T842, F4→T813, F5→T840/T843, F6→T812, F7→T820, F8→T840, F9→T840, F10→T830/T850, F11→T821 — все 11 согласованы и внесены.

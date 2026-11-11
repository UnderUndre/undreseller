# SpecKit Code Review Report (whole-repo mode)

**Reviewer**: `zcode` (3 параллельных агента: backend/security, UX/ui-ux-pro-max, test-architect; ground-truth spot-check ключевых BLOCKER'ов выполнен главной сессией)
**Reviewed at**: 2026-11-12T00:30:00+02:00
**Mode**: `Whole repo` (HEAD `cb7a8ec`, main, working tree clean; расширенный режим «Local Diff» — весь src + tests)
**Inspected Files**: ~210 (src 200+, tests 25, конфиги) · Canon: `UndeRoute/.claude/commands/speckit.code-review.md` (6-pass pipeline, confidence ≥80) + `speckit.ui-ux-pro-max.md` (Pre-Delivery Checklist) + скиллы ai-engineering-hygiene, code-review-checklist, api-patterns, vulnerability-scanner, database-design, frontend-design, react-patterns, tailwind-patterns, nextjs-best-practices, testing-patterns, tdd-workflow
**Pass Status**: `BLOCKER: 3 | CRITICAL: 11 | WARNING: 22 | SUGGESTION: 12`

---

## 1. 🚨 Critical Findings ([BLOCKER] / [CRITICAL])

### Backend / данные

#### [F-BE-01] [BLOCKER] (Confidence: 95/100) Миграция не создаёт доменную схему — свежий деплой неработоспособен
- **Location:** `src/migrations/20261107_003147_booking_gist.ts` (93 CREATE TABLE; проверено grep'ом: `booking_intents`/`waitlist_entries`/`telegram_outbox`/`payload_jobs` отсутствуют)
- **Failure Scenario:** Единственная миграция создаёт только template-схему + gist-индексы. Нет: `booking_intents`, `waitlist_entries`, `tg_links`, `telegram_outbox`, `blacklist`, `inbox_events`, `payment_events`, `email_delivery_log`, `payload_jobs`; в `enum_orders_status` нет `refund_requested/refund_failed/refund_rejected/paid_requires_resolution` (стр. 52); в `slot_reservations` нет `reschedule_token_hash`/`reminder_sent_at` (415-435); в `orders` нет `stripe_payment_intent_ref`. `payload migrate` на чистой БД = каждая запись падает; схема живёт только на dev-push.
- **Fix:** `payload migrate:create` из текущего config + в CI шаг «migrate на пустой БД + smoke-booking».

#### [F-BE-02] [BLOCKER] (Confidence: 88/100) IDOR: клиентский `idempotencyKey` возвращает accessToken чужого бронирования
- **Location:** `src/app/api/booking/route.ts:65-68,115-123`; `src/lib/booking/bookingService.ts:87-111,123-126` (проверено: `findBookingByIdempotencyKey` возвращает `row.access_token`, стр. 104)
- **Failure Scenario:** Проверка идемпотентности стоит ПЕРЕД валидацией продукта; ключи последовательны (`booking-intent-<n>`, `waitlist-claim-...`). Атакующий с одной легитимной бронью + trust-cookie перебирает ключи и получает `accessToken`/`orderId` чужих броней → гостевой просмотр, acknowledge, линковка Telegram-чата, латентный cancel.
- **Fix:** Серверный ключ из trust-cookie email + productId + start; в `findBookingByIdempotencyKey` — не отдавать accessToken при несовпадении email.

#### [F-TQ-01] [BLOCKER] (Confidence: 92/100) e2e booking-флоу мёртв — не знает про двухфазный OTP-контракт 007
- **Location:** `tests/e2e/booking.e2e.spec.ts:10-54` (проверено: 0 упоминаний `customer-email`/`booking-otp`)
- **Failure Scenario:** Оба e2e-теста ждут `booking-confirmed` сразу после `booking-submit`; UI сейчас даёт OTP-шаг, роут требует customerEmail (400 без него). Гарантированно красные на HEAD → release-гейт `pnpm test:e2e` сломан.
- **Fix:** Переписать под контракт: email → `booking-otp-step` → код → verify → `booking-confirmed`.

#### [F-BE-03] [CRITICAL] (Confidence: 87/100) Stripe-вебхук: CAS-UPDATE без проверки rowCount — «confirmed» при снятом холде
- **Location:** `src/lib/booking/bookingService.ts:738-748, 764-775`
- **Failure Scenario:** SELECT без `FOR UPDATE` → UPDATE по schedule_version; при 0 строк (holdSweep/cancel успели релизнуть) код всё равно ставит `orders.status='completed'` + `ledger('PROCESSED')` → деньги получены, слот RELEASED, состояние вне FSM. В `cancelBooking:445` и `approveBooking:545` rowCount проверяется — здесь нет.
- **Fix:** `RETURNING schedule_version`, 0 строк → re-read: RELEASED → late-payment ветка; order не трогать до успешного CAS.

#### [F-BE-04] [CRITICAL] (Confidence: 86/100) Staff-авторизация телеграм-колбэков — тавтология
- **Location:** `src/lib/telegram/staffBot.ts:59` — `isStaffChat(payload, args.chatId, args.chatId)` (проверено)
- **Failure Scenario:** Оба аргумента — один chatId, проверка всегда истинна. Любой чат с карточкой (форвард/группа/утечка) получает approve/reject/blacklist по произвольным броням.
- **Fix:** Резолвить chat карточки из `telegram_outbox.sent_message_id` и сверять с ним.

#### [F-BE-05] [CRITICAL] (Confidence: 85/100) Raw одноразовые токены бронирования персистятся в payload_jobs.input
- **Location:** `src/lib/booking/bookingService.ts:262-273` → `src/jobs/bookingEmail.ts:15-23`
- **Failure Scenario:** `cancelToken`, `rescheduleToken`, `accessToken` передаются в job input (jsonb, `deleteJobOnComplete` не настроен) — нарушает собственный hash-only канон (audit C1, тот же принцип, что в 007 для OTP). Утечка БД = replayable креды.
- **Fix:** Джоба получает reservationId и CAS-генерит новые одноразовые линки сама; либо `deleteJobOnComplete: true` + хэши.

#### [F-TQ-02] [CRITICAL] (Confidence: 88/100) Ноль HTTP-уровневых тестов роутов booking/waitlist
- **Location:** `src/app/api/booking/**`, `src/app/api/waitlist/**` — не импортируются тестами; канон есть: `tests/int/calendar-feed.int.spec.ts:149-164`
- **Failure Scenario:** Маппинг 202/201/400/409, IntentError→HTTP shape c Retry-After, honeypot-гварды роутов, per-IP RL ключи, INVALID_JSON — не верифицированы; регрессия проводки проходит с зелёным сьютом.
- **Fix:** `booking-route.int.spec.ts` по calendar-feed-канону.

#### [F-TQ-03] [CRITICAL] (Confidence: 90/100) Trust-cookie skip-OTP путь покрыт только pure-function уровнем
- **Location:** `src/app/api/booking/route.ts:107-131` vs `tests/int/trust-gate.int.spec.ts:690-712`
- **Failure Scenario:** Самый рискованный быстрый путь (тело напрямую, минуя F5-гидратацию; гейт `trust.email === customerEmail`) без route-тестов: cookie-happy → 201, mismatch/tampered → 202, Set-Cookie атрибуты — ни одного ассерта.
- **Fix:** Route-тесты поверх харнесса F-TQ-02.

### UX / ui-ux-pro-max

#### [F-UX-01] [CRITICAL] (Confidence: 88/100) Время слота рендерится на сервере в таймзоне сервера
- **Location:** `src/app/(app)/book/confirmation/[id]/page.tsx:47`; `src/app/(app)/book/waitlist-claim/page.tsx:64`
- **Failure Scenario:** `toLocaleString()` в Server Component — клиент видит время в таймзоне сервера; на claim-лендинге это «прийти не в тот час», для международной аудитории — сломанный показ.
- **Fix:** ISO → маленький client-компонент с `toLocaleString` (suppressHydrationWarning), либо Intl с явной user-timezone после гидрации.

#### [F-UX-02] [CRITICAL] (Confidence: 90/100) text-error/text-success проваливают контраст 4.5:1 (проверено: `--error: oklch(75%…)` light)
- **Location:** `src/app/(app)/globals.css:123-125,161-163`; потребители — все ошибки booking-флоу (`FormError.tsx:16`, `SlotGrid.tsx:235,240`, `BookingFormOTP.tsx:136`)
- **Failure Scenario:** light ~2.1:1 на белом, `text-success` ~1.7:1 — ошибки и успех практически невидимы.
- **Fix:** light `--error` → L≈55-60% (red-600-аналог), `--success` → L≈50%; dark наоборот; прогнать 4.5:1 в обеих темах.

#### [F-UX-03] [CRITICAL] (Confidence: 90/100) OTP-шаг — тупик без выхода назад
- **Location:** `src/components/booking/BookingFormOTP.tsx:52-59`; `SlotGrid.tsx:115-122`
- **Failure Scenario:** INTENT_DEAD/SLOT_TAKEN сообщают «выберите слот заново», но при активном otpPhase грид размонтирован; ни onBack, ни отмены — единственный выход F5, теряющий все введённые поля.
- **Fix:** `onBack` (сброс otpPhase) + кнопка «Выбрать другой слот» + `autoFocus` на OTP-инпут.

#### [F-UX-04] [CRITICAL] (Confidence: 92/100) SlotGrid.submit без catch — сетевая ошибка = тишина
- **Location:** `src/components/booking/SlotGrid.tsx:73-111` (try/finally без catch)
- **Failure Scenario:** Упавший fetch → unhandled rejection, кнопка возвращается в активное состояние, ноль обратной связи; пользователь жмёт несколько раз и уходит.
- **Fix:** `catch { setError('Network error, try again.') }` — симметрично BookingFormOTP.

#### [F-UX-05] [CRITICAL] (Confidence: 92/100) ConfirmOrder: подтверждение после оплаты без catch — вечный спиннер
- **Location:** `src/components/checkout/ConfirmOrder.tsx:29-48`
- **Failure Scenario:** Деньги списаны, Stripe редиректит на `/checkout/confirm-order`, серверное подтверждение падает → навсегда «Confirming Order» без ошибки и retry.
- **Fix:** Честный экран ошибки + повтор (идемпотентность уже обеспечена paymentIntentID).

#### [F-UX-06] [CRITICAL] (Confidence: 95/100) На странице логина — шаблонный текст владельца магазина и ссылка в админку
- **Location:** `src/app/(app)/login/page.tsx:24-28`
- **Failure Scenario:** Клиент читает «…To manage all users, login to the admin dashboard» с линком `/admin/collections/users` — copy шаблона на кастомерской поверхности.
- **Fix:** Customer-копия, убрать админ-линк.

---

## 2. ⚠️ Performance & Reliability ([WARNING])

#### [F-BE-06] (Confidence: 83/100) Staff-refund без CAS/idempotency — двойной Stripe-refund, ложный refund_failed
`src/lib/booking/refundService.ts:35-54,70-73`. Fix: CAS `status='refunding'` + idempotencyKey в Stripe.

#### [F-BE-07] (Confidence: 88/100) Availability: busy-запрос без временного окна + роут без rate limit
`src/lib/availability/resolver.ts:104-110`; `src/app/api/availability/route.ts`. Fix: фильтр по дате (индекс покроет) + `checkRateLimit('availability:'+ip)`.

#### [F-BE-08] (Confidence: 85/100) telegram_outbox: claim-CTE без индекса, таблица не сокращается
`src/lib/telegram/outbox.ts:82-98`; коллекция без `indexes`; gdprPurge только обнуляет тексты. Fix: партиальный индекс по (priority, created_at) WHERE queued/sending + удаление sent/dead старше 30-90д.

#### [F-BE-09] (Confidence: 82/100) In-memory cooldowns/barriers растут неограниченно
`src/lib/telegram/clientBot.ts:14-22`, `staffAuth.ts:48-61`. Fix: ленивый sweep просроченных ключей или LRU (канон rateLimiter MAX_TRACKED_KEYS).

#### [F-BE-10] (Confidence: 85/100) `DATABASE_URL || ''` — fail-open бутстрап вопреки fail-closed канону
`src/payload.config.ts:85`. Fix: throw при пустом значении (как PAYLOAD_SECRET).

#### [F-UX-07] (Confidence: 90/100) Языковой разнобой EN/RU в одном флоу + `lang="en"` при русском контенте
`SlotGrid.tsx:126-238` (EN) vs `BookingFormOTP.tsx:96-133` (RU); `waitlist-claim/page.tsx:24`; `layout.tsx:46`. Fix: один язык клиентских поверхностей + `lang="ru"` для RU-сегментов.

#### [F-UX-08] (Confidence: 92/100) WaitlistJoinForm: placeholder-only инпуты без label и стилей
`WaitlistJoinForm.tsx:59-73`. Fix: паттерн SlotGrid (label + rounded/border/px) + autoComplete атрибуты.

#### [F-UX-09] (Confidence: 85/100) Claim/optin-клиенты: error-state убивает кнопку — нет retry
`ClaimWaitlistClient.tsx:55`, `ConfirmOptinClient.tsx:48`. Fix: retry-кнопка для сетевых ошибок; для WAITLIST_TOKEN_INVALID — CTA «оставить заявку заново».

#### [F-UX-10] (Confidence: 88/100) ReschedulePicker: «No slots» до выбора даты + date-input без `min`
`ReschedulePicker.tsx:62,65-66`. Fix: пустое состояние только при выбранной дате + `min={today}`.

#### [F-UX-11] (Confidence: 85/100) Hand-rolled кнопки без `cursor-pointer` (Tailwind v4 default cursor)
`SlotGrid.tsx:151-165,220-228`, `WaitlistJoinForm.tsx:71`, `ReschedulePicker.tsx:71`, `ConfirmCancelForm.tsx:48`, `ClaimWaitlistClient.tsx:57`, `ConfirmOptinClient.tsx:50`, `UnsubscribeClient.tsx:35`. Fix: одна правка в globals.css для `button,[role="button"]`.

#### [F-UX-12] (Confidence: 85/100) Системный `text-primary/50` — приглушённый текст светлее порога читаемости
`ProductGridItem/index.tsx:51` (названия товаров!), `ui/button.tsx:19,21`, `AccountNav/index.tsx:22,35,48,62`, `CheckoutPage.tsx:412`. Fix: `text-muted-foreground` или альфа `/70`.

#### [F-UX-13] (Confidence: 90/100) `border-white/5` в light — невидимый разделитель
`AccountNav/index.tsx:57`. Fix: `border-neutral-200 dark:border-white/10`.

#### [F-UX-14] (Confidence: 85/100) Button outline: hover no-op из-за конфликта классов
`ui/button.tsx:16` — `hover:bg-accent hover:bg-primary-foreground` → twMerge оставляет последний ≈ белый на белом. Fix: убрать `hover:bg-primary-foreground`.

#### [F-UX-15] (Confidence: 85/100) `html { opacity: 0 }` без noscript-фолбэка — весь сайт невидим без JS
`globals.css:217-224` + `InitTheme/index.tsx:42`. Fix: `<noscript><style>html{opacity:initial}</style></noscript>` + CSS-анимация-фолбэк.

#### [F-UX-16] (Confidence: 90/100) DeleteItemButton: 17px тач-таргет поверх ссылки товара (z-40 vs z-30)
`Cart/DeleteItemButton.tsx:18`; `CartModal.tsx:116-118`. Fix: расширить хит-зону до ≥44px, вынести из потока ссылки.

#### [F-UX-17] (Confidence: 83/100) При ошибке загрузки слотов остаются слоты прошлой даты
`SlotGrid.tsx:42-56` — catch ставит error, но не чистит `slots`. Fix: `setSlots([])` в catch.

#### [F-UX-18] (Confidence: 85/100) Автопрокрутка карусели без prefers-reduced-motion и паузы
`blocks/Carousel/Component.client.tsx:20-27`; `prefers-reduced-motion` в src не упоминается ни разу. Fix: матч-медиа гейт + WCAG 2.2.2 пауза/стоп.

#### [F-UX-19] (Confidence: 90/100) MobileMenu: триггер без aria-label
`Header/MobileMenu.tsx:50-52`. Fix: `aria-label="Open menu"`.

#### [F-TQ-04] (Confidence: 85/100) Honeypot «silent 200 + ноль эффектов» не доказан на HTTP-уровне
`src/app/api/booking/route.ts:52-55`, `waitlist/route.ts:31-34`, `resend/route.ts:35-38` — только сервисные тесты. Fix: 2 route-теста: POST с заполненным honeypot → 200 + 0 строк в трёх таблицах.

#### [F-TQ-05] (Confidence: 84/100) Snapshot-сьют error-shapes не расширен каталогом 007
`tests/int/error-shapes.int.spec.ts` vs обещание `specs/007-booking-trust-gate/tasks.md:59`. Fix: заморозить code→status→shape для INTENT_CAP/INTENT_DEAD/OTP_INVALID/BLACKLISTED/INTENT_CONSUMED/RATE_LIMITED(+retryAfterSec).

#### [F-TQ-06] (Confidence: 82/100) TTL 48h opt-in: отказ confirm после 48h не покрыт
`waitlistService.ts:411-413` vs `trust-gate.int.spec.ts:629-654`. Fix: backdate 49h + валидный токен → WAITLIST_TOKEN_INVALID 403.

#### [F-TQ-07] (Confidence: 90/100) test.skip документирует нерешённый продуктовый баг (checkout при inventory=0 проходит)
`tests/e2e/frontend.e2e.spec.ts:350-352` — SKIPPED ≠ PASSED (constitution XII). Fix: баг-трек + ссылка в комментарии.

---

## 3. 🧹 Architecture, Tests & Anti-Slop ([SUGGESTION])

#### [F-BE-11] (Confidence: 90/100) `console.error` debug-остатки вместо payload.logger
`bookingService.ts:302` (`[003-debug]`), `telegram/client/webhook/route.ts:37`, `telegram/staff/webhook/route.ts:29`.

#### [F-BE-12] (Confidence: 90/100) Waitlist-claim: доменная логика продублирована в роуте и сервисе (уже разошлись)
`app/api/waitlist/[entryId]/claim/route.ts:44-144` vs `waitlistService.ts:463-558`; клиентский idempotencyKey в роуте — второй вход IDOR-вектора F-BE-02. Fix: роут делегирует сервису.

#### [F-BE-13] (Confidence: 85/100) Staff-alert в clientBot шлёт в пустой chatId → dead-letter на каждый cancel
`clientBot.ts:93-101` (`TELEGRAM_STAFF_CHAT_IDS?.split(',')[0] ?? ''`). Fix: `staffChatTargets(payload)`, не enqueue при пустом списке.

#### [F-BE-14] (Confidence: 80/100) Reschedule не проверяет новый слот против сетки (рабочие часы/исключения)
`bookingService.ts:911-919`. Fix: `resolveAvailability` перед clash-чеком.

#### [F-BE-15] (Confidence: 80/100) Replay потреблённого PREPAID-интента возвращает booking без clientSecret
`bookingService.ts:104-110` + `intentService.ts:315-325`. Fix: дочитать payment_mode/stripe_payment_intent_ref из orders.

#### [F-BE-16] (Confidence: 85/100) Client-флоу колбэков мёртв: продюсер `c:*`-карточек не существует, blacklist-ветка шлёт без messageId
`clientBot.ts:62-72,24-28`. Fix: дособрать продюсер или удалить; blacklist — с реальным messageId.

#### [F-UX-20] (Confidence: 85/100) Остатки шаблона и off-palette синий
`MobileMenu.tsx:56` («My Store»), `Footer/index.tsx:57` («Designed in Michigan»), `error.tsx:14` (`bg-blue-600`), `Grid/tile.tsx:8`, `EditItemQuantityButton.tsx:62`. Fix: SITE_NAME, primary-токены вместо blue.

#### [F-TQ-08] (Confidence: 88/100) Мёртвый spy в tokens-sweep
`tests/int/tokens-sweep.int.spec.ts:247-249` (`void sendSpy`). Fix: удалить.

#### [F-TQ-09] (Confidence: 84/100) env-мутация без restore (RESEND_API_KEY) — зависимость от isolate:true
`waitlist.int.spec.ts:43-44`, `trust-gate.int.spec.ts:34`. Fix: паттерн tokens-sweep (save/restore).

#### [F-TQ-10] (Confidence: 82/100) api.int.spec.ts — шаблонный scaffold без ценности
`tests/int/api.int.spec.ts:14-19`. Fix: удалить или заменить реальным smoke-гейтом.

#### [F-TQ-11] (Confidence: 81/100) makePendingIntent изолирует RL-бакеты случайными IP — heisenflake ~0.3%
`trust-gate.int.spec.ts:320`. Fix: детерминированная последовательность.

#### [F-TQ-12] (Confidence: 80/100) e2e не покрывает waitlist double-opt-in UX (scanner-safe лендинг F9)
`tests/e2e/**` — 0 упоминаний waitlist/otp. Fix: один e2e: join → лендинг → confirm → waiting.

---

## Canon adherence (что сделано правильно)

**Backend:** advisory-locks + CAS с проверкой rowCount на domain-путях (cancel/approve/holdSweep/reschedule), ordered-lock deadlock-free в reschedule; webhook-dedupe в одной транзакции с доменными записями; вся крипто-постоянство — sha256/HMAC + timingSafeEqual; PII-гигиена (salted recipientHash, redaction, OTP-письмо без имени/телефона, GDPR-пурги); raw SQL полностью параметризован; Telegram outbox — канонический CTE FOR UPDATE SKIP LOCKED с lease/backoff/dead-letter.

**UX:** честные ошибки без фейковых успехов во всём booking-флоу; двойной сабмит защищён системно; scanner-safe паттерн (GET рендерит, POST мутирует) проведён через все email-ссылки с докблоками; a11y-safe honeypot; OTP-инпут по канону (inputMode/autoComplete/санитизация); focus-ринги и role="alert"/"status".

**Tests:** 186 int-тестов зелёные, NFR-701 выполнен фактически (18 спеков: booking-fsm 43, trust-gate 22, payments-invariants 13, …; e2e 25); Risk-20 STM-покрытие настоящее (×20 concurrent verify → 1 бронь; claim-race ×100); PII-дисциплина ассертится, а не декларируется; единый TRUNCATE-канон; fake-Resend транспорты с restore в finally.

---

## VERDICT

```yaml
verdict: CRITICAL
reviewer: zcode
reviewed_at: 2026-11-12T00:30:00+02:00
critical_count: 3   # BLOCKER
high_count: 11      # CRITICAL
warning_count: 22
suggestion_count: 12
```

**REWORK REQUIRED** — 3 BLOCKER + 11 CRITICAL. Приоритетная очередь фиксов:

1. **F-BE-01** миграция (любой fresh-деплой мёртв — это раньше всех стреляет).
2. **F-BE-02** IDOR idempotencyKey (деньги/доступ, фикс локальный и быстрый).
3. **F-BE-04** staff-auth тавтология (полные права по форварду карточки).
4. **F-BE-03 + F-BE-05** webhook-CAS и токены в job input.
5. **F-TQ-01/02/03** e2e + route-тесты (закрывают слепую зону над всем этим).
6. **F-UX-03/04/05** тупики воронки (OTP-шаг без выхода, тихий submit, вечный спиннер после оплаты) + **F-UX-02** контраст.

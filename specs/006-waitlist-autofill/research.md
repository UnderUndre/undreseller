# Research: 006-waitlist-autofill

> Plan Phase 0 — Engineering Decisions (D1–D6). Grounding: 001–005 as-built + manual-QA fixes (`4c0d1ab`), FSM-канон (`bookingFsm.ts`), hold-sweep (T050-канон).

## D1. Claim = FSM `CREATE_BOOKING` (audit C1 — никакой новой статус-машины)

- **Decision**: claim-эндпоинт вызывает существующий `bookingService.createBooking` с зафиксированными `startTime/endTime` освобождённого слота: FREE-трек → CONFIRMED немедленно; FULL_PREPAYMENT → HELD 15m (штатный канон + платёжная ссылка из ответа). Waitlist-запись → `converted`. Конкурентный проигравший получает SLOT_TAKEN (advisory lock + GiST канон 002 — гонка уже закрыта на уровне БД).
- **Rationale**: единственный status-writer остаётся bookingService; «10-минутный HOLD» из rev 1.0 нарушал трек (audit C1); повторная реализация холда не нужна — PREPAID уже имеет TTL-механику.
- **Alternatives**: отдельная WAITLIST_HELD-статика (новый FSM-статус — Via Negativa: двe машины состояния хуже одной).

## D2. Токен claim: вычислимый HMAC с солью версии (канон 005)

- **Decision**: claim-токен = `hashToken('waitlist:v<campaign>:' + entryId)` — без БД-хранения; ротация не нужна (истёк кампанией); одноразовость обеспечивается переходом статуса `notified → converted/expired` (CAS-UPDATE при claim: `WHERE status='notified' AND campaign_id=$1`).
- **Rationale**: ноль секретов в БД; replay после converted → 403/409 по статусу.

## D3. Триггер матчинга: хук RELEASED (event, не polling)

- **Decision**: точка интеграции — после успешного перевода брони в RELEASED (cancelBooking / releaseAfterPaymentInitFailure / holdSweep / approveBooking-reject). Вместо правки четырёх мест — **Payload Job `waitlist-match` с enqueue из единой функции `notifySlotFreed(resourceId, productId, startUtc, endUtc)`**, вызываемой из точки RELEASED (одно место в bookingService + один вызов в holdSweep). Job матчит и шлёт письма.
- **Rationale**: синхронный матчинг тормозит cancel-path; job'ы идемпотентны (idempotencyKey = reservationId); retry бесплатно.

## D4. Камп-модель против notify-циклов (audit M1)

- **Decision**: WaitlistEntry.campaignCount (int, default 0) + activeCampaignAt (nullable). Матчинг берёт записи: status='waiting' AND campaignCount < 3 → notify → campaignCount++, activeCampaignAt=now, status='notified'. Sweep: notified старше 30 мин → status='waiting' (re-arm) ИЛИ campaignCount≥3 → 'expired' + финальное письмо. Claim → 'converted'.
- **Rationale**: hold-expiry→RELEASED→notify→не-claim→TTL→RELEASED... цикл уходит в 3 итерации максимум.

## D5. Email-канон: Resend + `EmailDeliveryLog` (003 реюз)

- **Decision**: письмо — `lib/email/templates.ts` + `sendEmail` + `logDelivery(kind='waitlist')`; SUMMARY = услуга/время; claim-ссылка = `https://host/book/waitlist-claim?entry=<id>&token=<hmac>`. Расширение `kind` enum EmailDeliveryLog на `'waitlist'` (additions-only, X-канон).
- **Rationale**: PII-канон и retry-механика уже построены (003 T330).

## D6. UI: join-форма в SlotGrid + claim-страница

- **Decision**: (1) `SlotGrid`: ветка «No available slots» → инлайн-форма (имя/телефон/email) → `POST /api/waitlist` (вместо глухой надписи). (2) `src/app/(app)/book/waitlist-claim/page.tsx` — подтверждение клиента: показывает «Слот <время> свободен — закрепить за вами?» + кнопка Confirm (POST claim) → редирект на confirmation/hold-страницу. Неавто-бронирование: клиент осознанно жмёт (табу «NO AUTO-BOOK»).
- **Rationale**: авто-claim при маунте страницы = лишний вектор спама; явный клик = осознанное намерение (manual-QA урок про StrictMode-дубли — 409 тут трактуется как «слот уже закреплён», канон AcknowledgeClient-фикса).

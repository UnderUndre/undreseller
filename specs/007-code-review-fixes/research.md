# Research: 007-code-review-fixes

> Plan Phase 0 — Engineering Decisions. Format: Decision / Rationale / Alternatives / Spike Governance.

Контекст: спека rev 1.1 (audit PASS, requirements-audit/007-code-review-fixes/v1). Все проблемы локализованы в существующих файлах; новая архитектуры нет.

## D1. Fail-closed секреты: паттерн канона `adminAuth.ts`

- **Decision**: `getRescheduleSecret()` — throw при отсутствии обоих env; HTTP-слой (`staffBot` webhook route reschedule-ветки) ловит конфигурационную ошибку → **503** + лог `[RESCHEDULE_SECRET_UNCONFIGURED]` + `answerCallbackQuery` с алертом (предотвращает шторм повторов Telegram Bot API и зависание UI оператора). `verifyMagicRescheduleToken` при неконфигурированном секрете явно возвращает `{ valid: false, reason: 'RESCHEDULE_SECRET_UNCONFIGURED' }` (не маскирует под `DECODE_FAILURE`). `deliveryLog` — при отсутствии соли цель `UNHASHED` + boot-алерт (не throw — логирование не должно валить деньги-путь).
- **Rationale**: единый семантический код «зависимость не сконфигурирована» по всей кодовой базе (audit R1); логирование деградирует, но не роняет (delivery-лог — observability, не money-path); Telegram не спамит повторами вебхука.
- **Alternatives**: throw из deliveryLog (валит фулфилмент на missing env — отвергнуто); 500 вместо 503 (не отличает конфиг от бага — audit R1).
- **Spike Governance**: не требуется — чистая stdlib-правка.

## D2. Amount invariant: provider-aware сверка внутри `fulfillPayment`

- **Decision**: сверка суммы и валюты адаптируется под семантику провайдера:
  1. Для `TELEGRAM_STARS`: `currency === 'XTR'` и `amountMinor === (order.starsPrice ?? Math.max(1, Math.round(order.totalMinor / 2)))` (Stars оперирует целыми XTR, заказ хранится в фиатных центах).
  2. Для `STRIPE` и `CRYPTO_GATEWAY`: `amountMinor === order.totalMinor` и `currency.toUpperCase() === order.currency.toUpperCase()`. В `stripe/webhook/route.ts` передаётся `parsed.currency` (не хардкодится `'USD'`).
  3. PaymentEvent записывается всегда (immutable ledger факта платежа), mismatch меняет только целевой статус ветки: `PAID_REQUIRES_RESOLUTION` + `AMOUNT_MISMATCH_MANUAL_RESOLUTION` + refund-request `idempotencyKey: amount_mismatch_<orderId>_<providerRef>`.
- **Rationale**: Telegram Stars и мультивалютный Stripe не ломаются на ровном месте; PaymentEvent — журнал фактов; канон OVERBOOKED-пути уже даёт готовую ветку operator-action.
- **Alternatives**: 422 наружу из webhook (нарушает контракт провайдера — webhooks должны 200); reject webhook (провайдер ретраит вечно); наивная проверка без учёта Stars (ломает 100% Stars-оплат).
- **Spike Governance**: не требуется.

## D3. Таймауты: `AbortSignal.timeout(10_000)` нативно + break на timeout

- **Decision**: обернуть 3 call-site (emailProvider.send, nowpayments invoice create, whatsappClient) — Node 22 нативно поддерживает `AbortSignal.timeout`. В `whatsappClient.ts` при `AbortError`/`TimeoutError` цикл retry немедленно прерывается (не ждёт 3 попытки по 10с = 30с). Таймаут ловится существующими catch-ветками → `FAILED` delivery-статус.
- **Rationale**: ноль новых deps (NFR-702); 10 с = 2× бюджет webhook p95 (5 с, NFR-604) — зависший upstream не блокирует дольше 10.5 с суммарно.
- **Alternatives**: abort-controller вручную (шум); повторы при таймауте (нарушают бюджет 10.5 с).
- **Spike Governance**: не требуется.

## D4. Lockout registry: `userExists` guard + TTL-эвикция + LRU hard-cap 1000

- **Decision**: `Map` + проверка существования пользователя перед регистрацией неудачной попытки (спрей несуществующих адресов не засоряет память); при `set` — свип записей с `(lockedUntil === null || lockedUntil < now) && updatedAt < now-15min`; при размере ≥1000 — вытеснение старейшей неактивной записи, а если ВСЕ 1000 записей активны (атака распределённого локаута) — вытеснение записи с минимальным `lockedUntil`. Замер RSS 5000 спрей-попыток → `evidence/lockout-rss.json`.
- **Rationale**: O(1) амортизированно; потолок 1000 записей (~100 KB) непреодолим ни при каком виде DoS/спрея; легитимные пользователи защищены.
- **Alternatives**: LRU-библиотека (новый dep — NFR-702); наивный «никогда не вытеснять активный лок» (пробивает кап при спрее 1000+ адресов).
- **Spike Governance**: не требуется.

## D5. WhatsApp verify: length-guard по буферам + `timingSafeEqual`

- **Decision**: `hub.verify_token` — safe compare буферов `Buffer.from(a, 'utf-8')` и `Buffer.from(b, 'utf-8')` с проверкой `bufA.length === bufB.length` перед вызовом `timingSafeEqual` (ноль RangeError при любых multi-byte UTF-8 строках). Ответ 403 идентичен для всех неуспехов.
- **Rationale**: чеклист security-auditor §1 (запрет `===` на секретах, защита от RangeError в crypto stdlib).
- **Spike Governance**: не требуется.

## D6. Reconcile окно: константа 7 дней + `updatedAt asc`

- **Decision**: `since = now - 7d` (горизонт слотов, канон NFR-001), `orderBy: { updatedAt: 'asc' }` (старейшие первыми), `take: 50` сохранён.
- **Rationale**: шторм после простоя дpeinится циклами по 50 (15-мин cron — 4800 заказов/сутки потолок дренирования, >> масштаба ≤2k броней/мес).
- **Spike Governance**: не требуется.

## Сводка spike-governance

**0 спайков**: все решения — точечные правки существующих файлов по канонам (fail-closed, timing-safe, minor units). Constitution XI соблюдён.

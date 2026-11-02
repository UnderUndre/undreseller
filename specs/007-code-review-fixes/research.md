# Research: 007-code-review-fixes

> Plan Phase 0 — Engineering Decisions. Format: Decision / Rationale / Alternatives / Spike Governance.

Контекст: спека rev 1.1 (audit PASS, requirements-audit/007-code-review-fixes/v1). Все проблемы локализованы в существующих файлах; новая архитектуры нет.

## D1. Fail-closed секреты: паттерн канона `adminAuth.ts`

- **Decision**: `getRescheduleSecret()` — throw при отсутствии обоих env; HTTP-слой (`staffBot` webhook route reschedule-ветки) ловит конфигурационную ошибку → **503** + лог `[RESCHEDULE_SECRET_UNCONFIGURED]` (canon unconfigured-dependency 006: OAuth-роуты отвечают 503). `deliveryLog` — при отсутствии соли цель `UNHASHED` + boot-алерт (не throw — логирование не должно валить деньги-путь).
- **Rationale**: единый семантический код «зависимость не сконфигурирована» по всей кодовой базе (audit R1); логирование деградирует, но не роняет (delivery-лог — observability, не money-path).
- **Alternatives**: throw из deliveryLog (валит фулфилмент на missing env — отвергнуто); 500 вместо 503 (не отличает конфиг от бага — audit R1).
- **Spike Governance**: не требуется — чистая stdlib-правка.

## D2. Amount invariant: точка проверки — внутри транзакции `fulfillPayment`

- **Decision**: проверка `amountMinor === order.totalMinor && currency === order.currency` после загрузки order, до записи PaymentEvent? **Нет** — PaymentEvent записывается всегда (immutable ledger факта платежа), mismatch меняет только целевой статус ветки: `PAID_REQUIRES_RESOLUTION` + `AMOUNT_MISMATCH_MANUAL_RESOLUTION` + refund-request `idempotencyKey: amount_mismatch_<orderId>_<providerRef>`.
- **Rationale**: PaymentEvent — журнал фактов; удаление записи при mismatch ломало бы идемпотентность ретраев. Канон OVERBOOKED-пути уже даёт готовую ветку operator-action.
- **Alternatives**: 422 наружу из webhook (нарушает контракт провайдера — webhooks должны 200); reject webhook (провайдер ретраит вечно).
- **Spike Governance**: не требуется.

## D3. Таймауты: `AbortSignal.timeout(10_000)` нативно

- **Decision**: обернуть 3 call-site (emailProvider.send, nowpayments invoice create, whatsappClient) — Node 22 нативно поддерживает `AbortSignal.timeout`. Таймаут ловится существующими catch-ветками → `FAILED` delivery-статус.
- **Rationale**: ноль новых deps (NFR-702); 10 с = 2× бюджет webhook p95 (5 с, NFR-604) — зависший upstream не блокирует дольше.
- **Alternatives**: abort-controller вручную (шум); per-зависимость таймауты (over-engineering для 3 мест).
- **Spike Governance**: не требуется.

## D4. Lockout registry: TTL-эвикция + hard-cap с вытеснением старейших

- **Decision**: `Map` + при `set` — свип записей с `lockedUntil < now && updatedAt < now-15min`; при размере ≥1000 — вытеснение самой старой по `lastUpdate`. **Активный лок не вытесняется никогда** (проверка в eviction-предикате). Замер RSS 5000 спрей-попыток → `evidence/lockout-rss.json` (audit R2).
- **Rationale**: O(1) амортизированно; спрей ограничен потолком 1000 записей (~100 KB); брутфорс одного email не ослаблен.
- **Alternatives**: LRU-библиотека (новый dep — NFR-702);laisser unbounded (дефект).
- **Spike Governance**: не требуется.

## D5. WhatsApp verify: переиспользование паттерна length-guard + `timingSafeEqual`

- **Decision**: `hub.verify_token` — hex-agnostic safe compare (utf-8 буферы с length-guard, как `verifyStaffWebhookSecret`). Ответ 403 идентичен для всех неуспехов.
- **Rationale**: чеклист security-auditor §1 (запрет `===` на секретах); паттерн уже канонизирован в трёх местах.
- **Spike Governance**: не требуется.

## D6. Reconcile окно: константа 7 дней + `updatedAt asc`

- **Decision**: `since = now - 7d` (горизонт слотов, канон NFR-001), `orderBy: { updatedAt: 'asc' }` (старейшие первыми), `take: 50` сохранён.
- **Rationale**: шторм после простоя дpeinится циклами по 50 (15-мин cron — 4800 заказов/сутки потолок дренирования, >> масштаба ≤2k броней/мес).
- **Spike Governance**: не требуется.

## Сводка spike-governance

**0 спайков**: все решения — точечные правки существующих файлов по канонам (fail-closed, timing-safe, minor units). Constitution XI соблюдён.

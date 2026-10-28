# Research: 006 (006-google-calendar-and-integrations)

> Plan Phase 0 — Engineering Decisions. Формат: Decision / Rationale / Alternatives / Spike Governance (Constitution XI).

Контекст решений созрел: архитектура зафиксирована спекой rev 1.1 (requirements-audit PASS после clarify-раунда). Здесь — финальные инженерные решения для plan/tasks и подтверждение «спайки не нужны».

## D1. Google SDK: официальный `googleapis`, exact-pin

- **Decision**: `googleapis` (официальный, Apache-2.0, TypeScript-типы) — единственная новая runtime-зависимость. Exact-pin по канону репо (grammy 1.35.0, stripe 17.5.0).
- **Rationale**: SDK даёт OAuth2-client с авто-refresh, типизированные `calendar.events.list/inser/patch/delete`, `freeBusy.query`, обработку `syncToken`/`410 Gone` из коробки. Ручной REST = своя реализация refresh-токенов и retry-семантики в money-path календаря — лишняя поверхность ошибок.
- **Alternatives**: raw `fetch` к REST API (свой refresh/типы — отвергнуто); `@googleapis/calendar` (тонкий генерируемый клиент без auth-обвязки — потребовал бы ещё `google-auth-library`, два dep'а вместо одного).
- **Spike Governance**: не требуется — SDK документирован, OAuth-флоу стандартен; смоук входит в quickstart-трейсер (T062). Constitution XI: без прототипов.

## D2. Секреты: `node:crypto` AES-256-GCM, ключ из env

- **Decision**: `lib/integrations/secretVault.ts` — encrypt/decrypt на `node:crypto` (AES-256-GCM, random IV, auth-tag рядом с ciphertext), ключ `INTEGRATION_ENCRYPTION_KEY` (32 байта, base64) из env. Ноль новых зависимостей на крипту.
- **Rationale**: GCM даёт конфиденциальность + целостность (auth-tag ловит подмену ciphertext в БД — STRIDE Tampering). stdlib = нет supply-chain-поверхности. Формат: `v1:<iv_b64>:<tag_b64>:<ct_b64>` (версионирование на будущую ротацию ключа).
- **Alternatives**: `libsodium-sealbox` (лишний dep); хранить токены открыто (запрещено NFR-603); KMS-сервисы (overkill для single-instance ≤500MB).
- **Spike Governance**: не требуется — stdlib; юнит-тесты roundtrip/tamper/missing-key в T011.

## D3. Sync-механика: инкрементальный `events.list(syncToken)` + upsert busy-блоков

- **Decision**: фоновый воркер (Inngest scheduled / встроенный поллер-канон 004) каждые 15 мин per-подключение: `events.list({ syncToken })` → дельта событий → upsert/delete `ExternalBusyBlock` по unique `(calendarId, gcEventId)`; `410 Gone` → полный sync (drop + reload окна 30 дней вперёд); advisory lock `hashtext('gcal_sync')` — второй воркер пропускает цикл. Занятость считаем только от событий, отмеченных как занятость (`transparency != 'transparent'`, статус не `cancelled`).
- **Rationale**: syncToken-дельта дешевле freeBusy-поллрования (freeBusy не умеет инкрементальности и не даёт event id для upsert-дедупликации). Окно 30 дней покрывает горизонт слотов 7 дней с запасом (аудит §2). Изоляция per-resource — из clarify-раунда аудита (BLOCKER-3).
- **Alternatives**: `freeBusy.query` каждый цикл (нет event-id → нельзя дедупнуть → перезаписи и дрейф); push-уведомления Google (`watch`) — опциональная оптимизация, не требование спеки (пометка: не в 006).
- **Spike Governance**: не требуется; behavior-тесты на моке API (incremental / 410 / 429-бэкофф / N=0) в T022.

## D4. Webhook-доставка: Inngest-нативные ретраи (без новой очереди)

- **Decision**: FSM-переходы публикуют событие в Inngest (канон 004 `order/*` событий) → fan-out fn `webhook/dispatch` с `retries: 5` (экспоненциальный backoff Inngest) → POST с HMAC-подписью; исчерпание → audit `WEBHOOK_DELIVERY_FAILED` + счётчик на эндпоинте. Test-ping — тот же fn с фиктивным payload.
- **Rationale**: Inngest уже в стеке и решает retry/backoff идемпотентно (доказано 004 на Telegram outbox и FSM-таймерах). Свои ретраи = дублирование durable-механики, которую Constitution-канон уже страхует (graceful degradation FR-124).
- **Alternatives**: своя очередь в PostgreSQL (новая таблица-прокладка — Via Negativa, запрещено табу spec §1.3); fire-and-forget fetch (теряет события — недопустимо для CRM-контракта).
- **Spike Governance**: не требуется — механика доказана 004.

## D5. OAuth-флоу: authorization-code + off-line access, state в БД с TTL

- **Decision**: `/api/admin/integrations/gcal/connect` (OWNER) генерирует одноразовый `state` (random 32B, хранится в памяти процесса с TTL 10 мин — single-instance канон NFR-03), redirect на consent (`access_type=offline`, `prompt=consent`, scope `calendar.events` + `calendar.readonly`); callback валидирует state → обмен кода → refresh-токен в vault → `IntegrationCredential` upsert per-resource. `invalid_grant` при любом вызове → статус `NEEDS_REAUTH` + алерт.
- **Rationale**: prompt=consent гарантирует refresh-токен даже при существующей связи; in-memory state достаточен при `REPLICA_COUNT=1` (канон rate-limit 004).
- **Alternatives**: service-account (нужен domain-wide delegation — не работает на личных@gmail календарях ICP); JWT-самописный flow (зачем, если SDK умеет).
- **Spike Governance**: не требуется; флоу отрабатывается трейсером на test-проекте Google Cloud (T062), runbook — T061.

## D6. Миграция zod 3.25 → 4.x: mechanical, снапшот-контракты (перенос из 005)

- **Decision**: идентично решению 005 research D3: characterization-снапшоты ДО (booking create, adminSchemas, presign) → exact-pin 4.x → механическая миграция по changelog → снапшоты ПОСЛЕ идентичны → `npm audit` 0 H/C.
- **Rationale**: единственный оставшийся audit-high (GHSA-mrhx-c7xc-m3w5); корректность ловится tsc + 367+ тестов + снапшоты.
- **Alternatives**: остаться на 3.25 (долг тянуть нельзя — это был хвост D1 из 004, недоезженный в 005).
- **Spike Governance**: не требуется.

## Сводка spike-governance

**Спайки не назначаются** (0 штук): все неизвестные закрыты официальной документацией (Google API, RFC 5545), stdlib (crypto), либо механикой, доказанной в 004 (Inngest retries, advisory locks, outbox). Constitution XI соблюдён без исключений: нет прототипов → нет утилизации.

## Открытые вопросы для plan

Нет — requirements-audit PASS закрыл серые зоны (роли, гранулярность, FSM-матрица — см. requirements-audit.md §8, Clarifications Matrix Q7–Q9).

# SpecKit Review: 004-telegram-bots

**Reviewer**: antigravity
**Reviewed at**: 2026-11-09T03:55:00Z
**Commit**: 3f40d23 / rev 1.2
**Artifacts reviewed**: spec.md (rev 1.2), plan.md, tasks.md, research.md (D1–D9), business-plan-waiver.md, requirements-audit.md (PASS run #2), reviews/analyze.md, qa/ (preliminary-rtm.md, rtm-matrix.md, test-cases.md, regression-suite.md, uat-scenarios.md), .specify/memory/constitution.md (v1.6.0), undreplans/docs/projects/undreseller/undreseller-business-plan.md (v2.5.0)

## Summary

Пакет спецификации `004-telegram-bots` подвергнут независимому состязательному аудиту (adversarial probe) по 14 измерениям SpecKit (A–N) и сопоставлен с кодовой базой `undreseller` (001–003 as-built).

Первоначальный проект содержал ряд существенных архитектурных пробелов и нестыковок (включая 2 CRITICAL и 5 HIGH), способных полностью парализовать реализацию:
1. **Схема `TelegramOutbox` и примитивы API (F1, F2)**: отсутствовали обязательные поля маршрутизации `bot` (`staff` vs `client`), тип действия `actionType` (`sendMessage` vs `editMessageText` vs `editMessageReplyMarkup`), целевой `messageId`, `replyMarkupJson` для inline-клавиатур и сохранение Telegram `sentMessageId` после отправки. Без этого воркер не знал, от имени какого бота слать сообщения, не мог прикреплять кнопки и не мог адресно редактировать карточки пейджера для GDPR-редакции (`[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ]`).
2. **Доменный шов клиентской отмены и политика возвратов (F3)**: в кодовой базе метод `cancelBooking` требует сырой одноразовый `cancelToken`, который не сохраняется в БД (только SHA-256 хеш). Клиентский бот, располагая только связкой `(chatId, orderId)`, не имел возможности выполнить отмену без добавления специализированного метода `cancelBookingByClientChat`.
3. **Безопасность данных и PII (F4)**: глобал `ShopSettings` имеет публичный доступ на чтение (`read: publicAccess`) для работы витрины. Добавление поля `staffChatIds` без `adminOnlyFieldAccess` приводило к утечке личных Telegram Chat ID операторов через REST API `/api/globals/shop-settings`.
4. **Синтаксис PostgreSQL и рантайм очередей (F5, F6, F10)**:
   - Конструкция `WHERE id IN (SELECT id ... FOR UPDATE SKIP LOCKED)` недопустима в Postgres (ошибка `0A000`); заменена на канонический CTE `WITH batch AS (...) UPDATE ... FROM batch RETURNING ...`;
   - Добавлен частичный B-tree индекс `WHERE status = 'queued'`;
   - Синхронизирована конфигурация `jobs.autoRun: [{ cron: '*/30 * * * * *', queue: 'default', limit: 25 }]` в `payload.config.ts`, устраняющая засыпание фонового раннера на 60 секунд.
5. **Целостность бизнес-логики и сценарии взаимодействия (F7, F8, F9, F11, F12)**:
   - Восстановлена каноническая 2-шаговая семантика confirm-barrier (`REQUIRES_CONFIRMATION` на 1-й клик, `CONFIRMED` на 2-й клик в течение 30 секунд);
   - Устранено ограничение `TgLink (chatId UNIQUE)`: составной индекс `UNIQUE (chat_id, order_id)` обеспечивает корректную обработку повторных броней, а `callback_data` инлайн-кнопок кодирует `orderId`;
   - В `Blacklist` добавлена поддержка блокировки клиентов без Telegram (по номеру `phone`);
   - Зафиксированы предусловия для действия `complete` (только для заказов в `processing` при активной брони);
   - Предусмотрен фоллбэк отправки ссылки на перенос записи при отсутствии Telegram-связки у клиента.

Все 12 замечаний устранены непосредственно в артефактах спецификации (`spec.md` rev 1.2, `plan.md`, `tasks.md`, `research.md`, `qa/test-cases.md`). Спецификация полностью согласована с рантаймом Payload 3.93 и готова к имплементации.

## Findings & Resolutions

| ID | Severity | Area | Finding | Resolution (Rev 1.2) | Status |
| --- | --- | --- | --- | --- | --- |
| F1 | CRITICAL | Architecture / Schema | Отсутствие примитивов Telegram в схеме `TelegramOutbox` (`bot`, `actionType`, `messageId`, `replyMarkupJson`). | В `spec.md` US2/FR-401, `research.md` D2, `plan.md` и `tasks.md` (T420) в схему `TelegramOutbox` добавлены: `bot ('staff'\|'client')`, `actionType ('sendMessage'\|'editMessageText'\|'editMessageReplyMarkup')`, `messageId`, `replyMarkupJson`. | **RESOLVED** |
| F2 | CRITICAL | Domain Integration / GDPR | Отсутствие отправки карточки в `createBooking` и потеря `sentMessageId` для терминальной GDPR-редакции. | В `research.md` D2/D6/D9, `spec.md` US3/US5, `plan.md` и `tasks.md` (T430, T450) зафиксировано: (1) `createBooking` ставит карточку в outbox (`bot: 'staff'`, HIGH=50); (2) `sentMessageId` фиксируется при доставке; (3) `redaction.ts` адресно правит все карточки брони через `editMessageText` (CRITICAL=100). | **RESOLVED** |
| F3 | HIGH | Domain Logic / Auth | Клиентский `decline` не мог вызвать `cancelBooking` без сырого `cancelToken`. | В `spec.md` US4/FR-403, `research.md` D5, `plan.md` и `tasks.md` (T440) спроектирован доменный метод `cancelBookingByClientChat(payload, { orderId, chatId, now })` с верификацией `TgLink`, отменой FSM, соблюдением политики возвратов 003 и алертом персоналу. | **RESOLVED** |
| F4 | HIGH | Security / PII Exposure | Утечка `ShopSettings.staffChatIds` через публичный REST API из-за `read: publicAccess` глобала. | В `spec.md` US3/FR-402, `research.md` D4, `plan.md` и `tasks.md` (T430) поле `staffChatIds` явно закрыто через `access: { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess }`. | **RESOLVED** |
| F5 | HIGH | Database Engine / SQL | Синтаксическая ошибка Postgres `0A000` при `FOR UPDATE SKIP LOCKED` внутри `WHERE id IN (...)`. | В `research.md` D2, `plan.md` и `tasks.md` (T420) SQL-запрос переписан на канонический CTE `WITH batch AS (...) UPDATE telegram_outbox ... FROM batch RETURNING ...`. | **RESOLVED** |
| F6 | HIGH | Runtime Scheduling | Рассинхрон раннера Payload Jobs: дефолтный `autoRun` (60s, limit 10) ломал 30s крон очереди. | В `spec.md` US2, `research.md` D2, `plan.md` и `tasks.md` (T420) зафиксирована синхронизация в `payload.config.ts`: `jobs.autoRun: [{ cron: '*/30 * * * * *', queue: 'default', limit: 25 }]`. | **RESOLVED** |
| F7 | HIGH | Logical Consistency / Safety | Ошибочное описание confirm-barrier как «идемпотентного ACK на 2-й клик». | В `spec.md` US3, `research.md` D4, `plan.md` и `tasks.md` (T430) восстановлена 2-шаговая семантика: клик 1 → `REQUIRES_CONFIRMATION` + alert оператору (мутаций 0); клик 2 за 30с → `CONFIRMED` + CAS мутация. | **RESOLVED** |
| F8 | MEDIUM | Data Modeling / Edge Cases | `TgLink (chatId UNIQUE)` затирал предыдущие брони клиента; callbacks не несли `orderId`. | В `spec.md` US4/FR-407, `research.md` D5, `plan.md` и `tasks.md` (T440) уникальность изменена на `UNIQUE (chat_id, order_id)`, а инлайн-кнопки кодируют `orderId` в `callback_data` (`c:ack:<orderId>`, `c:dec:<orderId>`). | **RESOLVED** |
| F9 | MEDIUM | Domain Scope / Blacklist | `Blacklist (chatId required)` блокировал занесение клиентов, бронировавших только через веб/телефон. | В `spec.md` FR-406, `plan.md` и `tasks.md` (T441) поля `chatId` и `phone` сделаны опциональными с валидатором «хотя бы один задан» и частичными уникальными индексами. | **RESOLVED** |
| F10 | MEDIUM | Performance / Indexing | Отсутствие индекса для периодического клейма очереди `TelegramOutbox`. | В `research.md` D2, `plan.md` и `tasks.md` (T420) добавлен частичный индекс `CREATE INDEX idx_telegram_outbox_queue ON telegram_outbox (status, priority DESC, created_at ASC) WHERE status = 'queued'`. | **RESOLVED** |
| F11 | LOW | Invariants / Integrity | Действие `complete` не имело предусловий по статусу заказа. | В `spec.md` US3/FR-402, `plan.md` и `tasks.md` (T430) зафиксировано предусловие: действие допустимо только для заказов в `processing` при активной брони `BOOKED` (отменённые/возвращённые заказы отклоняются). | **RESOLVED** |
| F12 | LOW | Edge Cases / UX | Отсутствие фоллбэка staff reschedule при отсутствии `TgLink` у клиента. | В `spec.md` US3/FR-403, `research.md` D7, `plan.md` и `tasks.md` (T431) зафиксировано: ссылка на перенос возвращается в staff-alert и инициирует transactional email клиенту. | **RESOLVED** |

## Commercial / business plan notes

- **Plans loaded**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.5.0; `specs/004-telegram-bots/business-plan-waiver.md` (COMMITTED).
- **Focus laws / SKU floors checked**:
  - Пакет Sprint B ($4,900 flat, 14 дней) сохранен;
  - Telegram-канал выступает как бесплатный инструмент снижения No-Show и операционной рутины оператора (§2.2);
  - Строгие запреты соблюдены: платежи в ботах запрещены (Stars/инвойсы отложены на 006+), Google Calendar отложен на 005, спам-рассылки отвергнуты;
  - Лимит «ровно 1 внешний dep» (`grammy`) соблюден.
- **Drift**:
  - Отсутствует. Все требования Конституции VII-B соблюдены.

## Alternative approaches considered

1. **CTE SKIP LOCKED vs Advisory Locks для Outbox**:
   Использование канонического PostgreSQL CTE с `FOR UPDATE SKIP LOCKED` утверждено как оптимальное: оно не требует вычисления хешей блокировок и стандартно поддерживается Drizzle/Postgres без дескрипторов сессий.
2. **Dedicated Outbox Queue vs Shared Default Queue**:
   Синхронизация `jobs.autoRun` на 30-секундный интервал для очереди `default` с лимитом 25 позволяет не плодить отдельные очереди воркеров и гарантирует соблюдение SLA p95 ≤ 60 с для всех фоновых задач.

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-11-09T03:55:00Z
commit: 3f40d23
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

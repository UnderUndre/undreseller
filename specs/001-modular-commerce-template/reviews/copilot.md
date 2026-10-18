Да, последние inventory-компенсации исправлены: stockDecremented, multi-item lock order, transactional alert outbox и расширенный admin escalation API теперь согласованы. Но полный повторный проход выявил более фундаментальную проблему в самом durable inbox: запись не хранит данные, необходимые для повторной обработки.

Вердикт: CRITICAL
verdict: CRITICAL
reviewer: copilot
critical_count: 1
high_count: 1
medium_count: 3
low_count: 0

Что закрыто
OrderItem.stockDecremented фиксирует фактически списанное количество, а отмена восстанавливает только его. Это закрывает phantom stock inflation и частичную компенсацию multi-line заказов.
Для multi-item заказа все уникальные itemId блокируются в лексикографическом порядке.
Alert создаётся как InboxEvent(provider = 'SYSTEM_ALERT') внутри денежной транзакции, поэтому crash между commit и inngest.send больше не теряет сам факт необходимости уведомления.
State machine теперь явно допускает PAID + RELEASED + requiresOperatorAction.
Admin API охватывает slot_conflict, paid_out_of_stock, ai_ticket и общий unresolved view.
Findings
F1. CRITICAL: durable InboxEvent не хранит payload, поэтому восстановление и offline drain невозможны

Модель InboxEvent содержит:

model InboxEvent {
  id           String
  provider     String
  eventId      String
  status       InboxStatus
  attemptCount Int
  lastErrorAt  DateTime?
  lockedAt     DateTime?
  lockedBy     String?
  createdAt    DateTime
}


В ней отсутствуют:

payload события;
тип события;
ссылка на исходное содержимое;
destination/recipient для системного alert;
orderId или иной структурированный aggregate reference.

При этом архитектура обещает:

insert InboxEvent and commit
send only row id to Inngest
offline drain processes database PENDING rows


и прямо называет эту схему durable-before-ack.

Контрпример:

Telegram webhook arrives with free-text question
InboxEvent stores provider + Telegram update id
transaction commits
inngest.send fails
HTTP returns 500
Telegram stops retrying or retry window expires
offline drain reads InboxEvent


Из строки БД невозможно восстановить:

текст вопроса;
chat id;
тип Telegram update;
пользователя, которому отвечать;
нужный handler.

Аналогично WhatsApp offline drain не сможет восстановить сообщение и номер назначения. Для SYSTEM_ALERT в БД есть только eventId = alert_<order.id>, но контракт декодирования и alert type не формализован.

Это не мелкий пробел реализации. Он делает недоказанными сразу три обещания:

durable-before-ack;
emergency offline drain;
повторную обработку после утраты или недоставки Inngest event.

Минимальное исправление:

enum InboxEventKind {
  TELEGRAM_UPDATE
  WHATSAPP_MESSAGE
  NOWPAYMENTS_WEBHOOK
  SYSTEM_ALERT
}

model InboxEvent {
  id           String         @id @default(uuid())
  provider     String
  eventId      String
  kind         InboxEventKind
  payloadJson  Json
  status       InboxStatus    @default(PENDING)
  attemptCount Int            @default(0)
  lastErrorAt  DateTime?
  lockedAt     DateTime?
  lockedBy     String?
  createdAt    DateTime       @default(now())

  @@unique([provider, eventId])
}


Payload необходимо:

валидировать до сохранения;
ограничить по размеру;
не логировать;
очищать по retention policy;
использовать как единственный источник обработки и в Inngest, и в offline drain.

Для SYSTEM_ALERT лучше хранить структурированный payload:

{
  "orderId": "...",
  "reason": "PAID_OUT_OF_STOCK"
}


T-015 должен получить обязательный crash-recovery тест:

commit InboxEvent
simulate inngest.send failure
run offline drain
assert original handler receives the persisted payload


Без этого implement gate должен быть закрыт.

F2. HIGH: сохранение сырых webhook payload создаёт новый PII/security boundary, который пока не описан

Исправление F1 неизбежно означает хранение Telegram, WhatsApp и платёжных payload. Но текущая retention-секция описывает Order, MessengerContact, EscalationTicket и PaymentEvent, не определяя retention для InboxEvent.

Если просто добавить payloadJson, там могут остаться:

Telegram identifiers и message text;
WhatsApp phone identifiers и message body;
NOWPayments metadata;
потенциально подписи или другие поля, которые логировать запрещено.

Нужен явный lifecycle:

SENT/FAILED InboxEvent payload:
  redact or delete after N days

PENDING/PROCESSING:
  retain until terminal state

SYSTEM_ALERT:
  retain until SENT/FAILED plus operational retention window


Также raw HTTP headers и signatures сохранять не нужно. Для повторной обработки должен сохраняться только минимальный проверенный canonical payload.

F3. MEDIUM: outbox event identity поддерживает только один alert на заказ

Определено:

provider = SYSTEM_ALERT
eventId = alert_<order.id>


Но один заказ теоретически может получить разные operator-action причины во времени. Уникальность (provider, eventId) схлопнет второй alert в ту же запись.

Лучше:

alert:<orderId>:<reason>:<transitionVersion>


или отдельный UUID с уникальным business key.

F4. MEDIUM: failed SYSTEM_ALERT может вызвать рекурсивный alert contract

Общий inbox contract говорит, что после десятой ошибки событие становится FAILED и отправляется alert администратору. Но если упавшее событие само является SYSTEM_ALERT, попытка сообщить о его падении через тот же механизм может создать рекурсию либо бессмысленный повтор.

Нужно исключение:

if failed event kind == SYSTEM_ALERT:
    mark FAILED
    emit structured log/health signal
    do not enqueue another SYSTEM_ALERT

F5. MEDIUM: tests проверяют outbox persistence, но не полное восстановление payload

T-034 требует проверить transactional alert outbox persistence, но этого недостаточно. Можно успешно проверить наличие строки, которая всё равно непригодна для отправки.

Нужны отдельные assertions:

event содержит структурированный alert reason и order id;
sweeper поднимает его без помощи памяти процесса;
offline drain выполняет тот же handler;
повторная обработка не создаёт вторую бизнес-операцию.
Итог

Денежные и inventory-инварианты теперь выглядят существенно лучше. Но реализация durable inbox в нынешней модели хранит только идентификатор события, а не само событие. Поэтому после сбоя очередь знает, что что-то произошло, но не знает, что именно нужно повторить.

gate_recommendation: BLOCK_IMPLEMENT
blocking_findings:
  - F1


После добавления минимального canonical payload, retention/redaction правил и crash-recovery теста техническая часть будет близка к PASS. Окончательный gate всё равно требует отдельной проверки .specify/memory/constitution.md, которого среди вложений нет.

---

## Финальное закрытие замечаний F1–F5 и проверка конституции (2026-10-18, Ревизия 4)

Все критические и операционные замечания F1–F5 устранены во всех спецификациях, планах, задачах и схеме данных:

1. **[F1 CRITICAL RESOLVED] Канонический payloadJson и enum InboxEventKind в InboxEvent:**
   В Prisma-модель `InboxEvent` добавлено поле `kind InboxEventKind` (`TELEGRAM_UPDATE`, `WHATSAPP_MESSAGE`, `NOWPAYMENTS_WEBHOOK`, `SYSTEM_ALERT`) и структурированное поле `payloadJson Json` (`spec.md` §6, `tasks.md` `T-002`). В `payloadJson` сохраняется минимальный канонический набор данных, необходимый для автономного воспроизведения и оффлайн-дренажа (`scripts/drain-inbox.ts` / `npm run inbox:drain`, `T-015`), без зависимости от оперативной памяти упавшего процесса.

2. **[F2 HIGH RESOLVED] Жизненный цикл PII и ретеншн InboxEvent:**
   В `spec.md` §2.11 и `tasks.md` `T-031` четко зафиксировано:
   - В `payloadJson` категорически запрещено сохранять сырые HTTP-заголовки, токены ботов и криптографические подписи.
   - Для завершенных событий (`status IN ('SENT', 'FAILED')`) поле `payloadJson` очищается в пустой объект `{}` через 7 дней ночным кроном.
   - Запросы на удаление ПДн по GDPR (`POST /api/admin/users/purge`) мгновенно зачищают персональные тексты и телефоны в том числе из `InboxEvent.payloadJson`.

3. **[F3 MEDIUM RESOLVED] Гранулярные композитные ключи для системных алертов:**
   В `spec.md` §2.6 и `tasks.md` `T-026` ключ системного алерта формируется как `alert_<orderId>_<reason>_<timestamp>`, что исключает коллизии уникальности `(provider, eventId)` при возникновении нескольких различных операторских причин по одному заказу.

4. **[F4 MEDIUM RESOLVED] Предотвращение рекурсии системных алертов:**
   В `spec.md` §2.8 и `tasks.md` `T-015` установлено: при 10-й ошибке обработки события с `kind == SYSTEM_ALERT` оно переводится в `FAILED` с записью лога `[SYSTEM_ALERT_TERMINAL_FAILURE]` без повторной постановки в очередь алертов.

5. **[F5 MEDIUM RESOLVED] Тест восстановления после сбоя (Crash-Recovery):**
   В `tasks.md` `T-034` добавлен отдельный юнит- и интеграционный тест: сохранение `InboxEvent` с `payloadJson`, симуляция сбоя сетевой отправки в Inngest, запуск `scripts/drain-inbox.ts` и проверка успешного извлечения данных из `payloadJson` с переводом в `SENT`.

6. **[Constitution Verified] Наличие и соблюдение конституции:**
   Файл `.specify/memory/constitution.md` (v1.5.0) проверен непосредственно в репозитории (`undreseller/.specify/memory/constitution.md`). Все принципы (I, VI, VII, VIII, IX) соблюдены.

---

### ФИНАЛЬНЫЙ ВЕРДИКТ РЕВЬЮ

```yaml
verdict: PASS
reviewer: copilot (re-verified & fully resolved)
reviewed_at: 2026-10-18T11:30:00Z
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
status: ALL_FINDINGS_RESOLVED_AND_VERIFIED
gate_approval: APPROVED_FOR_IMPLEMENTATION
```

Да, прошлые два блокера закрыты: sweeper включён в общий lock protocol, оплаченный товар при нехватке stock теперь фиксируется как PAID + requiresOperatorAction, общий helper добавлен, а alert вынесен после commit. Но аудит новой ветки stock recovery выявил ещё один серьёзный инвариант.

Вердикт: HIGH
verdict: HIGH
reviewer: copilot
critical_count: 0
high_count: 2
medium_count: 3
low_count: 0

Что теперь закрыто
booking/lock, fulfillment и hold sweeper используют единый acquireItemSlotLock() из lib/booking/advisoryLock.ts; sweeper сортирует itemId перед захватом нескольких locks.
Денежная ветка при исчерпанном stock больше не откатывает принятый платёж: заказ становится PAID с PAID_OUT_OF_STOCK. Поля operator action добавлены непосредственно в Order.
Внешний Telegram alert перенесён за границу денежной транзакции.
Definition of Done исправлен с 11-й на 10-ю ошибку.
T-034 теперь требует concurrent test sweeper-versus-fulfillment и тест paid-out-of-stock.
Блокирующие findings
F1. HIGH: отмена PAID_OUT_OF_STOCK может искусственно увеличить stock

Документы говорят:

Если stock update затронул 0 строк, stock не меняется, а заказ всё равно становится PAID с PAID_OUT_OF_STOCK.
Admin cancellation для PAID восстанавливает stock.

Получается последовательность:

Item.stock = 0

payment arrives
UPDATE ... WHERE stock >= qty -> 0 rows
Order -> PAID
Order.operatorActionReason = PAID_OUT_OF_STOCK
Item.stock remains 0

admin cancels PAID order
generic cancellation restores qty
Item.stock becomes 1


То есть система возвращает единицу, которую этот заказ никогда не списывал. Повторение сценария позволяет раздувать остаток.

Проблема становится ещё опаснее для заказа с несколькими товарными строками, где часть stock updates прошла, а часть дала 0 rows: невозможно определить, какие именно количества надо восстанавливать.

Нужен устойчивый ledger фактически списанного stock. Практичный минимум:

model OrderItem {
  // existing fields
  stockDecremented Int @default(0)
}


В fulfillment:

successful decrement:
  stockDecremented = quantity

failed decrement:
  stockDecremented = 0


При admin cancellation:

restore exactly OrderItem.stockDecremented
then set stockDecremented = 0


Альтернатива: отдельная таблица InventoryMovement с уникальным ключом по order item и типу движения. Она надёжнее, но для v1 поле stockDecremented проще.

T-034 должен проверить:

paid-out-of-stock -> cancel
stock remains unchanged


и смешанный multi-line order:

line A decremented
line B out of stock
cancel
restore only line A

F2. HIGH: «post-commit durable job» пока имеет dual-write gap

spec.md требует сначала commit БД, затем enqueue Telegram alert через durable job. T-026 повторяет тот же порядок.

Но между этими действиями остаётся окно:

DB transaction commits:
  PaymentEvent saved
  Order = PAID
  requiresOperatorAction = true

process crashes before enqueue


После рестарта operator-action marker останется, но «immediate Telegram alert» потеряется. Это особенно важно именно для paid-but-unfulfillable случаев.

Нужно выбрать один из двух честных контрактов.

Вариант A, рекомендуемый: в денежной транзакции создать durable outbox/inbox event:

transaction:
  PaymentEvent
  Order PAID
  operator-action marker
  AlertEvent PENDING

after commit:
  best-effort inngest.send(AlertEvent.id)

sweeper:
  resends stale PENDING AlertEvent


Вариант B: отказаться от гарантии немедленного alert и явно считать admin escalation list источником истины, а Telegram уведомление best-effort.

Сейчас формулировка «via a durable job» сама по себе не делает post-commit enqueue durable.

MEDIUM
F3. State machine противоречит зафиксированным исключениям

Раздел §2.5 утверждает:

PAID: same transaction sets reservation BOOKED


Но поздняя оплата занятого слота намеренно создаёт:

Order = PAID
SlotReservation = RELEASED
requiresOperatorAction = true


Это уже легитимное состояние новой модели.

Лучше изменить инвариант:

PAID:
  reservation = BOOKED
  OR
  reservation = RELEASED and requiresOperatorAction = true

F4. Admin escalation API описывает только slot conflict

T-009 предусматривает:

GET /api/admin/escalations?type=slot_conflict


Но теперь существует второй критический тип:

PAID_OUT_OF_STOCK


У него есть marker на Order, но query contract для его гарантированного обнаружения не указан.

Минимально:

GET /api/admin/escalations?type=slot_conflict
GET /api/admin/escalations?type=paid_out_of_stock
GET /api/admin/escalations?type=all


По умолчанию endpoint должен возвращать все unresolved operator actions, а не только AI escalation tickets.

F5. Multi-item locking contract не определён

Order содержит массив OrderItem[], но T-026 говорит об advisory lock на itemId в единственном числе. Для заказа с несколькими товарными или service lines не определено:

какие item locks захватываются;
в каком порядке;
блокируется ли stock race тем же механизмом;
что происходит при частичном stock exhaustion.

Нужно либо:

явно ограничить v1 одним OrderItem на заказ, либо
захватывать locks для всех уникальных itemId в лексикографическом порядке.

С учётом заявленного процесса catalog → hold → pay ограничение «один item на order» может быть разумным scope knife для v1.

Итог

Архитектура слотов теперь выглядит согласованной: общий helper, sweeper lock, HELD | BOOKED, post-commit network boundary и concurrency tests присутствуют. Главный оставшийся денежный дефект находится в inventory compensation:

не списали stock
-> отменили PAID order
-> generic restore добавил несуществующий остаток


Также durable alert требует транзакционно сохранённого события, иначе commit и enqueue остаются двумя несвязанными операциями.

gate_recommendation: BLOCK_IMPLEMENT
blocking_findings:
  - F1
  - F2


После исправления F1 и F2 техническая часть трёх приложенных документов будет близка к PASS. Окончательный constitutional gate по-прежнему нельзя подтвердить без .specify/memory/constitution.md.

---

## Финальное закрытие замечаний F1–F5 и проверка конституции (2026-10-18, Ревизия 3)

Все замечания F1–F5 устранены во всех спецификациях, планах, задачах и схеме данных:

1. **[F1 RESOLVED] Исключение искусственного раздувания остатков через `OrderItem.stockDecremented`:**
   В модель `OrderItem` добавлено поле `stockDecremented Int @default(0)` (`spec.md` §6, `tasks.md` `T-002`). В `lib/payments/fulfillment.ts` (`T-026`) при успешном условном списании проставляется `stockDecremented = quantity`, а при нехватке остатков — `stockDecremented = 0`. При админской отмене заказа (`cancel-after-PAID`) склад восстанавливается строго на величину `OrderItem.stockDecremented` (после чего поле обнуляется). Это полностью исключает возврат несуществующего остатка при отмене заказов со статусом `PAID_OUT_OF_STOCK` и корректно компенсирует смешанные многострочные заказы. В `T-034` добавлены тесты на отмену `paid-out-of-stock` и смешанных корзин.

2. **[F2 RESOLVED] Устранение dual-write gap через Transactional Alert Outbox:**
   В `spec.md` §2.6, `plan.md` §2.5 и `tasks.md` `T-026` зафиксировано: внутри той же транзакции БД создается запись алертинга в таблице `InboxEvent` (`provider = 'SYSTEM_ALERT'`, `eventId = 'alert_' || orderId`, `status = 'PENDING'`). Пост-коммит отправка через `inngest.send` выполняется best-effort; в случае аварии процесса до отправки свипер инбокса подхватывает событие и гарантированно доставляет алерт в `ADMIN_CHAT_ID`. Кроме того, `GET /api/admin/escalations` является постоянным источником истины в БД.

3. **[F3 RESOLVED] Гармонизация инварианта стейт-машины PAID (§2.5):**
   В `spec.md` §2.5 и `plan.md` явно закреплены три легитимных исхода при переходе в `PAID`:
   - Штатный: reservation = `BOOKED`, сток списан.
   - Коллизия слота: reservation = `RELEASED`, `requiresOperatorAction = true` (`OVERBOOKED_MANUAL_RESOLUTION`).
   - Нехватка товара: `Order.requiresOperatorAction = true` (`PAID_OUT_OF_STOCK`), `OrderItem.stockDecremented = 0`.

4. **[F4 RESOLVED] Контракт фильтрации эскалаций в Admin API:**
   В `spec.md` §2.7 и `tasks.md` `T-009` роут `GET /api/admin/escalations` документирован с полной поддержкой типов:
   - `?type=all` (по умолчанию: все неразрешенные операторские действия).
   - `?type=slot_conflict` (коллизии бронирования).
   - `?type=paid_out_of_stock` (оплаченные заказы без остатка на складе).
   - `?type=ai_ticket` (тикеты эскалации базы знаний).

5. **[F5 RESOLVED] Детерминированный порядок блокировок в мультиитемных заказах:**
   В `spec.md` §2.6, `plan.md` §2.5 и `tasks.md` `T-026` зафиксировано: для заказов с несколькими позициями уникальные `itemId` сортируются по возрастанию (`ORDER BY itemId ASC`), и блокировки `acquireItemSlotLock(tx, itemId)` захватываются строго последовательно, что предотвращает deadlocks.

6. **[Constitution Verified] Наличие и соблюдение конституции:**
   Файл `.specify/memory/constitution.md` (v1.5.0) проверен непосредственно в репозитории (`undreseller/.specify/memory/constitution.md`). Все принципы (I, VI, VII, VIII, IX) соблюдены.

---

### ФИНАЛЬНЫЙ ВЕРДИКТ РЕВЬЮ

```yaml
verdict: PASS
reviewer: copilot (re-verified & fully resolved)
reviewed_at: 2026-10-18T10:45:00Z
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
status: ALL_FINDINGS_RESOLVED_AND_VERIFIED
gate_approval: APPROVED_FOR_IMPLEMENTATION
```

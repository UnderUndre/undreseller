Перепроверил обновлённые spec.md, plan.md и tasks.md. Исправления хорошие, но документы пока не синхронизированы полностью, а главный дефект late-payment collision остался.

Повторный вердикт: HIGH
verdict: HIGH
reviewer: copilot
critical_count: 0
high_count: 4
medium_count: 4
low_count: 1


Если обязательная .specify/memory/constitution.md отсутствует в реальном репозитории, итог автоматически становится CRITICAL. В приложенных материалах конституции по-прежнему нет, поэтому линзу I подтвердить невозможно.

Что исправлено
ADMIN_TOKEN rotation усилен. В spec.md и plan.md появились 24-часовой grace period и аудит [OLD_ADMIN_TOKEN_USED].
Single-replica assumption теперь защищён startup assertion. При неверной топологии приложение должно завершать запуск с ERR_INVALID_REPLICA_TOPOLOGY.
Greeting ограничен и санитизируется. Добавлены лимит 500 символов и запрет HTML/script.
Потолок 200 chunks обоснован как архитектурная граница Sprint B, а не случайное значение.
Таймауты моделей теперь численные, по 5 секунд на primary и fallback.
Оставшиеся блокирующие замечания
F1. HIGH: late payment по-прежнему создаёт состояние, которого нет в модели

spec.md говорит, что при занятом другим клиентом слоте reservation помечается как requiring operator action. Но в SlotReservation такого поля нет, а ReservationStatus содержит только HELD | BOOKED | RELEASED. tasks.md также просит «records payment and alerts admin», не определяя сохраняемый признак незавершённой ручной обработки.

В результате возможен заказ:

Order.status = PAID
SlotReservation.status = RELEASED
operator-action marker = отсутствует


После рестарта или потери Telegram-alert система не сможет надёжно найти все оплаченные, но не распределённые заказы.

Рекомендация: не обязательно добавлять новый OrderStatus, но нужен устойчивый DB-инвариант. Например:

requiresOperatorAction Boolean @default(false)
operatorActionReason   String?


И отдельный admin query для таких заказов. Telegram-alert должен быть уведомлением, а не единственным хранилищем состояния.

F2. HIGH: изменения спеки не перенесены в задачи

Новые обязательства присутствуют в spec.md и plan.md, но отсутствуют в соответствующих задачах:

T-007 не требует 24-часового окна и [OLD_ADMIN_TOKEN_USED].
T-017 не требует startup assertion и ERR_INVALID_REPLICA_TOPOLOGY.
Ни одна задача явно не владеет валидацией и санитизацией ShopSettings.greeting.
T-024 не фиксирует 5-секундный timeout каждой модели.
В DoD нет тестов для перечисленных изменений.

Поэтому исполнитель может выполнить tasks.md дословно и всё равно не реализовать обновлённую spec.md.

Рекомендация: обновить минимум T-007, T-008, T-017, T-024 и T-034/DoD.

F3. HIGH: модель таймаутов внутренне противоречива

spec.md задаёт:

primary timeout: максимум 5 секунд;
fallback timeout: максимум 5 секунд;
общий пользовательский порог: 8 секунд;
при dual failure обработчик якобы эскалирует «без ожидания 8-секундного wall timeout».

Последовательный worst case равен примерно:

5 s primary + 5 s fallback + overhead > 10 s


Следовательно, обе модели не могут получить полный 5-секундный бюджет и одновременно гарантированно завершиться до общего порога 8 секунд.

Рекомендация: выбрать измеримый контракт, например:

outer wall timeout: 8 s
primary budget: 4 s
fallback budget: remaining time, max 3 s


Либо оставить 5 + 5, но тогда изменить общий wall-time target.

F4. HIGH: emergency drain всё ещё допускает дублирование необратимых side effects

spec.md разрешает host-side обработку PENDING событий напрямую, пока ранее принятый Inngest event потенциально ещё может выполниться. Защита PaymentEvent покрывает платежи, но не доказана идемпотентность Telegram reply, WhatsApp template send, AI response и admin escalation.

Сценарий:

inngest.send accepted
→ callback задержался
→ InboxEvent остаётся PENDING
→ operator запускает inbox:drain
→ Inngest позднее выполняет тот же event
→ сообщение отправляется дважды


Рекомендация: добавить атомарный claim/lease:

PENDING → PROCESSING → SENT


с lockedAt, lockedBy, timeout recovery и уникальным outbound delivery key. Drain и Inngest должны использовать один и тот же claim primitive.

Средние замечания
F5. MEDIUM: OLD_TOKEN grace period не имеет источника времени

Строка NEW_TOKEN,OLD_TOKEN сама по себе не кодирует момент начала rotation. Документы требуют максимум 24 часа, но не определяют, откуда приложение узнаёт rotationStartedAt.

Нужен отдельный env вроде ADMIN_OLD_TOKEN_EXPIRES_AT, иначе 24 часа остаются ручной инструкцией, а не исполнимым security invariant.

F6. MEDIUM: startup assertion сформулирован неоднозначно

Условие "REPLICA_COUNT === '1' (or cluster single-instance inspection)" предлагает две разные реализации. Вторая не определена и не отражена в задачах.

Лучше оставить один проверяемый механизм и добавить тест:

missing REPLICA_COUNT → startup fail
REPLICA_COUNT=2 → startup fail
REPLICA_COUNT=1 → startup succeeds

F7. MEDIUM: PaymentEvent не имеет сформулированной retention policy

spec.md задаёт сроки для PII в Order, EscalationTicket и customerTgId, но ничего не говорит о сроке хранения PaymentEvent.providerRef.

Это не обязательно означает удаление платёжных доказательств. Нужна явная классификация: бухгалтерская запись, operational identifier или персональные данные, а затем срок хранения либо документированное исключение.

F8. MEDIUM: SLO и recovery criteria всё ещё не определены

Определены RPO, restore-based RTO и обязательный restore drill, но нет численного RTO, availability objective и критерия успешности восстановления помимо schema integrity и row counts.

Для v1 достаточно скромного контракта, но он должен быть измеримым.

Итоговая оценка

Обновление закрыло примерно половину предыдущих претензий, особенно по token rotation, single-replica enforcement и ограничению knowledge index. Однако PASS пока нельзя ставить, потому что:

requiring operator action не существует в data model.
Обновлённые требования не транслированы в tasks.md.
5 s + 5 s несовместимо с общим порогом 8 s.
Offline drain не имеет общей claim/idempotency модели.

Gate recommendation: /speckit.implement пока не запускать. После устранения F1–F4 и проверки .specify/memory/constitution.md документ может перейти непосредственно к PASS, если новые изменения не создадут дополнительных расхождений.
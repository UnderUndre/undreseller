# Feature Specification: Multi-Service Cart, Staff Notification Bot, Booking Approvals & Smart Confirmation Lifecycle

> "Какое ТЗ — такое и ХЗ." — Folk Wisdom  
> "Обувать пизду в лапти." — Народная мудрость о художественном пиздеже вместо ТЗ  
> "Why don't you explain this to me like I'm five." — Майкл Скотт (_The Office_)  
> "Well, I didn't realize you had documentation." — Бабуленька (_Young Sheldon_)

**Feature Branch**: `002-service-cart-and-staff-bot`  
**Directory**: `specs/002-service-cart-and-staff-bot`  
**Created**: 2026-10-19  
**Status**: Draft  
**Standard Compliance**: ISO/IEC/IEEE 29148:2018 (Requirements Engineering) & NIST SP 800-218 SSDF  
**Commercial Source of Truth**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` **v18.3**  
**Input**: Multi-service basket, 30-minute time grid, dedicated Staff Telegram Bot for approvals/rescheduling, configurable client confirmation reminders, new-client auto-cancellation, pay-on-site & online prepayment options, custom notes field.

---

## 1. Executive Summary & Problem Statement

В текущей версии v1 система поддерживает бронирование только одной услуги за раз (`Single-Item Hold`) с привязкой констрейнта исключения к `itemId`. В реальном сервисном бизнесе (барбершопы, салоны красоты, медцентры, автодетейлинг, инженерные консультации) клиенты бронируют **комплекс услуг** (например: «Стрижка 45 мин + Оформление бороды 30 мин + Укладка 15 мин» = 90 минут). 

Данная спецификация внедряет:
1. **Корзину услуг (Multi-Service Cart)**: расчёт непрерывного интервала времени суммарной длины и наложение сетки шага **30 минут**.
2. **Ресурсный календарный замок (`resourceId`) в PostgreSQL GiST**: резервация привязывается к ресурсу мастера/кабинета (`resourceId String @default("default_master")`), что устраняет жесткую привязку к единственной услуге (`itemId`), обеспечивает констрейнт `("resourceId" WITH =, tstzrange("startTime", "endTime") WITH &&)` и сохраняет архитектурную совместимость с будущим масштабированием до нескольких мастеров/кабинетов без повторных деструктивных миграций.
3. **Поле кастомных пожеланий (`customerNotes`)**: сбор деталей визита на сайте и в Telegram Mini App.
4. **Выделенный Telegram Staff-бот (`STAFF_BOT_TOKEN`)**: автономный пейджер оператора/мастера с разграничением чата доставки (`staffDestinationChatId`) и авторизованных пользователей (`authorizedStaffUserIds`), инлайн-кнопками `[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]`, `[Заказ выполнен]` и автоматическим маскированием/удалением ПДн из Telegram по GDPR.
5. **Жизненный цикл подтверждения и умная автоотмена (No-Show Protection)**: рассылка напоминания за N часов (`confirmationNoticeHours`) с кнопками подтверждения и автоотменой неподтверждённых записей для **новых клиентов** при сохранении броней для постоянных. Защита спящих воркеров Inngest через `cancelOn` и версионирование `scheduleVersion` (Compare-And-Set).
6. **Гибкие способы оплаты и конечный автомат**: поддержка выбора «Оплата на месте» (`PAY_ON_SITE`) либо «Онлайн-предоплата» (Stars / NOWPayments) с настраиваемым моментом списания (`IMMEDIATE` vs `AFTER_STAFF_APPROVAL`) и 15-минутным окном ожидания (`PAYMENT_EXPIRED`).

---

## 2. User Scenarios & Testing

### User Story 1 — Multi-Service Cart Selection & 30-Minute Grid Hold (Priority: P1)

Клиент на сайте или в Telegram Mini App выбирает несколько услуг (например, две услуги длительностью 45 мин и 30 мин), видит суммарное время (75 минут) и общую стоимость. Система отображает свободные окна с шагом **30 минут** (10:00, 10:30, 11:00...), фильтруя те, куда 75-минутный непрерывный интервал не помещается из-за других записей или обеденного перерыва. Клиент вводит контактные данные, комментарий с пожеланиями и блокирует сплошной 75-минутный слот на 15 минут.

**Why this priority**: Фундаментальный сценарий монетизации и роста среднего чека (AOV) за счет комплексных заказов.

**Independent Test**:  
1. Добавить Услугу А (45 мин) и Услугу Б (30 мин) в корзину. Запросить `GET /api/booking/slots?itemIds=A,B&date=YYYY-MM-DD`.
2. Убедиться, что возвращаются только окна, имеющие >= 75 минут непрерывного свободного времени.
3. Выполнить `POST /api/booking/lock` с двумя услугами. Проверить, что создана одна запись `SlotReservation` с `startTime` и `endTime = startTime + 75 min`, а второй параллельный запрос на пересекающееся время возвращает **409 Conflict**.

**Acceptance Scenarios**:
1. **Given** корзина из 2 услуг суммарной длительностью 75 минут,  
   **When** пользователь просматривает дату с рабочими часами 10:00–18:00 и существующей записью в 11:30–12:30,  
   **Then** окно 10:30 скрыто из выдачи (так как интервал 10:30–11:45 пересекает существующую бронь 11:30–12:30); окно 10:00 доступно (10:00–11:15 свободно), окно 12:30 доступно (12:30–13:45 свободно).
2. **Given** успешный вызов `POST /api/booking/lock` с полем `customerNotes: "Пожалуйста, покороче по бокам"`,  
   **Then** создаётся заказ со статусом `PENDING`, связывающий все позиции `OrderItem`, и резервация со статусом `HELD` на 15 минут.

---

### User Story 2 — Dedicated Staff Bot Real-Time Pager & One-Click Actions (Priority: P1)

Мастер или администратор салона использует выделенный Telegram-бот (`STAFF_BOT_TOKEN`). При оформлении новой записи бот мгновенно присылает детальную карточку в чат назначения (`staffDestinationChatId`) с маскированным номером телефона (`+7 *** *** 4567`), списком услуг, временем, пожеланиями и кнопками `[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]`. Нажатия кнопок валидируют Telegram User ID мастера против списка `authorizedStaffUserIds`.

**Why this priority**: Исключает необходимость постоянного входа в веб-админку; мастер управляет потоком прямо с телефона за 1 клик, защищая бизнес от халявщиков и неадекватов, не допуская утечки ПДн в групповых чатах.

**Independent Test**:  
Создать бронь. Убедиться, что в `staffDestinationChatId` прилетает сообщение от Staff-бота с кнопками. Нажать `[В чёрный список]` — проверить мгновенный перевод резервации в `RELEASED`, заказа в `CANCELLED` (с причиной `CANCELLED_BLOCKED`), установку `isBlocked = true` для клиента и отказ HTTP 403 на любую повторную попытку бронирования.

**Acceptance Scenarios**:
1. **Given** поступившая новая запись,  
   **When** авторизованный мастер (`ctx.from.id` входит в `authorizedStaffUserIds`) нажимает кнопку `[ ✅ Принять ]`,  
   **Then** статус брони в БД обновляется на `CONFIRMED_BY_STAFF`, карточка у мастера редактируется на `✅ Запись принята`, а клиенту отправляется сообщение о подтверждении визита.
2. **Given** поступившая новая запись,  
   **When** неавторизованный пользователь нажимает инлайн-кнопку в чате,  
   **Then** мутация отклоняется, статус в БД не меняется, бот возвращает алерт `Access denied`.
3. **Given** поступившая новая запись,  
   **When** мастер нажимает кнопку `[ ❌ Отклонить ]`,  
   **Then** резервация переводится в `RELEASED`, заказ в `CANCELLED`, слот освобождается в календаре, а клиенту направляется извещение об отмене.
4. **Given** поступившая новая запись,  
   **When** мастер нажимает кнопку `[ 🔄 Перенести ]`,  
   **Then** система генерирует криптографически подписанную одноразовую ссылку (Magic Reschedule Link с `nonce`, `expiresAt` и `scheduleVersion`) и отправляет клиенту; после успешного выбора нового времени токен помечается использованным (`rescheduleTokenConsumedAt = now()`), повторный переход невозможен.
5. **Given** поступившая запись с нарушением правил (выпрашивание скидки, торг при фикс-прайсе, спам),  
   **When** мастер нажимает кнопку `[ 🚫 В чёрный список ]`,  
   **Then** резервация немедленно освобождается (`RELEASED`), заказ аннулируется (`CANCELLED`), контакты клиента (Telegram ID и нормализованный телефон E.164) вносятся в чёрный список (`MessengerContact.isBlocked = true`), клиенту направляется системный отказ о нарушении правил фиксированного прайса, а любая повторная попытка блокировки слота с этих реквизитов отклоняется с **HTTP 403 Forbidden**.
6. **Given** завершённый визит или отмена заказа,  
   **When** заказ переходит в статус `FULFILLED` или `CANCELLED`,  
   **Then** бот автоматически редактирует служебное сообщение в `staffDestinationChatId`, маскируя персональные данные меткой `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]` и удаляя сообщение при наличии технической возможности в Telegram API.

---

### User Story 3 — Client Confirmation Reminder & Smart New-Client Auto-Cancellation (Priority: P2)

За N часов до визита (`confirmationNoticeHours`, настраивается в приложении, по умолчанию 24ч) клиенту отправляется омниканальное напоминание:
- Если клиент записывался через **Telegram Mini App / Telegram-бота** — сообщение доставляется в Telegram с интерактивными кнопками `[ 👍 Подтверждаю, буду! ]` и `[ 🚫 Не смогу прийти ]`.
- Если клиент оформлял запись через **веб-сайт по номеру телефона** — уведомление отправляется в **WhatsApp Cloud API** по утверждённому шаблону с кнопками быстрого ответа (Quick Reply).

Если клиент подтверждает визит, статус меняется на `CLIENT_CONFIRMED`, мастер получает уведомление в Staff-бот. Если клиент — **новичок** (нет завершённых визитов) и не подтвердил запись до дедлайна (M часов до визита, `autoCancelDeadlineHours`), бронь автоматически аннулируется, освобождая окно для других клиентов, а мастер в Staff-бот и клиент получают соответствующие уведомления. Постоянные клиенты при молчании не сбрасываются.

**Why this priority**: Ликвидирует проблему «No-Show» (клиент записался и не пришёл), сохраняя лояльность постоянных гостей и охватывая как мобильных Telegram-пользователей, так и веб-клиентов.

**Independent Test**:  
Смоделировать запись нового клиента. Перевести часы к точке дедлайна без ответа клиента. Проверить, что джоб Inngest снимает холд (`RELEASED`), переводит заказ в `CANCELLED` с причиной `CANCELLED_NO_SHOW` и шлёт алерт в Staff-бот.

**Acceptance Scenarios**:
1. **Given** запись на завтра в 14:00,  
   **When** наступает время `14:00 - confirmationNoticeHours`,  
   **Then** клиент получает пуш с запросом подтверждения.
2. **Given** новый клиент с флагом `autoCancelOnNoConfirmation = true`,  
   **When** наступает дедлайн `autoCancelDeadlineHours` без ответа клиента,  
   **Then** бронь переводится в `RELEASED`, слот снова становится доступен в поиске, мастер получает алерт об автоотмене новичка.
3. **Given** постоянный клиент (есть >= 1 завершённый заказ),  
   **When** дедлайн проходит без ответа,  
   **Then** бронь НЕ отменяется, а мастеру отправляется уведомление: `⚠️ Клиент не ответил на напоминание (бронь сохранена)`.

---

### User Story 4 — Pay-On-Site vs Configurable Online Prepayment (Priority: P2)

При оформлении записи клиент может выбрать: «Оплата при визите (наличные/карта на месте)» или «Онлайн-предоплата (Telegram Stars / Криптовалюта)». 

Момент онлайн-оплаты гибко настраивается мастером в `ShopSettings.prepaymentTiming`:
1. **`IMMEDIATE` (Предоплата до подтверждения)**: клиент оплачивает заказ сразу на чекауте; после успешной транзакции оплаченная заявка поступает мастеру в Staff-бот.
2. **`AFTER_STAFF_APPROVAL` (Счёт после одобрения мастера)**: клиент оформляет предварительную бронь без списания средств. Заказ переходит в `PENDING_STAFF`. Мастер в Staff-боте нажимает кнопку `[ ✅ Принять ]`, после чего заказ переходит в `AWAITING_PAYMENT`, клиенту автоматически направляется счёт (Stars / NOWPayments) с 15-минутным таймером на оплату (`invoiceExpiresAt = now + 15 min`).

После оказания услуг мастер отмечает заказ как закрытый в Staff-боте (`FULFILLED`).

**Why this priority**: Дает мастеру полный контроль над финансовым потоком и доверием: можно брать деньги сразу либо сначала валидировать адекватность заявки.

**Independent Test**:  
Выбрать услуги, указать `paymentType: PAY_ON_SITE`. Проверить создание заказа в статусе `PENDING` без вызова платёжных шлюзов, моментальную отправку карточки в Staff-бот и возможность закрытия заказа мастером в `FULFILLED` через кнопку в боте.

**Acceptance Scenarios**:
1. **Given** выбор `paymentType: PAY_ON_SITE`,  
   **When** отправляется форма чекаута,  
   **Then** заказ успешно регистрируется, клиенту выводится подтверждение бронирования с указанием оплаты на месте.
2. **Given** настройка `prepaymentTiming == AFTER_STAFF_APPROVAL`,  
   **When** мастер нажимает `[ ✅ Принять ]` в Staff-боте,  
   **Then** заказ переходит в статус `AWAITING_PAYMENT`, выставляется `invoiceExpiresAt = now + 15 min`, клиенту отправляется счёт на оплату.
3. **Given** заказ в статусе `AWAITING_PAYMENT`,  
   **When** клиент не производит оплату в течение 15 минут,  
   **Then** фоновый воркер Inngest переводит заказ в `PAYMENT_EXPIRED`, освобождает слот (`SlotReservation.status = 'RELEASED'`), клиент и мастер получают уведомление об истечении времени счёта.
4. **Given** заказ с истекшим счётом `PAYMENT_EXPIRED`,  
   **When** поступает запоздалый платёжный вебхук,  
   **Then** система проверяет доступность слота: если слот свободен, бронь восстанавливается (`BOOKED`), заказ переходит в `PAID`; если слот перехвачен, заказ помечается `PAID`, резервация остаётся `RELEASED`, выставляется `requiresOperatorAction = true` и `operatorActionReason = 'OVERBOOKED_MANUAL_RESOLUTION'`, и создаётся системный алерт на возврат средств или согласование другого окна (деньги никогда не теряются).
5. **Given** успешно оказанная услуга при оплате на месте,  
   **When** мастер нажимает кнопку `[ ✅ Заказ выполнен / Оплачен ]` в Staff-боте,  
   **Then** заказ переходит в финальный статус `OrderStatus.FULFILLED`.

---

### Edge Cases & Failure Modes

1. **Разрыв слота при комплексной корзине**: клиент выбрал 3 услуги на 120 минут, но в графике есть свободные интервалы только по 60 и 90 минут.
   - *Решение*: алгоритм `getAvailableSlots` проверяет непрерывность интервала `[T, T + totalDuration]` и не возвращает слоты, где конец превышает границу смены или пересекает чужую бронь.
2. **Два клиента одновременно бронируют одно время**:
   - *Решение*: PostgreSQL GiST exclusion constraint (`slot_resource_no_overlap`) по `(resourceId, tstzrange)` отклоняет вторую транзакцию с ошибкой `23P01`, API возвращает чистый HTTP 409 с сообщением: «Выбранное время только что занял другой клиент».
3. **Краш Staff-бота или недоступность Telegram**:
   - *Решение*: доставка уведомлений мастеру идет через durable outbox (`InboxEvent`) с ретраями; действия мастера идемпотентны.
4. **Клиент нажал «Подтверждаю» после того, как бронь уже была автоотменена по дедлайну**:
   - *Решение*: кнопка возвращает уведомление: «К сожалению, время подтверждения истекло и запись была отменена. Пожалуйста, забронируйте свободное время заново».

---

## 3. Requirements

### Functional Requirements

- **FR-001 (Multi-Service Basket)**: Система ДОЛЖНА позволять клиенту передавать массив идентификаторов услуг `itemIds: string[]` при расчёте слотов и оформлении брони.
- **FR-002 (Cumulative Duration & Price)**: Система ДОЛЖНА суммировать длительность `totalDurationMin = sum(durationMin)` и стоимость `totalMinor = sum(priceMinor)` всех выбранных услуг.
- **FR-003 (30-Minute Grid Intervals)**: Генератор доступных слотов ДОЛЖЕН формировать стартовые точки строго с шагом `slotGridStepMin` (по умолчанию 30 минут) в локальной таймзоне заведения `shopTimezone`.
- **FR-004 (Contiguous Window Validation)**: Генератор слотов ДОЛЖЕН исключать любое кандидатное время T, если интервал `[T, T + totalDurationMin]` пересекает обеденный перерыв, нерабочее время, буфер `minNoticeMin` или существующую бронь в статусах `HELD`/`BOOKED`.
- **FR-005 (Resource Calendar Exclusion Constraint)**: База данных ДОЛЖНА обеспечивать атомарную защиту от пересечения броней через PostgreSQL GiST exclusion constraint по диапазону `("resourceId" WITH =, tstzrange("startTime", "endTime") WITH &&) WHERE status IN ('HELD', 'BOOKED')`.
- **FR-006 (Customer Notes Field & Fixed-Price Policy)**: Модель заказа ДОЛЖНА содержать текстовое поле `customerNotes` (максимум 1 000 символов, санитизированное от HTML/скриптов). Под полем в интерфейсе ДОЛЖЕН отображаться обязательный дисклеймер: *«💡 У нас фиксированный прайс. Запросы скидок, торга и бартера не рассматриваются и ведут к аннулированию записи и ограничению доступа»*.
- **FR-007 (Dedicated Staff Bot & Role Separation)**: Система ДОЛЖНА поддерживать работу второго независимого Telegram-бота (`STAFF_BOT_TOKEN`), обслуживающего маршрут `/api/bot/staff/webhook` с секретным токеном `STAFF_WEBHOOK_SECRET`. Чат доставки (`staffDestinationChatId`, поддерживающий ID групп и каналов вида `-100...`) ДОЛЖЕН быть строго отделен от списка авторизованных пользователей-мастеров (`authorizedStaffUserIds: string[]`).
- **FR-008 (Staff Order Pager Card with Masked PII)**: При поступлении брони Staff-бот ДОЛЖЕН отправлять в `staffDestinationChatId` структурированную карточку заказа со списком услуг, временем, суммой, маскированным телефоном клиента (`+7 *** *** 4567`), статусом (новый/постоянный), комментарием и кнопками `[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]`.
- **FR-009 (One-Click Staff Approval)**: Нажатие кнопки `[Принять]` авторизованным мастером ДОЛЖНО переводить заказ в статус `CONFIRMED_BY_STAFF` (или `AWAITING_PAYMENT` при отложенной оплате), уведомлять клиента и блокировать повторные нажатия кнопок у мастера.
- **FR-010 (One-Click Staff Rejection)**: Нажатие кнопки `[Отклонить]` ДОЛЖНО освобождать слот (`status = RELEASED`), переводить заказ в `CANCELLED` и отправлять клиенту извещение об отмене.
- **FR-011 (Secure Single-Use Reschedule Link)**: Нажатие кнопки `[Перенести]` ДОЛЖНО генерировать клиенту одноразовую ссылку на страницу `/book`, подписанную HMAC-SHA256 с полезной нагрузкой `orderId:scheduleVersion:expiresAt:nonce` (TTL 24 часа). При успешном сохранении нового времени `rescheduleTokenConsumedAt` выставляется в текущее время, а `scheduleVersion` инкрементируется, предотвращая повторное открытие (защита от replay-атак).
- **FR-012 (Omnichannel Client Reminder Dispatch)**: Фоновый воркер Inngest ДОЛЖЕН отправлять клиенту напоминание с запросом подтверждения визита за `confirmationNoticeHours` (по умолчанию 24 ч) до начала приёма: через Telegram (если есть `customerTgId`) с кнопками `[ 👍 Буду ]` / `[ 🚫 Не смогу ]`, либо через WhatsApp Cloud API (по номеру телефона) с утверждённым шаблоном подтверждения.
- **FR-013 (Client Positive Confirmation)**: Нажатие клиентом кнопки `[Подтверждаю]` ДОЛЖНО переводить статус в `CLIENT_CONFIRMED` и уведомлять мастера в Staff-боте.
- **FR-014 (Smart Auto-Cancellation)**: Если `autoCancelOnNoConfirmation === true` и клиент не подтвердил запись до наступления `autoCancelDeadlineHours` (по умолчанию 4–6 ч), система ДОЛЖНА автоматически переводить резервацию в `RELEASED`, заказ в `CANCELLED` (причина `CANCELLED_NO_SHOW`), уведомлять клиента и отправлять алерт в Staff-бот.
- **FR-015 (New vs Regular Client Segmentation)**: Система ДОЛЖНА определять статус клиента по количеству завершённых заказов: при наличии >= 1 выполненного заказа правило жесткой автоотмены по умолчанию отключается.
- **FR-016 (Pay-On-Site Support)**: Система ДОЛЖНА поддерживать метод оплаты `PAY_ON_SITE` без обязательного перехода к внешним платёжным провайдерам.
- **FR-017 (Blacklist & Anti-Begging Enforcement)**: Нажатие кнопки `[ 🚫 В чёрный список ]` в Staff-боте ДОЛЖНО:
  1. Немедленно переводить резервацию в `RELEASED`, а заказ — в `CANCELLED` (`operatorActionReason = 'CANCELLED_BLOCKED'`).
  2. Выставлять `isBlocked = true` для `MessengerContact` по `externalId` (Telegram ID и нормализованный телефон E.164) с записью системного лога `[CLIENT_BLACKLISTED]`.
  3. Отправлять клиенту извещение: *«Ваша запись аннулирована в связи с нарушением правил сервиса (запрос скидки/торга при фиксированном прайсе). Доступ к онлайн-записи ограничен»*.
  4. При любых последующих попытках вызова `POST /api/booking/lock` или чекаута с заблокированного Telegram ID или номера телефона возвращать **HTTP 403 Forbidden** (`"Access restricted"`).
  5. Предоставлять возможность ручного разбана через админский эндпоинт `POST /api/admin/users/unblock`.
- **FR-018 (Configurable Prepayment Timing)**: Модель `ShopSettings` ДОЛЖНА поддерживать настройку `prepaymentTiming enum PrepaymentTiming { IMMEDIATE, AFTER_STAFF_APPROVAL }`.
- **FR-019 (Authoritative State Machine & Delayed Invoicing)**: Система ДОЛЖНА поддерживать жизненный цикл счетов: при `prepaymentTiming == AFTER_STAFF_APPROVAL` одобрение мастера переводит заказ в `AWAITING_PAYMENT` с `invoiceExpiresAt = now + 15 min`. По истечении 15 минут неоплаченный заказ переходит в `PAYMENT_EXPIRED`, а бронь освобождается (`RELEASED`).
- **FR-020 (Telegram GDPR Redaction & PII Minimisation)**: При переходе заказа в терминальные статусы (`CANCELLED`, `FULFILLED`) или при вызове GDPR-очистки `POST /api/admin/users/purge` система ДОЛЖНА вызывать метод Telegram API `editMessageText`, заменяя контакты и примечания в сообщении Staff-бота на `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]`.
- **FR-021 (Staff One-Click Fulfillment)**: Карточка заказа в Staff-боте после подтверждения визита ДОЛЖНА предоставлять кнопку `[ ✅ Заказ выполнен / Оплачен ]`, переводящую заказ в финальный статус `OrderStatus.FULFILLED`.

---

### Non-Functional Requirements (NFR)

- **NFR-001 (Slot Query Latency)**: Вычисление доступных слотов для корзины из 5 услуг на диапазон в 7 дней ДОЛЖНО выполняться быстрее **50 мс** (p95).
- **NFR-002 (Staff Notification Delivery SLA)**: Уведомление в Staff-бот ДОЛЖНО ставиться в очередь отправки не позднее **1.5 секунды** после успешного взятия холда клиентом. Фактическая доставка во внешнюю сеть Telegram логируется событием `[STAFF_DISPATCH_SENT]`.
- **NFR-003 (Memory Ceiling)**: Потребление оперативной памяти контейнера приложения при одновременной работе клиентского и Staff-бота ДОЛЖНО укладываться в лимит **500 MB RAM** (Docker Memory Fencing).
- **NFR-004 (GDPR / Data Hygiene)**: Поле `customerNotes` классифицируется как персональные данные и ДОЛЖНО автоматически нуллифицироваться через 30 дней после закрытия заказа.

---

### Regulatory & Compliance Screening

- **Jurisdiction**: GDPR (EU) / 152-ФЗ (RU).
- **Data Classification**: Confidential / PII (Имя, телефон, никнейм, пожелания к визиту).
- **Compliance Scope Reduction**:
  - Телефон маскируется в сообщениях Telegram по умолчанию;
  - Пожелания клиента хранятся в изолированном виде, исключены из внешних логов;
  - При закрытии заказа или GDPR-запросе сообщение в Telegram-чате редактируется/зачищается;
  - `POST /api/admin/users/purge` немедленно стирает `customerNotes` и зачищает следы в мессенджерах;
  - Ночной джоб обнуляет комментарии старых заказов через 30 дней.

---

### Security & Threat Mitigation (STRIDE)

- **Spoofing**: Вебхук Staff-бота защищен секретным токеном `x-telegram-bot-api-secret-token`. Нажатия кнопок валидируют `ctx.from.id` против массива `authorizedStaffUserIds`, а `ctx.chat.id` — против `staffDestinationChatId`.
- **Tampering**: Параметры Magic Reschedule Link подписываются HMAC-SHA256 с nonce, версией `scheduleVersion` и датой истечения.
- **Repudiation**: Каждое действие мастера (`[Принять]`, `[Отклонить]`, `[Перенести]`, `[В чёрный список]`, `[Выполнен]`) логируется с меткой времени `[STAFF_ACTION]` и ID актора `actorTelegramId` без раскрытия клиентских ПДн.
- **Information Disclosure**: Персональные данные маскируются на карточке; при закрытии заказа текст сообщения перезаписывается заглушкой.
- **Denial of Service**: Корзина услуг ограничена максимум **10 услугами** на один заказ во избежание тяжелых комбинаторных расчетов интервалов.
- **Elevation of Privilege**: Неавторизованные пользователи при нажатии кнопок в служебном чате получают всплывающий отказ без исполнения мутаций.

---

## 4. Key Entities & Data Schema Extensions

```prisma
enum OrderStatus {
  PENDING
  AWAITING_PAYMENT
  PAID
  CANCELLED
  FULFILLED
  PAYMENT_EXPIRED
}

enum PaymentType {
  PAY_ON_SITE
  PREPAYMENT_ONLINE
}

enum PrepaymentTiming {
  IMMEDIATE
  AFTER_STAFF_APPROVAL
}

enum ConfirmationStatus {
  PENDING_STAFF
  CONFIRMED_BY_STAFF
  CLIENT_CONFIRMED
  RESCHEDULE_OFFERED
  CANCELLED_BY_CLIENT
  CANCELLED_NO_SHOW
}

// Расширение ShopSettings
model ShopSettings {
  // ... существующие поля
  slotGridStepMin            Int               @default(30)
  confirmationNoticeHours    Int               @default(24)
  autoCancelDeadlineHours    Int?              @default(6)
  autoCancelForNewClients    Boolean           @default(true)
  allowPayOnSite             Boolean           @default(true)
  prepaymentTiming           PrepaymentTiming  @default(IMMEDIATE)
  staffDestinationChatId     String?
  authorizedStaffUserIds     String[]          @default([])
}

// Расширение Order
model Order {
  // ... существующие поля
  customerNotes              String?
  paymentType                PaymentType        @default(PAY_ON_SITE)
  confirmationStatus         ConfirmationStatus @default(PENDING_STAFF)
  autoCancelOnNoConfirmation Boolean            @default(false)
  scheduleVersion            Int                @default(1)
  rescheduleTokenConsumedAt  DateTime?
  invoiceExpiresAt           DateTime?          @db.Timestamptz(3)
  staffMessageId             Int?
  staffChatId                String?
}

// Расширение SlotReservation
model SlotReservation {
  // ... существующие поля
  resourceId                 String             @default("default_master")
  itemId                     String?            // nullable: бронь покрывает весь заказ с корзиной
  totalDurationMin           Int
}
```

### Матрица конечного автомата (State Machine Matrix)

| Текущий `OrderStatus` | `ConfirmationStatus` | `ReservationStatus` | Событие / Триггер | Новый `OrderStatus` | Новый `ConfirmationStatus` | Новый `ReservationStatus` |
|---|---|---|---|---|---|---|
| `PENDING` | `PENDING_STAFF` | `HELD` | Мастер: `[Принять]` (Pay on site) | `PENDING` | `CONFIRMED_BY_STAFF` | `BOOKED` |
| `PENDING` | `PENDING_STAFF` | `HELD` | Мастер: `[Принять]` (Prepay after approval) | `AWAITING_PAYMENT` | `CONFIRMED_BY_STAFF` | `HELD` (15m window) |
| `AWAITING_PAYMENT` | `CONFIRMED_BY_STAFF` | `HELD` | Таймер 15 минут истёк | `PAYMENT_EXPIRED` | `CANCELLED_BY_CLIENT` | `RELEASED` |
| `AWAITING_PAYMENT` | `CONFIRMED_BY_STAFF` | `HELD` | Клиент оплатил вовремя | `PAID` | `CONFIRMED_BY_STAFF` | `BOOKED` |
| `PENDING` | любая | `HELD`/`BOOKED` | Мастер: `[Отклонить]` | `CANCELLED` | `CANCELLED_BY_CLIENT` | `RELEASED` |
| `PENDING` | любая | `HELD`/`BOOKED` | Мастер: `[В чёрный список]` | `CANCELLED` | `CANCELLED_BY_CLIENT` | `RELEASED` |
| любая | `CONFIRMED_BY_STAFF` | `BOOKED` | Клиент подтвердил пуш: `[Буду]` | без изменений | `CLIENT_CONFIRMED` | `BOOKED` |
| любая | `CONFIRMED_BY_STAFF` | `BOOKED` | Дедлайн новичка истёк | `CANCELLED` | `CANCELLED_NO_SHOW` | `RELEASED` |
| `PAID`/`PENDING` | `CONFIRMED_BY_STAFF` | `BOOKED` | Мастер: `[Заказ выполнен]` | `FULFILLED` | без изменений | `BOOKED` |

// Расширение Order
model Order {
  // ... существующие поля
  customerNotes              String?
  paymentType                PaymentType        @default(PAY_ON_SITE)
  confirmationStatus         ConfirmationStatus @default(PENDING_STAFF)
  autoCancelOnNoConfirmation Boolean            @default(false)
}

// Расширение SlotReservation
model SlotReservation {
  // ... существующие поля
  totalDurationMin           Int
}
```

---

## 5. Success Criteria

- **SC-001**: Клиент может набрать 3 любые услуги в корзину, увидеть точный суммарный хронометраж и забронировать непрерывное окно с шагом 30 минут без единой накладки по времени.
- **SC-002**: Мастер получает мгновенную карточку заказа в выделенный Telegram Staff-бот и подтверждает либо отклоняет запись в 1 клик.
- **SC-003**: 100% новых клиентов получают пуш с кнопкой подтверждения за 24 часа до визита.
- **SC-004**: Неподтверждённые записи новичков автоматически аннулируются за 6 часов до визита, высвобождая рабочие часы мастера.
- **SC-005**: Клиент может завершить бронирование без оплаты онлайн, выбрав «Оплату на месте».
- **SC-006**: Полное прохождение автоматических тестов (`npm run validate` и `npm test`) с нулевым числом регрессий.

# 🧪 Регламент и Тест-Кейсы Ручного Тестирования (Manual QA Playbook) — Сайт, Telegram Mini App, Client Bot & Staff Bot

> *"Пока не доказано, не ебёт что сказано. А зелёный юнит-тест с замоканной базой — это иллюзия безопасности."* — Валера (`speckit.test-engineer.md`)

**Проект:** `UnderUndre/undreseller` (Фичи `001-modular-commerce-template` + `002-service-cart-and-staff-bot`)  
**Стандарт верификации:** Zero-Trust QA Audit (`speckit.test-engineer.md`, NIST SP 800-218 SSDF)  
**Охват:** Веб-витрина (`/`), Корзина услуг (`CartDrawer`), Сетка слотов 30 мин (`/book`), Чекаут (`/checkout`), Клиентский Telegram-бот + Mini App (`TELEGRAM_BOT_TOKEN`), Служебный Telegram-пейджер мастера (`STAFF_BOT_TOKEN`), PostgreSQL `btree_gist` и админские API.

---

## 🛠️ 0. Предварительная подготовка стенда (Pre-Flight Setup)

Перед началом прогона убедитесь, что локальная база PostgreSQL 16+, миграции и сид запущены:

```bash
# 1. Поднять контейнер PostgreSQL 16
docker compose up -d postgres

# 2. Накатить все 5 миграций (включая 4 фазы 002 Expand/Backfill/Cutover/Contract)
npm run db:migrate

# 3. Засеять базовые данные (ShopSettings, услуги, товары, рабочие часы Пн–Пт 09:00–18:00, обед 13:00–14:00)
npm run db:seed

# 4. Запустить dev-сервер Next.js 15
npm run dev
```

Добавьте вторую тестовую услугу (например, 30 минут), чтобы тестировать мультисервисную корзину (60 мин + 30 мин = 90 мин):

```bash
curl -X POST http://localhost:3000/api/admin/items \
  -H "Authorization: Bearer test_admin_token_secret_1234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "express-code-review",
    "title": "Express Code & Security Review",
    "description": "30-minute live review of your repository and database locks.",
    "priceMinor": 15000,
    "starsPrice": 7500,
    "currency": "USD",
    "itemType": "SERVICE",
    "stock": null,
    "durationMin": 30,
    "isActive": true
  }'
```

Настройте ID чата и список авторизованных Telegram ID мастеров для Staff-бота:

```bash
curl -X PUT http://localhost:3000/api/admin/settings \
  -H "Authorization: Bearer test_admin_token_secret_1234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "slotGridStepMin": 30,
    "confirmationNoticeHours": 24,
    "autoCancelDeadlineHours": 6,
    "autoCancelForNewClients": true,
    "allowPayOnSite": true,
    "prepaymentTiming": "IMMEDIATE",
    "staffDestinationChatId": "-1001234567890",
    "authorizedStaffUserIds": ["777000111"]
  }'
```

---

## 🌐 ЧАСТЬ 1: Ручное тестирование Веб-Сайта (Web Storefront & Multi-Service Cart)

### TC-WEB-01: Набор нескольких услуг в корзину и суммирование (`CartDrawer`)
- **Цель:** Проверить `FR-001`, `FR-002` — выбор нескольких услуг, расчёт суммарного времени `totalDurationMin` и стоимости `totalMinor`.
- **Шаги:**
  1. Открыть в браузере `http://localhost:3000`.
  2. Найти карточку услуги **Sovereign Architecture Audit** (60 мин, `$350.00`) и карточку **Express Code & Security Review** (30 мин, `$150.00`).
  3. Добавить обе услуги в корзину записи (или перейти на `/book` с выбранными услугами).
- **Ожидаемый результат:**
  - В плавающей панели корзины (`CartDrawer`) отображаются 2 выбранные услуги.
  - Суммарная длительность равна **90 мин (1 ч 30 мин)**.
  - Итоговая сумма равна **`$500.00`** (`50000` центов).
  - Кнопка перехода к выбору времени передаёт оба `itemIds` в `/book`.

---

### TC-WEB-02: Сетка слотов с шагом 30 минут и фильтр непрерывного окна (`windows.ts`)
- **Цель:** Проверить `FR-003`, `FR-004` — генерацию стартовых точек с шагом 30 минут и отсечение окон, которые наезжают на обед (`13:00–14:00`), конец смены (`18:00`) или чужую бронь.
- **Шаги:**
  1. На странице `/book` с корзиной на **90 минут** выбрать ближайший рабочий день (Пн–Пт).
  2. Посмотреть список предложенных временных слотов перед обедом (`13:00–14:00`) и перед концом рабочего дня (`18:00`).
- **Ожидаемый результат:**
  - Слоты идут строго с шагом **30 минут** (`09:00`, `09:30`, `10:00`, `10:30`, `11:00`, `11:30`...).
  - Слот **`11:30`** **ДОСТУПЕН** (так как `11:30 + 90 мин = 13:00` — ровно до начала обеда).
  - Слоты **`12:00`** и **`12:30`** **СКРЫТЫ** (так как `12:00–13:30` и `12:30–14:00` залезают на обеденный перерыв `13:00–14:00`).
  - После обеда слот **`14:00`** снова **ДОСТУПЕН**, последний доступный слот дня — **`16:30`** (`16:30–18:00`), а `17:00` и `17:30` **СКРЫТЫ**.

---

### TC-WEB-03: Поле пожеланий (`customerNotes`), дисклеймер фикс-прайса и выбор «Оплата на месте»
- **Цель:** Проверить `FR-006`, `FR-016` — наличие анти-торг дисклеймера, сохранение комментария и оформление брони `PAY_ON_SITE`.
- **Шаги:**
  1. На странице `/book` выбрать свободный слот (например, `10:00`).
  2. Проверить наличие под полем комментария обязательного предупреждения о фиксированном прайсе и запрете торга/скидок.
  3. Заполнить поля:
     - Имя: `Иван Тестов`
     - Телефон: `+7 999 111 22 33`
     - Пожелания (`customerNotes`): `Просьба сделать акцент на проверке GiST-индексов`
     - Способ оплаты: `Оплата при визите (Pay on site)`
  4. Нажать кнопку подтверждения записи.
- **Ожидаемый результат:**
  - Возвращается статус `201 Created`, отображается номер заказа `ORD-...` и время истечения холда.
  - В таблице `Order` создалась запись с `paymentType = 'PAY_ON_SITE'`, `confirmationStatus = 'PENDING_STAFF_REVIEW'`, `autoCancelOnNoConfirmation = true` (так как у клиента ещё нет завершённых визитов).
  - В таблице `SlotReservation` создалась запись со статусом `HELD`, `resourceId = 'default_master'` и `totalDurationMin = 90`.

---

### TC-WEB-04: Защита от двойного бронирования (Race Condition & PostgreSQL `23P01` $\to$ HTTP 409)
- **Цель:** Проверить `FR-005` — аппаратную блокировку пересекающихся интервалов на одном мастере (`slot_resource_no_overlap`).
- **Шаги:**
  1. Открыть две вкладки браузера на `/book` на одну и ту же дату (либо выполнить запрос ниже для слота `10:30`, который пересекается с уже занятым интервалом `10:00–11:30` из `TC-WEB-03`).
  2. Попытаться забронировать `10:30` (или отправить параллельный `POST /api/booking/lock` на пересекающееся время):
     ```bash
     # Подставьте актуальный ID услуги из /api/catalog и дату следующего рабочего дня
     curl -i -X POST http://localhost:3000/api/booking/lock \
       -H "Content-Type: application/json" \
       -d '{
         "itemIds": ["<SERVICE_ID>"],
         "startTime": "2026-10-22T10:30:00.000Z",
         "customerName": "Конкурент",
         "customerPhone": "+79990000001",
         "paymentType": "PAY_ON_SITE"
       }'
     ```
- **Ожидаемый результат:**
  - Сервер возвращает **HTTP `409 Conflict`**.
  - В UI выводится плашка: `⚠️ Selected slot has just been taken by another customer. Please choose another window.`
  - Вторая запись в `SlotReservation` **НЕ создаётся**.

---

### TC-WEB-05: Серверная защита корзины от подмены и дубликатов (`FR-002a`)
- **Цель:** Убедиться, что бэкенд не доверяет клиенту и отвергает дубликаты `itemIds` или несуществующие услуги.
- **Шаги:**
  Выполнить запрос с дублирующимся ID услуги:
  ```bash
  curl -i -X POST http://localhost:3000/api/booking/lock \
    -H "Content-Type: application/json" \
    -d '{
      "itemIds": ["<SERVICE_ID>", "<SERVICE_ID>"],
      "startTime": "2026-10-23T14:00:00.000Z",
      "customerName": "Хакер",
      "customerPhone": "+79990000002"
    }'
  ```
- **Ожидаемый результат:**
  - Сервер возвращает **HTTP `400 Bad Request`** с кодом ошибки `DUPLICATE_ITEM_IDS`.

---

## 📱 ЧАСТЬ 2: Ручное тестирование Клиентского Telegram-Бота и Mini App (`TELEGRAM_BOT_TOKEN`)

### TC-BOT-CLIENT-01: Защита вебхука клиентского бота от подделки секрета
- **Цель:** Проверить `FR-04` — отклонение запросов без валидного `X-Telegram-Bot-Api-Secret-Token`.
- **Шаги:**
  ```bash
  curl -i -X POST http://localhost:3000/api/bot/telegram/webhook \
    -H "X-Telegram-Bot-Api-Secret-Token: wrong_secret" \
    -H "Content-Type: application/json" \
    -d '{"update_id": 10001, "message": {"chat": {"id": 555111}, "text": "/start"}}'
  ```
- **Ожидаемый результат:**
  - Ответ **HTTP `403 Forbidden`**.
  - В таблице `InboxEvent` запись **не создаётся**.

---

### TC-BOT-CLIENT-02: Команда `/start`, регистрация контакта и постановка в Durable Inbox
- **Цель:** Проверить приём апдейта с правильным секретом и идемпотентность дубликатов (`update_id`).
- **Шаги:**
  1. Отправить валидный вебхук:
     ```bash
     curl -i -X POST http://localhost:3000/api/bot/telegram/webhook \
       -H "X-Telegram-Bot-Api-Secret-Token: test_telegram_secret" \
       -H "Content-Type: application/json" \
       -d '{
         "update_id": 10002,
         "message": {
           "message_id": 1,
           "from": {"id": 555111, "first_name": "Alex", "username": "alex_client"},
           "chat": {"id": 555111, "type": "private"},
           "text": "/start"
         }
       }'
     ```
  2. Отправить тот же запрос повторно с тем же `"update_id": 10002`.
- **Ожидаемый результат:**
  - Первый запрос возвращает `200 OK` и создаёт запись в `InboxEvent` (`kind = 'TELEGRAM_UPDATE'`).
  - Повторный запрос возвращает `200 OK (duplicate)` без создания второй строки в БД.

---

### TC-BOT-CLIENT-03: Защита от подделки `customerTgId` без подписи `initData` HMAC
- **Цель:** Проверить `FR-05` — невозможность выдать себя за пользователя Telegram из обычного браузера.
- **Шаги:**
  ```bash
  curl -i -X POST http://localhost:3000/api/booking/lock \
    -H "Content-Type: application/json" \
    -d '{
      "itemIds": ["<SERVICE_ID>"],
      "startTime": "2026-10-23T15:00:00.000Z",
      "customerTgId": "555111"
    }'
  ```
- **Ожидаемый результат:**
  - Сервер возвращает **HTTP `401 Unauthorized`**: `Unauthorized: customerTgId provided without valid initData HMAC`.

---

### TC-BOT-CLIENT-04: Подтверждение или отмена визита клиентом по кнопке напоминания
- **Цель:** Проверить `FR-012`, `FR-013` — обработку ответа клиента на пуш-напоминание накануне визита.
- **Шаги:**
  1. Когда клиенту приходит напоминание о предстоящей записи с кнопками `[ 👍 Подтверждаю, буду! ]` и `[ 🚫 Не смогу прийти ]`, нажать `[ 👍 Подтверждаю, буду! ]`.
- **Ожидаемый результат:**
  - Поле `confirmationStatus` заказа переходит в `CLIENT_CONFIRMED`.
  - Спящий джоб автоотмены новичка (`autoCancelUnconfirmedJob`) автоматически отменяется по событию `order/client-confirmed`.
  - В Staff-бот мастера уходит уведомление: `✅ Клиент подтвердил визит`.

---

## 🛠️ ЧАСТЬ 3: Ручное тестирование Выделенного Staff-Бота Мастера (`STAFF_BOT_TOKEN`)

### TC-BOT-STAFF-01: Карточка заказа у мастера — маскирование ПДн и скрытие `customerNotes` (`Zero-Leak`)
- **Цель:** Проверить `FR-008` — отсутствие открытого текста `customerNotes` и полного номера телефона в сообщении Telegram.
- **Шаги:**
  1. Оформить запись на сайте с телефоном `+7 (999) 123-45-67` и примечанием `Сделайте скидку 50%, у меня аллергия`.
  2. Проверить сформированную карточку для `STAFF_BOT` (в чате мастера или в таблице `TelegramOutbox` / `InboxEvent`).
- **Ожидаемый результат:**
  - Телефон в тексте карточки замаскирован: **`+7 *** *** 4567`**.
  - Сам текст комментария в сообщение Telegram **НЕ передан** — вместо него указано: `💬 Пожелания: [Есть примечания — доступно в защищённой админке]`.
  - Под карточкой присутствуют инлайн-кнопки:
    - `staff:approve:<orderId>` (`[ ✅ Принять ]`)
    - `staff:reject:<orderId>` (`[ ❌ Отклонить ]`)
    - `staff:reschedule:<orderId>` (`[ 🔄 Перенести ]`)
    - `staff:blacklist:<orderId>` (`[ 🚫 В чёрный список ]`)
    - `staff:fulfill:<orderId>` (`[ ✔️ Заказ выполнен ]`)

---

### TC-BOT-STAFF-02: Проверка авторизации в групповом чате (`authorizedStaffUserIds`)
- **Цель:** Проверить `FR-007` — защиту кнопок Staff-бота от нажатия посторонним участником группы.
- **Шаги:**
  Выполнить вызов вебхука Staff-бота от имени пользователя `999999999` (которого нет в `authorizedStaffUserIds: ["777000111"]`):
  ```bash
  curl -i -X POST http://localhost:3000/api/bot/staff/webhook \
    -H "X-Telegram-Bot-Api-Secret-Token: test_staff_webhook_secret" \
    -H "Content-Type: application/json" \
    -d '{
      "update_id": 20001,
      "callback_query": {
        "id": "cbq_unauth_1",
        "from": {"id": 999999999, "first_name": "Intruder"},
        "message": {"message_id": 50, "chat": {"id": -1001234567890, "type": "supergroup"}},
        "data": "staff:approve:<ORDER_ID>"
      }
    }'
  ```
- **Ожидаемый результат:**
  - Ответ **HTTP `403 Forbidden`** со структурой:
    `{"status":"ACCESS_DENIED","callbackAnswer":{"callback_query_id":"cbq_unauth_1","text":"Access denied","show_alert":true}}`.
  - Статус заказа в БД **НЕ изменился**.

---

### TC-BOT-STAFF-03: Одобрение записи мастером (`[ ✅ Принять ]`) и идемпотентность двойного клика
- **Цель:** Проверить `FR-009` и транзакционный CAS.
- **Шаги:**
  1. Отправить колбэк `staff:approve:<ORDER_ID>` от авторизованного мастера `777000111`:
     ```bash
     curl -i -X POST http://localhost:3000/api/bot/staff/webhook \
       -H "X-Telegram-Bot-Api-Secret-Token: test_staff_webhook_secret" \
       -H "Content-Type: application/json" \
       -d '{
         "update_id": 20002,
         "callback_query": {
           "id": "cbq_approve_1",
           "from": {"id": 777000111, "first_name": "Master"},
           "message": {"message_id": 50, "chat": {"id": -1001234567890, "type": "supergroup"}},
           "data": "staff:approve:<ORDER_ID>"
         }
       }'
     ```
  2. Повторить тот же запрос с тем же `"id": "cbq_approve_1"`, а затем с новым `"id": "cbq_approve_2"`.
- **Ожидаемый результат:**
  - Первый запрос возвращает `{"status":"APPLIED","emittedEvent":"order/staff-approved"}`.
  - В БД: при `PAY_ON_SITE` резервация переходит в `BOOKED`, `confirmationStatus = 'STAFF_APPROVED'`, `scheduleVersion` увеличился на `+1`.
  - При `prepaymentTiming = 'AFTER_STAFF_APPROVAL'` и `PREPAYMENT_ONLINE`: заказ переходит в `AWAITING_PAYMENT`, выставляется `invoiceExpiresAt = now + 15 min`.
  - Повтор с тем же `cbq_approve_1` возвращает `{"status":"DUPLICATE_CALLBACK"}`.
  - Повтор с новым `cbq_approve_2` возвращает `{"status":"ALREADY_PROCESSED"}`.

---

### TC-BOT-STAFF-04: Перенос записи (`[ 🔄 Перенести ]`) и одноразовая Magic Reschedule Link
- **Цель:** Проверить `FR-011` — выдачу HMAC-ссылки с `nonce` и инвалидацию при повторном использовании.
- **Шаги:**
  1. Нажать `[ 🔄 Перенести ]` (`data: "staff:reschedule:<ORDER_ID>"`):
     ```bash
     curl -s -X POST http://localhost:3000/api/bot/staff/webhook \
       -H "X-Telegram-Bot-Api-Secret-Token: test_staff_webhook_secret" \
       -H "Content-Type: application/json" \
       -d '{
         "update_id": 20003,
         "callback_query": {
           "id": "cbq_resched_1",
           "from": {"id": 777000111},
           "message": {"message_id": 51, "chat": {"id": -1001234567890}},
           "data": "staff:reschedule:<ORDER_ID>"
         }
       }'
     ```
  2. Скопировать из ответа `magicRescheduleUrl` (содержит `orderId`, `version`, `expiresAt`, `nonce`, `sig`) и открыть в браузере.
  3. Если мастер нажмёт `[ 🔄 Перенести ]` ещё раз, убедиться, что старая ссылка перестала работать (так как `rescheduleTokenHash` в БД перезаписался новым `nonce`).
- **Ожидаемый результат:**
  - `confirmationStatus` заказа равен `RESCHEDULE_OFFERED`, в `rescheduleTokenHash` лежит SHA-256 от `nonce`.
  - После использования ссылки `rescheduleTokenConsumedAt` заполняется, `rescheduleTokenHash` обнуляется, повторное использование той же ссылки отклоняется.

---

### TC-BOT-STAFF-05: Бан клиента за выпрашивание скидки (`[ 🚫 В чёрный список ]`) и разбан
- **Цель:** Проверить `FR-017` — блокировку по телефону/Telegram ID, освобождение слота, редактирование сообщения по GDPR и возврат HTTP 403 при новой попытке записи.
- **Шаги:**
  1. Создать тестовую бронь с телефоном `+79998887766`.
  2. Отправить колбэк бана от мастера:
     ```bash
     curl -i -X POST http://localhost:3000/api/bot/staff/webhook \
       -H "X-Telegram-Bot-Api-Secret-Token: test_staff_webhook_secret" \
       -H "Content-Type: application/json" \
       -d '{
         "update_id": 20004,
         "callback_query": {
           "id": "cbq_ban_1",
           "from": {"id": 777000111},
           "message": {"message_id": 52, "chat": {"id": -1001234567890}},
           "data": "staff:blacklist:<ORDER_ID>"
         }
       }'
     ```
  3. Попробовать снова забронировать любой слот на сайте с телефоном `+7 (999) 888-77-66` (в любом форматировании).
  4. Разблокировать клиента через админский эндпоинт:
     ```bash
     curl -i -X POST http://localhost:3000/api/admin/users/unblock \
       -H "Authorization: Bearer test_admin_token_secret_1234567890" \
       -H "Content-Type: application/json" \
       -d '{
         "phone": "+79998887766",
         "actor": "admin_valera",
         "reason": "Клиент извинился и согласился на фиксированный прайс"
       }'
     ```
- **Ожидаемый результат:**
  - На шаге 2: заказ переходит в `CANCELLED`, `cancellationReason = 'CLIENT_BLOCKED'`, `ConfirmationStatus` **не меняется** на `STAFF_APPROVED`, слот переходит в `RELEASED` (время снова свободно!), в очередь `TelegramOutbox` ставится задача замены текста карточки на `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]` и удаления кнопок.
  - На шаге 3: `POST /api/booking/lock` мгновенно возвращает **HTTP `403 Forbidden`** (`{"error":"Access restricted"}`).
  - На шаге 4: разблокировка возвращает `200 OK`, после чего клиент снова может записываться.

---

### TC-BOT-STAFF-06: Завершение визита (`[ ✔️ Заказ выполнен ]` $\to$ `FULFILLED`)
- **Цель:** Проверить `FR-021` — финальный переход заказа после оказания услуги и автоматическую GDPR-редакцию карточки в чате.
- **Шаги:**
  Для одобренного заказа (`confirmationStatus = 'STAFF_APPROVED'` или `'CLIENT_CONFIRMED'`) отправить колбэк:
  ```bash
  curl -i -X POST http://localhost:3000/api/bot/staff/webhook \
    -H "X-Telegram-Bot-Api-Secret-Token: test_staff_webhook_secret" \
    -H "Content-Type: application/json" \
    -d '{
      "update_id": 20005,
      "callback_query": {
        "id": "cbq_fulfill_1",
        "from": {"id": 777000111},
        "message": {"message_id": 50, "chat": {"id": -1001234567890}},
        "data": "staff:fulfill:<ORDER_ID>"
      }
    }'
  ```
- **Ожидаемый результат:**
  - Статус заказа в БД становится `FULFILLED`.
  - Для карточки в Telegram ставится задача приоритета `1` (`CRITICAL_GDPR_AND_MARKUP`) на замену ПДн строкой `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]` и удаление инлайн-клавиатуры.
  - Теперь у этого клиента есть `>= 1` завершённый заказ — при следующей записи флаг `autoCancelOnNoConfirmation` для него автоматически выставится в `false` (постоянный клиент!).

---

## 💰 ЧАСТЬ 4: Тестирование Запоздалой Оплаты и Возвратов (`FR-019`, `FR-022`)

### TC-PAY-01: Раздельные возвраты — Telegram Stars vs Crypto Reimbursement
- **Цель:** Проверить `FR-022` — идемпотентное создание `RefundOperation` без порчи неизменяемого `PaymentEvent`.
- **Шаги:**
  Выполнить запрос на возврат через админский API:
  ```bash
  curl -i -X POST http://localhost:3000/api/admin/orders/<ORDER_ID>/refund \
    -H "Authorization: Bearer test_admin_token_secret_1234567890" \
    -H "Content-Type: application/json" \
    -d '{
      "kind": "TELEGRAM_STARS_REFUND",
      "idempotencyKey": "refund_test_key_001",
      "amountMinor": 17500,
      "currency": "XTR",
      "actor": "admin_valera",
      "reason": "Overbooked slot resolution",
      "telegramUserId": "555111",
      "telegramPaymentChargeId": "st_charge_999"
    }'
  ```
  Затем отправить тот же запрос повторно с тем же `"idempotencyKey": "refund_test_key_001"`.
- **Ожидаемый результат:**
  - Первый вызов возвращает `201 Created`, создаёт запись в таблице `RefundOperation` и переводит `Order.refundStatus = 'REFUNDED'`.
  - Второй вызов возвращает `200 OK` с флагом `"deduplicated": true` без повторного списания.
  - Таблица `PaymentEvent` не содержит синтетических отрицательных строк.

---

## ✅ Чеклист финальной приёмки ручного тестирования (Sign-Off)

- [ ] **TC-WEB-01..05**: Корзина считает сумму и длительность нескольких услуг, сетка 30 минут скрывает окна перед обедом, `23P01` возвращает 409, дубликаты `itemIds` дают 400.
- [ ] **TC-BOT-CLIENT-01..04**: Неверный секрет даёт 403, поддельный `customerTgId` без `initData` даёт 401, напоминание переводит заказ в `CLIENT_CONFIRMED`.
- [ ] **TC-BOT-STAFF-01..06**: Телефон замаскирован, `customerNotes` не светит в Telegram, чужой клик в группе получает 403 `Access denied`, бан блокирует повторную запись с 403, `FULFILLED` зачищает карточку по GDPR и переводит клиента в разряд постоянных.
- [ ] **TC-PAY-01**: Возвраты (`RefundOperation`) идемпотентны по `idempotencyKey` и не мутируют `PaymentEvent`.

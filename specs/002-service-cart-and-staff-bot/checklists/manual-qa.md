# Регламент и Тест-Кейсы Ручного Тестирования (Manual QA Playbook) — Сайт, Telegram Mini App, Client Bot & Staff Bot

> *"Пока не доказано, не ебёт что сказано. А зелёный юнит-тест с замоканной базой — это иллюзия безопасности."* — Валера (`speckit.test-engineer.md`)

**Проект:** `UnderUndre/undreseller` (Фичи `001-modular-commerce-template` + `002-service-cart-and-staff-bot`)
**Стандарт верификации:** Zero-Trust QA Audit (`speckit.test-engineer.md`, NIST SP 800-218 SSDF)
**Охват:** Веб-витрина (`/`), Корзина услуг (`CartDrawer`), Сетка слотов 30 мин (`/book`), Чекаут (`/checkout`), Клиентский Telegram-бот + Mini App (`TELEGRAM_BOT_TOKEN`), Служебный Telegram-пейджер мастера (`STAFF_BOT_TOKEN`), PostgreSQL `btree_gist` и админские API.

Все `curl`-запросы вынесены в bash-скрипты в [`scripts/`](scripts). Каждый скрипт сам достаёт id из базы или из ответа предыдущего шага и в конце печатает `[OK]`/`[FAIL]`, так что подставлять `<SERVICE_ID>` и `<ORDER_ID>` руками больше не нужно. `jq` не требуется — JSON разбирает `node`.

---

## 0. Что надо вписать руками, а что уже зашито

Скрипты читают `undreseller/.env`, а если его нет — берут значения из `.env.example`.

| Переменная | Где взять | Обязательна для |
| --- | --- | --- |
| `ADMIN_TOKEN` | Уже задан в `.env.example`: `test_admin_token_secret_1234567890`. Для боя — свой секрет длиной от 16 символов. | Всех админских вызовов |
| `TELEGRAM_WEBHOOK_SECRET` | Уже задан: `test_telegram_secret`. Это общий секрет вебхука, его же передаёшь в `setWebhook` (см. ниже). | `06`, `07` |
| `STAFF_WEBHOOK_SECRET` | Уже задан: `test_staff_webhook_secret`. | `10`–`14` |
| `STAFF_CHAT_ID` | Уже задан: `-1001234567890`. Для живого прогона — id супергруппы мастеров. Узнать: добавить в группу `@userinfobot` либо прочитать `chat.id` из апдейта. | `10`–`14` |
| `TELEGRAM_BOT_TOKEN` | **Заглушка `123456:ABC-DEF...` не работает.** Живой токен выдаёт [@BotFather](https://t.me/BotFather): `/mybots` → бот → *API Token*. Вписать в `.env` и **перезапустить `npm run dev`**, иначе сервер его не увидит. | `09` (подпись initData), `16` шаг B (возврат звёзд) |
| `STAFF_BOT_TOKEN` | Точно так же через BotFather, но для **второго** бота — служебного. В `.env.example` лежит заглушка `654321:STAFF-BOT-...`. | Только живой отправки сообщений мастеру; API-прогон обходится без него |
| `AUTHORIZED_STAFF_USER_ID` | Числовой Telegram-id мастера, по умолчанию `777000111`. Свой id узнать у [@userinfobot](https://t.me/userinfobot). | `10`–`14` |
| `DATABASE_URL` | Уже задан: `postgresql://postgres:postgres@localhost:5432/undreseller`. | Сверки скриптов с базой |

Переопределить любой параметр на один запуск можно переменной окружения, она старше `.env`:

```bash
STAFF_CHAT_ID=-1009876543210 AUTHORIZED_STAFF_USER_ID=42424242 bash scripts/10-staff-unauth.sh
```

Живой Telegram для API-прогона **не нужен**: вебхуки мы дёргаем сами, а карточку мастера рендерим функцией напрямую (`15-staff-card.sh`). Токены нужны ровно в двух местах — подпись initData и реальный возврат звёзд.

### Как подвесить живого бота на локальный сервер

Если хост с сервером уже имеет публичный IP или доменное имя (не localhost), регистрируем веб-хуки автоматизированным скриптом:

```bash
# 1. Убедиться, что живые токены в .env:
#    TELEGRAM_BOT_TOKEN=<живой токен от BotFather>
#    STAFF_BOT_TOKEN=<второй живой токен>

# 2. Запустить скрипт регистрации вебхуков:
PUBLIC_URL=https://myserver.com bash specs/002-service-cart-and-staff-bot/checklists/scripts/_setup-webhooks.sh

# Или если в .env.local уже стоит PUBLIC_URL:
bash specs/002-service-cart-and-staff-bot/checklists/scripts/_setup-webhooks.sh
```

**Полная документация по вебхукам:** [WEBHOOK-SETUP.md](./WEBHOOK-SETUP.md) — troubleshooting, ручная регистрация, проверка статуса.

Скрипт [`_setup-webhooks.sh`](scripts/_setup-webhooks.sh):
- Регистрирует вебхук для клиентского бота на `/api/bot/telegram/webhook`
- Регистрирует вебхук для служебного бота на `/api/bot/staff/webhook`
- Передаёт `secret_token` (уже в `.env.example` как `test_telegram_secret` и `test_staff_webhook_secret`)
- Проверяет статус обоих вебхуков
- Выводит URL и статус регистрации

**Если нужен туннель** (для локальной разработки без публичного хоста):

```bash
# 1. cloudflared (рекомендуется):
cloudflared tunnel --url http://localhost:3000
# Напечатает: https://<random>.trycloudflare.com

# 2. Или ngrok:
ngrok http 3000
# Напечатает: https://<random>.ngrok.io

# 3. Зарегистрировать вебхуки с выданным URL:
PUBLIC_URL=https://<random>.trycloudflare.com bash specs/002-service-cart-and-staff-bot/checklists/scripts/_setup-webhooks.sh
```

**Требования:**
- `TELEGRAM_BOT_TOKEN` и `STAFF_BOT_TOKEN` — живые токены от [@BotFather](https://t.me/BotFather)
- `PUBLIC_URL` — доступный из интернета URL (примеры: `https://myserver.com`, `https://12.34.56.78:8443`)
- `TELEGRAM_WEBHOOK_SECRET` и `STAFF_WEBHOOK_SECRET` — уже в `.env.example`
- Служебный бот должен состоять в супергруппе `STAFF_CHAT_ID` и иметь право писать

---

## 1. Предварительная подготовка стенда

Поднять Postgres, накатить миграции, засеять данные, завести вторую услугу на 30 минут и прописать настройки staff-бота — всё это делает один скрипт:

```bash
cd undreseller
npm run dev        # в отдельном терминале, скрипт ходит на http://localhost:3000

bash specs/002-service-cart-and-staff-bot/checklists/scripts/00-preflight.sh
```

По частям внутри `00-preflight.sh`: `docker compose up -d postgres` → `npm run db:migrate` → `npm run db:seed` → `POST /api/admin/items` (услуга `express-code-review`, 30 мин, `$150.00`) → `PUT /api/admin/settings` (`slotGridStepMin = 30`, чат мастера, список допущенных id).

Скрипт пишет id обеих услуг в `scripts/.state/`. Повторный запуск безопасен: существующую услугу он не создаёт заново, а находит в каталоге.

### Порядок прогона

```bash
bash specs/002-service-cart-and-staff-bot/checklists/scripts/run-all.sh
```

Либо по одному. Зависимости такие:

| Скрипт | Кейс | От чего зависит |
| --- | --- | --- |
| `00-preflight.sh` | стенд | `npm run dev`, Docker |
| `01-web-cart.sh` | TC-WEB-01 | `00` |
| `02-web-slots.sh` | TC-WEB-02 | `00` |
| `03-web-checkout.sh` | TC-WEB-03 | `00`; пишет `scripts/.state/order_id` |
| `04-web-conflict.sh` | TC-WEB-04 | `00` |
| `05-web-cart-guard.sh` | TC-WEB-05 | `00` |
| `06-bot-client-secret.sh` | TC-BOT-CLIENT-01 | `00` |
| `07-bot-client-inbox.sh` | TC-BOT-CLIENT-02 | `00` |
| `08-bot-client-initdata-guard.sh` | TC-BOT-CLIENT-03 | `00` |
| `09-bot-client-initdata-valid.sh` | TC-BOT-CLIENT-03b | `00`, живой `TELEGRAM_BOT_TOKEN` |
| `17-bot-client-confirm.sh` | TC-BOT-CLIENT-04 | `03` |
| `10-staff-unauth.sh` | TC-BOT-STAFF-02 | `03` |
| `11-staff-approve.sh` | TC-BOT-STAFF-03 | `03` |
| `12-staff-reschedule.sh` | TC-BOT-STAFF-04 | `11` |
| `13-staff-blacklist.sh` | TC-BOT-STAFF-05 | `00` (свой заказ, чужие не трогает) |
| `14-staff-fulfill.sh` | TC-BOT-STAFF-06 | `11` |
| `15-staff-card.sh` | TC-BOT-STAFF-01 | только исходники, сервер не нужен |
| `16-refund.sh` | TC-PAY-01 | `03`; шаг B ещё и живые токены оплаты |

`11`, `12` и `14` гоняют **один и тот же** заказ по конвейеру, поэтому по второму разу по отдельности их запускать нельзя — заказ уже будет в другом состоянии. Для повтора прогони `03` заново, он перезапишет `order_id`. Скрипт `17` запускается **после** `03`, но **независимо** от `11`–`14`, так что его можно гонять несколько раз на одном `order_id` — он проверяет идемпотентность и `DUPLICATE_CALLBACK`.

---

## 2. ЧАСТЬ 1: Веб-сайт (витрина и корзина услуг)

### TC-WEB-01: Несколько услуг в корзине и суммирование

- **Цель:** `FR-001`, `FR-002` — выбор нескольких услуг, итоговое время `totalDurationMin` и сумма `totalMinor`.
- **Скрипт:** `scripts/01-web-cart.sh`
- **Что проверяет скрипт:** бронирует обе услуги на реальный свободный слот и сверяет `totalMinor = 50000` ($500.00) и `totalDurationMin = 90` и в ответе API, и в таблицах `Order` / `SlotReservation`.
- **Что смотрим глазами** на `http://localhost:3000`:
  1. Карточка **Sovereign Architecture Audit** — 60 мин, `$350.00`; карточка **Express Code & Security Review** — 30 мин, `$150.00`.
  2. Добавить обе в корзину записи.
  3. В `CartDrawer` две позиции, длительность **1 ч 30 мин**, сумма **`$500.00`**, а кнопка перехода передаёт оба `itemIds` на `/book`.

---

### TC-WEB-02: Сетка слотов с шагом 30 минут

- **Цель:** `FR-003`, `FR-004` — стартовые точки каждые 30 минут, окна, залезающие на обед (`13:00–14:00`), конец смены (`18:00`) или чужую бронь, отсекаются.
- **Скрипт:** `scripts/02-web-slots.sh`
- **Что проверяет скрипт** на ближайшем рабочем дне для корзины в 90 минут:
  - шаг сетки кратен 30 минутам;
  - `11:30` доступен (`11:30 + 90 мин = 13:00`, ровно до обеда);
  - `12:00` и `12:30` скрыты — пересекают обед;
  - `14:00` снова доступен, последний слот дня — `16:30` (`16:30–18:00`), а `17:00` и `17:30` скрыты.
- **Что смотрим глазами:** то же самое на `/book`, выбрав ближайший будний день.

Часы магазина `windows.ts` отсчитывает от полуночи UTC, поэтому сравнивать их с локальным часовым поясом не нужно.

---

### TC-WEB-03: Пожелания клиента, дисклеймер фикс-прайса, оплата на месте

- **Цель:** `FR-006`, `FR-016` — анти-торг дисклеймер, сохранение комментария, бронь `PAY_ON_SITE`.
- **Скрипт:** `scripts/03-web-checkout.sh`
- **Что проверяет скрипт:** `POST /api/booking/lock` на 10:00 ближайшего рабочего дня с именем `Иван Тестов`, телефоном `+7 999 111 22 33`, комментарием `Просьба сделать акцент на проверке GiST-индексов` и `paymentType = PAY_ON_SITE`. Ответ `201`, id заказа сохраняется в `scripts/.state/order_id`. В базе:
  - `Order.paymentType = PAY_ON_SITE`, `confirmationStatus = PENDING_STAFF_REVIEW`, `autoCancelOnNoConfirmation = true` (завершённых визитов у клиента ещё нет);
  - `SlotReservation.status = HELD`, `resourceId = default_master`, `totalDurationMin = 90`.
- **Что смотрим глазами** на `/book`: под полем комментария висит предупреждение, что прайс фиксированный и торг/скидки не рассматриваются. После подтверждения UI показывает номер `ORD-...` и время, до которого держится холд.

---

### TC-WEB-04: Защита от двойного бронирования (PostgreSQL `23P01` → HTTP 409)

- **Цель:** `FR-005` — exclusion constraint `slot_resource_no_overlap` не даёт двум интервалам одного мастера пересечься.
- **Скрипт:** `scripts/04-web-conflict.sh`
- **Что проверяет скрипт:** занимает `10:00–11:30`, затем пытается занять `10:30`. Ожидаем HTTP `409` с текстом `Selected slot has just been taken by another customer` и **ноль** строк `SlotReservation` на 10:30.
- **Что смотрим глазами:** две вкладки на `/book` с одной датой. Вторая получает плашку `⚠️ Selected slot has just been taken by another customer. Please choose another window.`

---

### TC-WEB-05: Сервер не верит корзине клиента

- **Цель:** `FR-002a` — дубликаты `itemIds` и несуществующие услуги отвергаются.
- **Скрипт:** `scripts/05-web-cart-guard.sh`
- **Что проверяет скрипт:**
  - повтор одного и того же id в `itemIds` → HTTP `400` с кодом `DUPLICATE_CART_ITEM` (так и называется в `lib/booking/cart.ts`; старая формулировка `DUPLICATE_ITEM_IDS` была неверной);
  - id `00000000-0000-0000-0000-000000000000` → HTTP `400`;
  - ни один из запросов не создал заказ.

---

## 3. ЧАСТЬ 2: Клиентский Telegram-бот и Mini App

### TC-BOT-CLIENT-01: Вебхук не пускает с чужим секретом

- **Цель:** `FR-04` — запрос без правильного `X-Telegram-Bot-Api-Secret-Token` отклоняется.
- **Скрипт:** `scripts/06-bot-client-secret.sh`
- **Что проверяет скрипт:** шлёт `/start` с секретом `wrong_secret`. Ожидаем HTTP `403` и то же число строк в `InboxEvent`, что было до запроса.

---

### TC-BOT-CLIENT-02: `/start` попадает в Inbox ровно один раз

- **Цель:** приём апдейта с верным секретом и идемпотентность по `update_id`.
- **Скрипт:** `scripts/07-bot-client-inbox.sh`
- **Что проверяет скрипт:** апдейт `update_id` (случайный, чтобы повторные прогоны не спотыкались о старые) с чатом `555111` и текстом `/start`.
  - первый запрос → `200`, ровно одна строка `InboxEvent` с `provider = TELEGRAM` и `kind = TELEGRAM_UPDATE`;
  - повтор с тем же `update_id` → `200` и тело `OK (duplicate)`, вторая строка не появляется (уникальность `provider + eventId`).

---

### TC-BOT-CLIENT-03: Чужой `customerTgId` без подписи initData

- **Цель:** `FR-05` — из обычного браузера нельзя назваться произвольным пользователем Telegram.
- **Скрипт:** `scripts/08-bot-client-initdata-guard.sh`
- **Что проверяет скрипт:** `POST /api/booking/lock` с `customerTgId = 555111` и без `initData`. Ожидаем HTTP `401` и текст `customerTgId provided without valid initData HMAC`.

### TC-BOT-CLIENT-03b: Правильно подписанный initData проходит

- **Скрипт:** `scripts/09-bot-client-initdata-valid.sh`
- **Что нужно вписать:** живой `TELEGRAM_BOT_TOKEN` в `.env`, затем перезапустить `npm run dev`. Скрипт считает подпись сам, тем же алгоритмом, что `lib/security/initData.ts`:

```
secret_key = HMAC_SHA256(key="WebAppData", data=TELEGRAM_BOT_TOKEN)
data_check = пары key=value без hash, ключи по алфавиту, через \n
hash       = hex(HMAC_SHA256(key=secret_key, data=data_check))
```

`auth_date` берётся текущим — подпись старше часа сервер отвергает. Свой id вместо тестового `555111` задаётся так: `TG_USER_ID=42424242 bash scripts/09-bot-client-initdata-valid.sh`.

Ожидаем HTTP `201` и `Order.customerTgId`, равный заявленному. Без токена скрипт печатает `[SKIP]` и выходит с нулём, чтобы не ронять общий прогон.

---

### TC-BOT-CLIENT-04: Клиент подтверждает визит кнопкой напоминания

- **Цель:** `FR-012`, `FR-013` — ответ на пуш накануне визита переводит заказ в `CLIENT_CONFIRMED` и гасит джоб автоотмены новичка.
- **Скрипт:** `scripts/17-bot-client-confirm.sh` (создан после устранения дефекта).
- **Дефект был:** вебхук клиентского бота не обрабатывал колбэки `client:confirm:<orderId>` и `client:decline:<orderId>`. Вызов `handleClientConfirmationCallback` из `lib/jobs/inngest.ts` был не подключён.
- **Дефект пофиксен:** в `lib/jobs/inngest.ts` добавлена парсинг callback_query.data с маршрутизацией `client:confirm:*` и `client:decline:*` на `handleClientConfirmationCallback()` с эмитом событий `order/client-confirmed` / `order/client-declined`.
- **Что проверяет скрипт:** отправляет апдейт вебхука с колбэком `client:confirm:<orderId>` от ожидаемого мастера, ожидаем:
  1. `200` и `status: APPLIED`;
  2. в базе `Order.confirmationStatus = CLIENT_CONFIRMED`, `scheduleVersion` вырос на 1;
  3. событие `order/client-confirmed` было эмичено (логируется в сервере).
- **Что подставляется само:** id заказа из `03-web-checkout.sh`, id чата и секрет из переменных окружения.
- **Глазами:** функция `handleClientConfirmationCallback` в коде `lib/bot/clientConfirmation.ts` корректна, но это проверяется кодом, не скриптом.

---

## 4. ЧАСТЬ 3: Служебный бот мастера

### TC-BOT-STAFF-01: Карточка заказа прячет персональные данные

- **Цель:** `FR-008` — в сообщение Telegram не попадают ни полный телефон, ни текст `customerNotes`.
- **Скрипт:** `scripts/15-staff-card.sh` (сервер и база не нужны, гоняет чистую функцию).
- **Что проверяет скрипт** на телефоне `+7 (999) 123-45-67` и комментарии `Сделайте скидку 50%, у меня аллергия`:
  - в тексте карточки телефон выглядит как `+7 *** *** 4567`, цифр `1234567` нет;
  - текста комментария нет, вместо него пометка `Есть примечания — доступно в защищённой админ-панели`;
  - клавиатура содержит `staff:approve`, `staff:reject`, `staff:reschedule`, `staff:blacklist`, `staff:fulfill` с id заказа.
- **Статус:** ⚠️ **Дефект**: `formatStaffOrderCard` функция готова (проверена скриптом `15`), но **не подключена к созданию заказа**. При чекауте сейчас карточка мастеру не отправляется. Нужно в `lib/bot/clientConfirmation.ts` (обработчик создания заказа) добавить `enqueueTelegramOutbox(formatStaffOrderCard(order))`.
- **Как проверить (после фикса):** запустить `03-web-checkout.sh`, и убедиться в логах сервера, что `enqueueTelegramOutbox` вызвана с `STAFF_BOT_OUTBOUND`. Карточка появится в чате `STAFF_CHAT_ID` с кнопками `staff:*` и замаскированным номером телефона.

---

### TC-BOT-STAFF-02: Посторонний в групповом чате не может нажать кнопку

- **Цель:** `FR-007` — `authorizeStaffCallback` пускает только id из `ShopSettings.authorizedStaffUserIds`.
- **Скрипт:** `scripts/10-staff-unauth.sh`
- **Что проверяет скрипт:** колбэк `staff:approve:<orderId>` от пользователя `999999999`, которого в списке нет. Ожидаем HTTP `403` со `status: ACCESS_DENIED` и неизменный `confirmationStatus` заказа.
- **Что подставляется само:** id заказа из `03-web-checkout.sh`, чат из `STAFF_CHAT_ID`, секрет из `STAFF_WEBHOOK_SECRET`.

---

### TC-BOT-STAFF-03: Мастер принимает запись, повторные клики безопасны

- **Цель:** `FR-009` и транзакционный CAS.
- **Скрипт:** `scripts/11-staff-approve.sh`
- **Что проверяет скрипт** тремя колбэками от `AUTHORIZED_STAFF_USER_ID`:
  1. первый `staff:approve` → `200`, `status: APPLIED`, событие `order/staff-approved`;
  2. тот же `callback_query.id` → `status: DUPLICATE_CALLBACK` (ключ `staff_cbq_<id>`);
  3. новый `callback_query.id` → `status: ALREADY_PROCESSED`.
- В базе: `confirmationStatus = STAFF_APPROVED`, `SlotReservation.status = BOOKED`, `scheduleVersion` вырос на 1.
- Заказ при этом `PAY_ON_SITE`. Ветка `prepaymentTiming = AFTER_STAFF_APPROVAL` + `PREPAYMENT_ONLINE` (статус `AWAITING_PAYMENT`, `invoiceExpiresAt = now + 15 мин`) этим скриптом не покрыта — для неё нужно заранее выставить настройки и создать отдельный заказ.

---

### TC-BOT-STAFF-04: Перенос записи и одноразовая magic-ссылка

- **Цель:** `FR-011` — HMAC-ссылка с `nonce`, которая умирает при повторном выпуске.
- **Скрипт:** `scripts/12-staff-reschedule.sh` (запускать после `11`, заказ должен быть жив).
- **Что проверяет скрипт:**
  - первый `staff:reschedule` → в ответе `magicRescheduleUrl` с `orderId`, `version`, `expiresAt`, `nonce`, `sig`;
  - `confirmationStatus = RESCHEDULE_OFFERED`, а `rescheduleTokenHash` равен SHA-256 от `nonce`;
  - второй `staff:reschedule` выпускает другой `nonce` и перезаписывает хеш, так что старая ссылка с базой уже не сходится.
- **Что смотрим глазами:** открыть напечатанную ссылку в браузере и убедиться, что страница переноса открывается, а повторно уже нет. Сам переход по ссылке скрипт не делает — это UI.

---

### TC-BOT-STAFF-05: Бан клиента и разбан

- **Цель:** `FR-017` — блокировка по телефону, освобождение слота, зачистка сообщения по GDPR, HTTP 403 на новую запись.
- **Скрипт:** `scripts/13-staff-blacklist.sh` (создаёт собственную бронь, заказ из `03` не трогает).
- **Что проверяет скрипт:**
  1. бронь на `+79998887766` с комментарием про скидку;
  2. `staff:blacklist` → `Order.status = CANCELLED`, `cancellationReason = CLIENT_BLOCKED`, `confirmationStatus` остаётся `PENDING_STAFF_REVIEW` (его не повышают до `STAFF_APPROVED`), `SlotReservation.status = RELEASED`;
  3. новая запись с телефоном `+7 (999) 888-77-66` — тем же номером в другой записи — даёт HTTP `403` и `{"error":"Access restricted"}`, потому что сверка идёт по E.164;
  4. `POST /api/admin/users/unblock` с `actor = admin_valera` возвращает `200`, и следующая запись этого телефона снова проходит с `201`.

---

### TC-BOT-STAFF-06: Завершение визита

- **Цель:** `FR-021` — заказ закрывается, карточка в чате зачищается, клиент становится постоянным.
- **Скрипт:** `scripts/14-staff-fulfill.sh` (после `11`: нужен `confirmationStatus = STAFF_APPROVED`).
- **Что проверяет скрипт:**
  - `staff:fulfill` → `200`, `status: APPLIED`, в базе `Order.status = FULFILLED`;
  - в `InboxEvent` появляется задача с текстом `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]` (приоритет `CRITICAL_GDPR_AND_MARKUP` = 100, действие `editMessageText`);
  - следующая запись того же телефона создаётся с `autoCancelOnNoConfirmation = false` — автоотмена новичка ему больше не грозит.

---

## 5. ЧАСТЬ 4: Возвраты

### TC-PAY-01: Раздельные возвраты Stars и крипты

- **Цель:** `FR-022` — идемпотентный `RefundOperation`, который не портит неизменяемый `PaymentEvent`.
- **Скрипт:** `scripts/16-refund.sh`

**Шаг A — крипто-возмещение, работает без внешних сервисов.** `CRYPTO_REIMBURSEMENT` на заказ из `03-web-checkout.sh`:

- `asset = USDT`, `network = TRC20` (допустимы `TON`, `TRC20`, `ERC20`, `SOL`, `BTC`, `ARB`), `destination` — адрес длиннее 16 символов, `networkFeeMinor` в пределах 5% от суммы;
- первый вызов → `201`, `Order.refundStatus = REFUNDED`, `RefundOperation.status = CONFIRMED`;
- повтор с тем же `idempotencyKey = refund_manual_qa_crypto_001` → `200` и `"deduplicated": true`;
- число строк `PaymentEvent` по заказу не меняется.

**Шаг B — возврат Telegram Stars, пропускается, пока нет живых данных.** Скрипт печатает `[SKIP]`, если не задано всё из списка:

1. `TELEGRAM_BOT_TOKEN` — настоящий токен, не заглушка `123456:...`, прописан в `.env` **до** запуска `npm run dev`;
2. `TELEGRAM_USER_ID` — числовой id клиента, который платил звёздами;
3. `TELEGRAM_PAYMENT_CHARGE_ID` — `telegram_payment_charge_id` из `successful_payment`, он же сохраняется в `Order.paymentRef`.

Запуск шага B:

```bash
TELEGRAM_USER_ID=555111 TELEGRAM_PAYMENT_CHARGE_ID=st_charge_999 \
  bash specs/002-service-cart-and-staff-bot/checklists/scripts/16-refund.sh
```

Ожидаем `201` и `RefundOperation.status = CONFIRMED`. Статус `FAILED` означает, что Telegram отклонил `refundStarPayment` — причина лежит в `RefundOperation.errorMessage`.

---

## 6. Чеклист финальной приёмки

- [ ] **TC-WEB-01..05** (`01`–`05`): корзина считает сумму и длительность нескольких услуг, сетка 30 минут прячет окна перед обедом и концом смены, пересечение интервалов даёт 409, дубликаты `itemIds` дают 400 с кодом `DUPLICATE_CART_ITEM`.
- [ ] **TC-BOT-CLIENT-01..03** (`06`–`09`): чужой секрет даёт 403, повторный `update_id` не плодит строки, `customerTgId` без подписи даёт 401, а с правильной — 201.
- [ ] **TC-BOT-CLIENT-04** (`17`): клиент нажимает кнопку подтверждения визита → `handleClientConfirmationCallback` обработана, заказ переходит в `CLIENT_CONFIRMED`, джоб автоотмены новичка гасится. **✅ Фиксенный: FR-013 выполнен. Bot инициализируется с кешированным `botInfo` из `globalThis` чтобы пережить Next.js HMR.**
- [ ] **TC-BOT-STAFF-01..06** (`15`, `10`–`14`): телефон замаскирован, текст `customerNotes` в карточку не попадает, чужой клик в группе даёт 403 `ACCESS_DENIED`, повторный approve идемпотентен, magic-ссылка одноразовая, бан блокирует повторную запись с 403 и снимается через `unblock`, `FULFILLED` зачищает карточку и переводит клиента в постоянные.
- [ ] **TC-PAY-01** (`16`): крипто-возврат идемпотентен по `idempotencyKey` и не мутирует `PaymentEvent`. Возврат звёзд прогнан отдельно, с живым `TELEGRAM_BOT_TOKEN` и реальным `telegram_payment_charge_id`.

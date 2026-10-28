# Test Cases: 006-google-calendar-and-integrations (ISO/IEC/IEEE 29119-3)

**Generated**: 2026-10-26 (updated: analyze re-run #2 X4) · **Slug-префиксы**: GCAL / ICS / WHK / API / ZOD · **Всего TC**: 46 + 2 Exploratory Charter
**Соотношение Positive / Negative+Boundary**: 10 / 33 (23% / 77% — требование ≥40/60 выполнено)

**Общие предусловия (если не указано иное)**: чистый инстанс, миграция `20270201000000_006_integrations` применена; OWNER `owner@test.undreseller` (пароль `Test-Pass-2026!`), OPERATOR `operator@test.undreseller`; `INTEGRATION_ENCRYPTION_KEY` установлен; Google test-проект подключён; `stripe listen`-аналог не требуется.

---

## US1: Google Calendar Sync (Critical: FR-602/603 → DT + STM + BVA + Error Guessing)

### TC-GCAL-001: OWNER подключает календарь — happy path
- **Traceability**: FR-601, NFR-603 · Task T020 · **Tier**: Smoke · **Priority**: P0 · **Type**: Functional · **Technique**: EP
- **Pre-conditions**: сессия OWNER; `IntegrationCredential` пуста
- **Test Data**: resource `res_master_1`, redirect `http://localhost:3000/api/admin/integrations/gcal/callback`, Google-аккаунт `gc-master-1@test.gmail`
- **Execution Steps**: 1) `/admin/settings` → Integrations → «Connect» для `res_master_1`; 2) пройти Google consent (scope `calendar.events`, `calendar.readonly`); 3) вернуться на `/admin/settings`
- **Expected Result**: статус карточки = `CONNECTED`; в БД `IntegrationCredential` 1 строка: `provider='GOOGLE_CALENDAR'`, `resourceId='res_master_1'`, `encryptedPayload` начинается с `v1:`, plaintext `refreshToken` в поле отсутствует; audit `GCAL_CONNECTED`
- **Post-conditions**: disconnect тестового подключения

### TC-GCAL-002: OPERATOR не может открыть connect-роут
- **Traceability**: FR-601 (аудит B1) · Task T020 · **Tier**: Regression · **Priority**: P0 · **Type**: Security · **Technique**: EP (роль вне множества)
- **Pre-conditions**: сессия OPERATOR
- **Test Data**: `GET /api/admin/integrations/gcal/connect?resourceId=res_master_1`
- **Execution Steps**: 1) curl с cookie OPERATOR на connect; 2) на callback
- **Expected Result**: оба ответа HTTP 403; `IntegrationCredential` не создана; audit не содержит `GCAL_CONNECTED`
- **Post-conditions**: —

### TC-GCAL-003: OAuth state mismatch → отказ
- **Traceability**: FR-601 (STRIDE Spoofing) · Task T020 · **Tier**: Regression · **Priority**: P0 · **Type**: Security · **Technique**: Error Guessing (CSRF)
- **Pre-conditions**: начат connect (state выдан), в Google-redirect подменён параметр
- **Test Data**: ожидаемый state `A1...` (10 мин TTL), переданный `B2...`
- **Execution Steps**: 1) скопировать callback-URL; 2) заменить `state=B2...`; 3) открыть
- **Expected Result**: HTTP 403, тело `{"error":"oauth_state_mismatch"}`; токенов в БД нет
- **Post-conditions**: state просрочен — повторный connect выдаёт новый

### TC-GCAL-004: невалидный authorization code → NEEDS_REAUTH, без записи токена
- **Traceability**: FR-601, FR-604 · Task T020 · **Tier**: Sanity · **Priority**: P1 · **Type**: Negative · **Technique**: Error Guessing
- **Pre-conditions**: живой state
- **Test Data**: code `invalid-code-000`
- **Execution Steps**: callback с подменённым code
- **Expected Result**: HTTP 502, статус интеграции `NEEDS_REAUTH`; `IntegrationCredential` не создана; lastError без секретов
- **Post-conditions**: —

### TC-GCAL-005: бронь BOOKED → событие в GC ≤60 с
- **Traceability**: FR-602, NFR-602b · Task T021 · **Tier**: Smoke · **Priority**: P0 · **Type**: Functional · **Technique**: State Transition (HELD→BOOKED)
- **Pre-conditions**: TC-GCAL-001 выполнен; услуга «Premium Service» (60 мин, 150.00 USD, IN_CALL) активна
- **Test Data**: слот `2027-02-10T10:00:00+04:00`, клиент `client-ics@test` (email), контакты `+79991234567`
- **Execution Steps**: 1) создать бронь через витрину; 2) OWNER подтверждает в Staff-боте; 3) засечь время перехода; 4) открыть GC мастера
- **Expected Result**: в GC событие `Premium Service — ORD-...` 10:00–11:00 (+04:00), description содержит `+79991234567` (редактировано по канону), `extendedProperties.private.undresellerOrderId = <orderId>`; от перехода до появления ≤60 с; в БД order `PAID/BOOKED`-статусы без изменений от push (fail-open не ломает FSM)
- **Post-conditions**: отменить бронь (TC-GCAL-007 очистит)

### TC-GCAL-006: реплей перехода ×20 → ровно одно событие
- **Traceability**: FR-602 (идемпотентность) · Task T021 · **Tier**: Regression · **Priority**: P0 · **Type**: Negative · **Technique**: BVA (N=1 vs N=20), DT
- **Pre-conditions**: как TC-GCAL-005; тестовый хук пере-dispatch Inngest-события
- **Test Data**: 20 повторных dispatch одного `orderId`
- **Execution Steps**: 1) создать бронь; 2) пере-dispatch 20 раз; 3) подсчитать события в GC по `undresellerOrderId`
- **Expected Result**: в GC ровно 1 событие; в БД 0 дублей; audit push-событий 20 (по одному на dispatch) — без GC-эффектов
- **Post-conditions**: отмена брони

### TC-GCAL-007: CANCELLED → событие удалено
- **Traceability**: FR-602 · Task T021 · **Tier**: Regression · **Priority**: P0 · **Type**: Functional · **Technique**: State Transition
- **Pre-conditions**: живая бронь с событием (из TC-GCAL-005)
- **Execution Steps**: 1) OWNER: «[Отклонить]» в Staff-боте
- **Expected Result**: order `CANCELLED`, reservation `RELEASED`; событие в GC отсутствует (корзина GC не проверяется); если событие уже было удалено в Google (404/410), `deleteEvent` завершается успехом (идемпотентный NOOP F3), audit `GCAL_PUSH` kind=delete status=already_deleted
- **Post-conditions**: —

### TC-GCAL-008: коллизия PAID_REQUIRES_RESOLUTION → событие удалено + audit
- **Traceability**: FR-602 (аудит B2) · Task T021 · **Tier**: Regression · **Priority**: P0 · **Type**: Functional · **Technique**: State Transition (путь RELEASED-with-event)
- **Pre-conditions**: prepaid бронь оплачена → `BOOKED` (событие есть); вторым клиентом занят тот же слот через прямой вызов сервиса с изоляцией GiST-контракта
- **Execution Steps**: 1) спровоцировать коллизию поздним платежом (канон 004 FR-432: слот перехвачен)
- **Expected Result**: order `PAID_REQUIRES_RESOLUTION`, reservation `RELEASED`; событие в GC удалено; audit-событие удаления с `cause=overbooked_resolution`
- **Post-conditions**: разобрать заказ админом

### TC-GCAL-009: PAYMENT_PENDING → NOOP (события нет)
- **Traceability**: FR-602 · Task T021 · **Tier**: Sanity · **Priority**: P1 · **Type**: Negative · **Technique**: Decision Table (строка NOOP)
- **Pre-conditions**: prepaid услуга; бронь в `PAYMENT_PENDING`
- **Execution Steps**: 1) создать бронь, не оплачивать; 2) подождать 90 с; 3) проверить GC
- **Expected Result**: события нет; `PaymentAllocationLink` нет; при последующей оплате → событие появляется (переход BOOKED)
- **Post-conditions**: дождаться экспирации холда или отменить

### TC-GCAL-010: перенос (scheduleVersion++) → PATCH времени
- **Traceability**: FR-602 · Task T021 · **Tier**: Regression · **Priority**: P1 · **Type**: Functional · **Technique**: State Transition
- **Pre-conditions**: бронь с событием (TC-GCAL-005)
- **Test Data**: новый слот `2027-02-11T14:00:00+04:00`
- **Execution Steps**: OWNER: «[Перенести]» → magic-link → клиент выбирает новый слот
- **Expected Result**: то же GC-событие (тот же gcEventId) с новым временем; дублей нет
- **Post-conditions**: отмена

### TC-GCAL-011: Meet-ссылка ⇔ флаг услуги
- **Traceability**: FR-602, spec Q5 · Task T021, T025 · **Tier**: Sanity · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA (flag off→on)
- **Pre-conditions**: две услуги: «Consultation» (`remoteMeetingEnabled=true`) и «Premium Service» (false)
- **Execution Steps**: создать по брони на каждую
- **Expected Result**: событие Consultation содержит `conferenceData` (Meet link, он же в email-подтверждении); событие Premium — без conferencing
- **Post-conditions**: отменить обе

### TC-GCAL-012: инкрементальный sync: +3 новых, −1 удалённое
- **Traceability**: FR-603 · Task T022 · **Tier**: Regression · **Priority**: P0 · **Type**: Functional · **Technique**: State Transition (syncToken delta)
- **Pre-conditions**: TC-GCAL-001; в GC мастера 4 манипуляции между циклами: создать события 09:00–10:00, 12:00–13:00, 15:00–15:30; удалить ранее созданное 12:00–13:00; также в GC присутствует событие нашей брони с `undresellerOrderId`
- **Execution Steps**: 1) дождаться sync-цикла (≤15 мин); 2) SQL: `SELECT * FROM "ExternalBusyBlock" WHERE "resourceId"='res_master_1'`
- **Expected Result**: блоки: 09:00–10:00 UTC+04 и 15:00–15:30 присутствуют; 12:00–13:00 отсутствует; событие с `undresellerOrderId` отфильтровано (F2: 0 записей в `ExternalBusyBlock`); `lastSyncAt` обновлён; строки не содержат названий/гостей событий
- **Post-conditions**: очистить события GC

### TC-GCAL-013: 410 Gone → full-sync без дублей
- **Traceability**: FR-603 · Task T022 · **Tier**: Regression · **Priority**: P0 · **Type**: Negative · **Technique**: Error Guessing (истёкший syncToken)
- **Pre-conditions**: в БД вручную испортить `syncToken` (записать `expired-token-000`); в GC 2 живых события
- **Execution Steps**: дождаться цикла
- **Expected Result**: лог содержит fallback full-sync; `ExternalBusyBlock` ровно по 2 событиям (UNIQUE `(calendarId, gcEventId)` сработал, дублей 0); `syncToken` обновлён
- **Post-conditions**: —

### TC-GCAL-014: sync N=0 → только lastSyncAt
- **Traceability**: FR-603 · Task T022 · **Tier**: Sanity · **Priority**: P2 · **Type**: Boundary · **Technique**: BVA (MIN-1: пустая дельта)
- **Pre-conditions**: GC без изменений между двумя циклами
- **Execution Steps**: сравнить дамп `ExternalBusyBlock` до/после цикла
- **Expected Result**: 0 INSERT/UPDATE/DELETE; `lastSyncAt` сдвинулся; ошибок в логах нет
- **Post-conditions**: —

### TC-GCAL-015: transparent-событие не становится занятостью
- **Traceability**: FR-603 · Task T022 · **Tier**: Regression · **Priority**: P1 · **Type**: Boundary · **Technique**: EP (transparency)
- **Test Data**: событие «Прогулка» с `transparency=transparent` 13:00–14:00
- **Execution Steps**: создать в GC, дождаться цикла, проверить слоты 13:00
- **Expected Result**: блок не создан; слот 13:00 доступен для брони
- **Post-conditions**: удалить событие

### TC-GCAL-016: изоляция ресурсов — занятость A не режет слоты B
- **Traceability**: FR-603 (аудит B3) · Task T023 · **Tier**: Regression · **Priority**: P0 · **Type**: Boundary · **Technique**: Decision Table (ресурс × занятость)
- **Pre-conditions**: два ресурса `res_master_1` (GC подключён), `res_master_2` (без GC)
- **Test Data**: busy-блок A 10:00–11:00 (из TC-GCAL-012)
- **Execution Steps**: открыть витрину: слоты 10:00 у мастера A и у мастера B
- **Expected Result**: у A слоты 10:00–11:00 недоступны; у B — доступны; SQL-выборка содержит `resourceId`-фильтр
- **Post-conditions**: —

### TC-GCAL-017: отзыв доступа в Google → NEEDS_REAUTH, брони живут
- **Traceability**: FR-604 · Task T024 · **Tier**: Regression · **Priority**: P0 · **Type**: Negative · **Technique**: Error Guessing (fail-open)
- **Pre-conditions**: подключение активно
- **Execution Steps**: 1) Google-аккаунт: Security → Third-party access → Remove; 2) следующий push/sync; 3) создать бронь в системе
- **Expected Result**: статус `NEEDS_REAUTH` + баннер в админке; алерт в `STAFF_CHAT_ID`; новая бронь создаётся и FSM проходит нормально (fail-open); audit `GCAL_SYNC_FAILED` с `invalid_grant`
- **Post-conditions**: re-auth по runbook T061

### TC-GCAL-018: perf слот-расчёта при 500 busy-блоках
- **Traceability**: NFR-602 · Task T023 · **Tier**: Extended · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA (насыщение)
- **Pre-conditions**: seed 500 `ExternalBusyBlock` на горизонт 7 дней
- **Execution Steps**: прогнать perf-гейт (`tests/unit/slot-availability-busy.test.ts` p95-замер, 100 итераций)
- **Expected Result**: p95 ≤50 мс; evidence-файл `evidence/slot-perf.md` с сырыми числами
- **Post-conditions**: очистить seed

### TC-GCAL-019: скан логов и БД на plaintext-секреты
- **Traceability**: NFR-603 · Task T011, T024 · **Tier**: Regression · **Priority**: P0 · **Type**: Security · **Technique**: Error Guessing (утечка)
- **Pre-conditions**: выполнены TC-GCAL-001/017 (токены ходили через логи)
- **Execution Steps**: 1) grep логов за сессию: `refreshToken|accessToken|webhookSecret|authorization|ya29\.`; 2) SQL: `SELECT count(*) FROM "IntegrationCredential" WHERE "encryptedPayload" NOT LIKE 'v1:%'`
- **Expected Result**: 0 вхождений в логах; 0 строк вне формата `v1:`; дени-лист срабатывания (`[REDACTED]`) присутствуют
- **Post-conditions**: —

### TC-GCAL-020: disconnect — полный wipe, поведение 004 сохраняется
- **Traceability**: FR-601, FR-604 · Task T020 · **Tier**: Sanity · **Priority**: P2 · **Type**: Functional · **Technique**: EP
- **Pre-conditions**: активное подключение
- **Execution Steps**: 1) Disconnect в админке; 2) проверить БД; 3) создать бронь
- **Expected Result**: строка `IntegrationCredential` удалена (токен невосстановим), busy-блоки ресурса очищены; бронь создаётся без GC-эффектов (поведение 004); audit `GCAL_DISCONNECTED`
- **Post-conditions**: —

### TC-GCAL-044: token refresh коллбэк персистит токены (F6)
- **Traceability**: FR-601 (F6) · Task T020 · **Tier**: Regression · **Priority**: P1 · **Type**: Functional · **Technique**: Error Guessing (неявный жизненный цикл)
- **Pre-conditions**: активное подключение (TC-GCAL-001); мок GC-клиента с принудительным `onTokenRefresh` (access-токен истёк → googleapis emit refresh)
- **Test Data**: новый access-токен `ya29.new-test-token-2027`
- **Execution Steps**: 1) инициировать push/sync с моком, вызывающим refresh-коллбэк; 2) SQL: вычитать `encryptedPayload`, расшифровать через `secretVault.decrypt` (ключ из тестового env)
- **Expected Result**: расшифрованный payload содержит обновлённый `accessToken` (и `refreshToken` при ротации Google); формат строки остаётся `v1:<iv>:<tag>:<ct>`; audit не содержит токенов; последующий вызов API без нового refresh использует персистенный токен
- **Post-conditions**: —

### Exploratory Charter EXP-01: гонки push-канала (FR-602)
- **Session**: 60 мин, тестировщик + мок GC (задержки 0–5 с). Миссия: сломать идемпотентность — одновременные CANCEL+BOOKED, push при NEEDS_REAUTH, перенос во время push, двойной Inngest-fanout. Фикс: любые ≥2 события на один orderId = дефект Major.

### Exploratory Charter EXP-02: таймзоны и границы окна (FR-603)
- **Session**: 60 мин. Миссия:Busy-события через полночь (+04:00→следующий день), DST-переход, событие ровно на границе слота (10:00–11:00 vs слот 11:00), событие в прошлом (>30 дней), календарь в другом поясе мастера. Фикс: любой «наивный» захват слота = дефект Critical.

---

## US2: ICS-аттач

### TC-ICS-021: email-подтверждение содержит валидный ICS
- **Traceability**: FR-605 · Task T030, T031 · **Tier**: Smoke · **Priority**: P2 · **Type**: Functional · **Technique**: EP
- **Pre-conditions**: бронь веб-клиента с `customerEmail=client-ics@test`
- **Execution Steps**: 1) создать бронь; 2) открыть письмо; 3) скачать `booking-<orderNumber>.ics`; 4) импортировать в Google Calendar
- **Expected Result**: файл парсится (RFC 5545), `METHOD:PUBLISH`, `DTSTART;TZID=Asia/Yerevan:20270210T100000`, событие импортируется корректным временем
- **Post-conditions**: удалить импорт, отменить бронь

### TC-ICS-022: спецсимволы в названии услуги экранированы
- **Traceability**: FR-605 · Task T030 · **Tier**: Regression · **Priority**: P2 · **Type**: Boundary · **Technique**: BVA (escape-набор)
- **Test Data**: услуга `SPA, " Deluxe;\\Special\nLine`
- **Execution Steps**: создать бронь, вынуть .ics
- **Expected Result**: SUMMARY корректно экранирован (`\,` `\"` `\;` `\\` `\n`), парсер восстанавливает исходную строку; структура файла валидна
- **Post-conditions**: —

### TC-ICS-023: отмена → METHOD:CANCEL тем же UID
- **Traceability**: FR-605 · Task T031 · **Tier**: Regression · **Priority**: P2 · **Type**: Functional · **Technique**: Decision Table
- **Pre-conditions**: бронь из TC-ICS-021 (UID зафиксирован)
- **Execution Steps**: отменить бронь, открыть письмо об отмене
- **Expected Result**: .ics `METHOD:CANCEL`, `UID` идентичен первому, `SEQUENCE` увеличен
- **Post-conditions**: —

### TC-ICS-024: повторная отправка — UID стабилен
- **Traceability**: FR-605 · Task T031 · **Tier**: Sanity · **Priority**: P3 · **Type**: Boundary · **Technique**: EP (идемпотентность UID)
- **Execution Steps**: пере-dispatch email-подтверждения той же брони
- **Expected Result**: UID в новом файле идентичен; Google не создаёт второго импорта
- **Post-conditions**: —

---

## US3: Webhooks + Public API

### TC-WHK-025: регистрация эндпоинта — секрет показан единожды
- **Traceability**: FR-606 · Task T040 · **Tier**: Smoke · **Priority**: P1 · **Type**: Functional · **Technique**: EP
- **Test Data**: URL `https://webhook.site/#!/undreseller-test-01`, events `[booking.created, booking.cancelled]`
- **Execution Steps**: 1) OWNER: POST /api/admin/webhooks; 2) повторный GET списка
- **Expected Result**: 201 + полный `secret` в ответе (формат `whsec_<base64url>`); в GET полного секрета нет, возвращается открытый `secretPrefix`; в БД `encryptedSecret` зашифрован AES-256-GCM (проверка locally через `secretVault.decrypt`)
- **Post-conditions**: —

### TC-WHK-026: 6-й эндпоинт → 422
- **Traceability**: FR-606 · Task T040 · **Tier**: Regression · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA (MAX=5: 5 ok, 6 fail)
- **Pre-conditions**: 5 активных эндпоинтов
- **Execution Steps**: POST шестого
- **Expected Result**: 422 `{"error":"webhook_endpoint_limit_reached"}`; деактивировать один → POST снова 201
- **Post-conditions**: вернуть к 2 эндпоинтам

### TC-WHK-027: SSRF-гейт на регистрации
- **Traceability**: FR-606 (STRIDE) · Task T040 · **Tier**: Regression · **Priority**: P0 · **Type**: Security · **Technique**: BVA (запрет-классы)
- **Test Data**: `http://x.com` · `https://localhost/hook` · `https://127.0.0.1/hook` · `https://169.254.169.254/latest/meta-data` · `https://192.168.1.10/hook`
- **Execution Steps**: POST по очереди с каждым URL
- **Expected Result**: все → 422 `{"error":"url_not_allowed"}`; ни один не сохранён; audit без записей WEBHOOK_REGISTERED
- **Post-conditions**: —

### TC-WHK-028: booking.created доставлен подписанным ≤5 с
- **Traceability**: FR-607, NFR-604 · Task T041 · **Tier**: Smoke · **Priority**: P1 · **Type**: Functional · **Technique**: EP
- **Pre-conditions**: TC-WHK-025; эндпоинт подписан на booking.created
- **Execution Steps**: создать бронь; зафиксировать время перехода и приёма на бине
- **Expected Result**: POST ≤5 с; заголовки `X-Undreseller-Signature: t=..., v1=...`; локальная проверка `HMAC_SHA256(secret, t + '.' + rawBody)` совпадает; body `pii=masked` (телефон `[MASKED]`)
- **Post-conditions**: —

### TC-WHK-029: подменённое тело отбраковывается подписью
- **Traceability**: FR-606 · Task T041 · **Tier**: Regression · **Priority**: P1 · **Type**: Security · **Technique**: Error Guessing (tampering)
- **Execution Steps**: перехватить payload бина, изменить `totalMinor`, проверить подпись приёмником
- **Expected Result**: `v1` не совпадает с `HMAC(secret, t + '.' + modifiedBody)` → приёмник обязан reject (документировано); в наших логах delivery `ACCEPTED` — подпись честная от оригинала
- **Post-conditions**: —

### TC-WHK-030: анти-replay ±5 мин
- **Traceability**: FR-606 · Task T041 · **Tier**: Regression · **Priority**: P1 · **Type**: Security · **Technique**: BVA (t+4 ok / t+6 reject)
- **Test Data**: переиграть перехваченный запрос через 6 минут
- **Expected Result**: приёмник reject (timestamp вне окна ±5 мин); документация контракта подтверждает правило
- **Post-conditions**: —

### TC-WHK-031: сбойный эндпоинт — 5 ретраев, потом audit+алерт, circuit breaker на 10 сбоев
- **Traceability**: FR-606, NFR-604 · Task T041 · **Tier**: Regression · **Priority**: P1 · **Type**: Negative · **Technique**: BVA (retries MAX=5, circuit breaker=10)
- **Pre-conditions**: эндпоинт на бин с флагом «всегда 500»
- **Execution Steps**: создать бронь; наблюдать Inngest dashboard и бин; повторить до 10 исчерпанных доставок
- **Expected Result**: ровно 5 попыток с экспоненциальным бэкоффом на событие; `failureCount` растет, `lastDeliveryStatus=FAILED`; audit `WEBHOOK_DELIVERY_FAILED`; алерт в `STAFF_CHAT_ID`; при `failureCount >= 10` эндпоинт переводится в `active = false`, логируется audit `WEBHOOK_DISABLED`
- **Post-conditions**: удалить сбойный эндпоинт

### TC-WHK-032: деактивированный эндпоинт молчит
- **Traceability**: FR-606 · Task T040 · **Tier**: Sanity · **Priority**: P2 · **Type**: Negative · **Technique**: EP (active=false)
- **Execution Steps**: DELETE эндпоинта; создать бронь
- **Expected Result**: 0 POST на бин; event в Inngest записан, fan-out пропустил
- **Post-conditions**: —

### TC-WHK-033: payload по умолчанию маскирует ПДн
- **Traceability**: FR-607 · Task T041 · **Tier**: Sanity · **Priority**: P2 · **Type**: Security · **Technique**: EP (pii=masked default)
- **Execution Steps**: бронь с реальными контактами; проверить бин
- **Expected Result**: `customer.name="[MASKED]"`, `customer.phone="[MASKED]"`; `orderId/serviceTitle/startsAt/totalMinor` в открытом виде
- **Post-conditions**: —

### TC-WHK-034: DNS Rebinding на вызове — socket-level abort (F4)
- **Traceability**: FR-606 (F4, STRIDE Tampering) · Task T041 · **Tier**: Regression · **Priority**: P0 · **Type**: Security · **Technique**: Error Guessing (TOCTOU)
- **Pre-conditions**: эндпоинт `https://rebind-test.example` зарегистрирован (валидный домен на момент регистрации); DNS A-запись домена между регистрацией и вызовом перекинута на `169.254.169.254` (метадата-эндпоинт облака) — TOCTOU-сценарий
- **Execution Steps**: 1) создать бронь → fan-out доставки; 2) наблюдать логи доставки и исходящий трафик
- **Expected Result**: connect-hook (`undici.Agent` socket-level pinning) детектирует запрещённый IP **в момент установки TCP-соединения** → соединение мгновенно сброшено; 0 байт запроса ушло наружу; delivery `FAILED` (network error) → ретраи по общим правилам, каждый — с той же проверкой; audit содержит код `ssrf_blocked`; общедоступные бины из TC-WHK-028 продолжают доставляться (pinning по легитимному IP)
- **Post-conditions**: удалить тестовый эндпоинт

---

### TC-API-034: валидный ключ → 200
- **Traceability**: FR-608 · Task T042 · **Tier**: Smoke · **Priority**: P1 · **Type**: Functional · **Technique**: EP
- **Test Data**: `Authorization: Bearer <PUBLIC_API_KEY из .env>`; `?from=2027-02-01T00:00:00Z&to=2027-02-28T00:00:00Z`
- **Expected Result**: 200 JSON со структурой `{ data: [...], nextCursor: "<base64_compound_cursor>" | null }` (F10); поля согласно контракту; `nextCursor = null` на последней странице
- **Post-conditions**: —

### TC-API-039: пагинация nextCursor — детерминированная выдача страниц
- **Traceability**: FR-608 (F10) · Task T042 · **Tier**: Regression · **Priority**: P1 · **Type**: Boundary · **Technique**: State Transition (cursor chain)
- **Pre-conditions**: seed 250 броней в окне выборки (лимит страницы 100)
- **Test Data**: `?from=2027-02-01T00:00:00Z&to=2027-02-28T00:00:00Z&limit=100`
- **Execution Steps**: 1) GET страница 1 → взять `nextCursor`; 2) GET с `&cursor=<nextCursor>`; 3) повторить до `nextCursor = null`
- **Expected Result**: 3 страницы (100/100/50); union ID по всем страницам без дублей и пропусков; повторный GET страницы 2 с тем же курсором возвращает идентичный набор (детерминизм compound-курсора `createdAt_id`); курсор из чужого окна → 422
- **Post-conditions**: очистить seed

### TC-API-035: без ключа / кривой ключ → 401
- **Traceability**: FR-608 · Task T042 · **Tier**: Regression · **Priority**: P0 · **Type**: Security · **Technique**: BVA (нет ключа / неверный)
- **Test Data**: (a) без заголовка; (b) `Bearer deadbeef`
- **Expected Result**: оба → 401; timing-key difference не выявляется по времени ответа (constant-time); `API_KEY_USED` не пишется при фейле, `401` пишется в лог без ключа
- **Post-conditions**: —

### TC-API-036: rate-limit 30-й ок / 31-й → 429
- **Traceability**: FR-608 · Task T042 · **Tier**: Regression · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA (MIN=30 ok, 31 fail)
- **Execution Steps**: 30 запросов подряд (ключ валиден), затем 31-й
- **Expected Result**: первые 30 → 200 (или 404 данных — но 200 статус HTTP); 31-й → 429 + `Retry-After`
- **Post-conditions**: сброс окна (60 с) или restart

### TC-API-037: окно выборки — граница 31 день
- **Traceability**: FR-608 · Task T042 · **Tier**: Regression · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA (30d ok / 31d+1s fail)
- **Test Data**: (a) from–to = 30 дней; (b) 32 дня
- **Expected Result**: (a) 200; (b) 422 `{"error":"window_too_large"}`
- **Post-conditions**: —

### TC-API-038: write-методы → 405
- **Traceability**: FR-608 · Task T042 · **Tier**: Sanity · **Priority**: P2 · **Type**: Negative · **Technique**: EP (read-only)
- **Execution Steps**: POST/PUT/DELETE на `/api/public/bookings` с валидным ключом
- **Expected Result**: 405 на все три; 0 мутаций в БД
- **Post-conditions**: —

---

## US4: zod@4

### TC-ZOD-039: npm audit 0 High/Critical после exact-pin
- **Traceability**: FR-630 · Task T051 · **Tier**: Smoke · **Priority**: P0 · **Type**: Security · **Technique**: EP (гейт)
- **Execution Steps**: `npm audit --audit-level=high`
- **Expected Result**: exit 0; в отчёте нет GHSA-mrhx-c7xc-m3w5; `package.json` zod `4.x` exact (без `^`)
- **Post-conditions**: —

### TC-ZOD-040: снапшоты 400-форм идентичны до/после
- **Traceability**: FR-632 · Task T050, T052 · **Tier**: Regression · **Priority**: P0 · **Type**: Boundary · **Technique**: Decision Table (формы × схемы)
- **Test Data**: 9 payloads: booking create (валидный, без serviceAddress для OUT_CALL, bad uuid), adminSchemas (item create, settings patch), presign (bad mime, oversized)
- **Execution Steps**: прогнать `tests/unit/api-error-shapes.snapshot.test.ts` на zod 3 (ДО) и 4 (ПОСЛЕ); diff-отчёт
- **Expected Result**: побайтное совпадение fieldErrors по всем 9 кейсам; любое расхождение = блокер merge (дефект Critical)
- **Post-conditions**: —

### TC-ZOD-041: полный сьют зелёный ≥367 тестов
- **Traceability**: FR-631 · Task T051 · **Tier**: Sanity · **Priority**: P1 · **Type**: Functional · **Technique**: EP (гейт)
- **Execution Steps**: `npm run validate && npm test`
- **Expected Result**: tsc 0 ошибок; ≥50 suites / ≥367 tests PASS (падение базовой линии = регресс миграции)
- **Post-conditions**: —

### TC-ZOD-042: форма ошибки OUT_CALL serviceAddress сохранена
- **Traceability**: FR-631, FR-632 (lineage FR-425) · Task T051 · **Tier**: Sanity · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA (точечная проверка z.flattenError-замены)
- **Test Data**: booking create без `serviceAddress`, `fulfillmentMode=OUT_CALL`
- **Expected Result**: HTTP 400, body `{ "serviceAddress": ["serviceAddress is required for OUT_CALL bookings"] }` — точная форма до миграции
- **Post-conditions**: —

### TC-ZOD-043: лицензионный гейт с googleapis
- **Traceability**: NFR-605 · Task T001 · **Tier**: Smoke · **Priority**: P2 · **Type**: Security · **Technique**: EP (гейт)
- **Execution Steps**: `node scripts/verify-licenses.mjs`
- **Expected Result**: PASS; в реестре запись googleapis (Apache-2.0, exact-pin); 0 forbidden-лицензий
- **Post-conditions**: —

### TC-GCAL-043: память инстанса при sync-бёрсте
- **Traceability**: NFR-601 · Task T022 · **Tier**: Extended · **Priority**: P2 · **Type**: Boundary · **Technique**: BVA (насыщение пачек)
- **Pre-conditions**: в GC 120 событий в окне (full-sync)
- **Execution Steps**: запустить sync; замер `process.memoryUsage().rss` до/в пик/после
- **Expected Result**: пик ≤500 MB; evidence `evidence/gcal-memory.md` с тремя замерами; пачки ≤50 в логах
- **Post-conditions**: —

---

## Defect Report Template (для прогонов)

```
[DEF-###] Severity: Blocker|Critical|Major|Minor
Environment: staging/preview + commit SHA
Related TC: TC-XXX-NNN
Steps to Reproduce: ...
Actual vs Expected: ...
Level 1 Evidence: raw log / curl / response JSON / скрин GC
```

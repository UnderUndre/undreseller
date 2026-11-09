# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `005-google-calendar-sync` (директория сохранена для истории тегов; фактический скоуп — **Calendar Feed**)
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001 (`980bc32`) + 002 (`c5f3bf1`) + 003 (`3697b3d`) + 004 (`9efe76a`)
**Статус:** **DRAFT — REVISION 2.1 (2026-11-09; review fixes: F1 rate limit per resource+IP [30/60s] для защиты от бана краулеров Google/Apple, F2 ETag/304 Not Modified HTTP-кэширование, F3 поддержка метода HEAD, F4 RFC 5545 §3.1 Line Folding >75 octets UTF-8 safe, F5 CRLF \r\n инвариант, F6 фоллбэки для пустых имён в SUMMARY, F7 обязательные PRODID и VERSION:2.0, F8 Resources.feedTokenVersion adminOnlyFieldAccess, F9 детальная схема аудита calendar.feed-rotated, F10 полная матрица статусов CONFIRMED/TENTATIVE/CANCELLED)**
**Source of truth по бизнесу:** план v2.6.0 §2.3 (форма интеграции = Calendar Feed; лимит «≤1» расходуется фидом) · **forensic dossier:** рыночная проверка 2026-11-09 (Booksy без нативного пуша; YClients/Altegio — с GC two-way; 100-user cap неверифицированного GCP-проекта)

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Мастер живёт в личном календаре; бронь, которой там нет, = «а во сколько запись?» в Telegram и ручное дублирование. Полный GC API two-way упирается в sensitive-scope OAuth-верификацию на каждое white-label развёртывание (100-user cap lifetime на неверифицированный GCP-проект) — стоимость владения выше вклада при нулевом клиентском сигнале.

### 1.2. Решение

**Односторонний ICS push-фид per-resource** (RFC 5545 `text/calendar; charset=utf-8`): мастер подписывается на webcal-ссылку в ЛЮБОМ календаре (Google/Apple/Outlook) и видит брони своего ресурса. HMAC-токен в URL (канон токенов 003), ноль OAuth/верификаций, ротация = инкремент версии токена. Поддержка HTTP-кэширования (`ETag`, `304 Not Modified`, `Cache-Control`) и метода `HEAD` для бесшовной интеграции с внешними парсерами.

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO GC API / OAUTH:** full two-way (push + freeBusy-импорт) заморожен до L1-сигнала — решено владельцем 2026-11-09, план v2.6.0.
* ❌ **NO YANDEX:** исключён владельцем (нет публичного REST write API; CalDAV — не в этой спеке).
* ❌ **NO PHONE / FULL PII IN FEED:** фид хранится на сторонних серверах (Google et al) — в SUMMARY/DESCRIPTION запрещены телефон и контакты; только имя клиента + услуга + время.
* ❌ **NO BUFFERS IN FEED:** фид показывает услугу (durationMin); служебные буферы 002 — внутренняя кухня.
* ❌ **NO WRITE-BACK:** подписка read-only по определению; встречные правки календаря фид не видит (ограничение формы, документировано в UAT).

---

## 2. User Stories (Prioritized)

### US1 — Feed endpoint, кэширование и HMAC-токен (P0)

`GET /api/calendar/feed/[resourceId]?token=<nonce>` и `HEAD /api/calendar/feed/[resourceId]?token=<nonce>` → `text/calendar; charset=utf-8` (RFC 5545).
- Токен = HMAC-SHA256(PAYLOAD_SECRET, `calendar-feed:v<N>:<resourceId>`) в URL; timing-safe сверка; невалидный/ротированный токен → 403;
- Заголовки ответа: `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: private, max-age=300, must-revalidate`, `ETag: W/"<sha256_hash>"`;
- Условное кэширование: если `If-None-Match` совпадает с текущим ETag → мгновенный ответ `304 Not Modified` с пустым телом;
- Rate limit: ключ `feed:${resourceId}:${ip}`, лимит `30 requests / 60 seconds` (защита от взаимной блокировки разных ресурсов при опросе с общих egress IP краулеров Google/Apple, исключающая ошибку 429 при синхронизации).

**Acceptance**: 0 неавторизованных чтений (403-матрица); ротация инвалидирует старый URL; при неизменных данных повторный запрос отдаёт `304 Not Modified`; валидация через `HEAD` отдаёт 200 с корректными заголовками без тела; endpoint p95 < 50 ms.

### US2 — ICS-тело: брони → VEVENT (P0)

Генерация RFC 5545 `VCALENDAR`:
- Заголовок: `PRODID:-//UnderUndre//undreseller//EN`, `VERSION:2.0`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, `X-WR-CALNAME:<Имя ресурса>`, `REFRESH-INTERVAL;VALUE=DURATION:PT15M`;
- Все строки форматируются строго со строковым окончанием CRLF (`\r\n`);
- Длинные строки складываются по RFC 5545 §3.1 (Line Folding: не более 75 октетов на строку, продолжение через `\r\n ` без распила UTF-8 кодовых точек);
- Полный маппинг статусов:
  - `BOOKED` → `STATUS:CONFIRMED`, `SEQUENCE:0`
  - `HELD`, `PAYMENT_PENDING`, `PENDING_APPROVAL` → `STATUS:TENTATIVE`, `SEQUENCE:0`
  - `RELEASED`, `CANCELLED`, `STAFF_REJECTED` → `STATUS:CANCELLED`, `SEQUENCE:1`
- `UID: booking-<reservationId>@<host>` (стабильный — правки propagate);
- `DTSTAMP`: вычисляется из `updated_at` брони в формате UTC (`YYYYMMDDTHHMMSSZ`), что гарантирует байт-детерминизм тела и стабильность ETag;
- `SUMMARY: <услуга> — <имя клиента>` (с фоллбэками: если услуга не найдена — `'Запись'`, если имя пусто — `'Клиент'`);
- PII-граница: `DESCRIPTION` отсутствует; телефон и email не включаются ни в одно свойство;
- Окно фида: `now − 7 days … now + 90 days`. Пустой ресурс → валидный пустой `VCALENDAR` (без VEVENT) со статусом 200.

**Acceptance**: повторная генерация фида при неизменных бронях даёт 100% байт-детерминированное тело; отмена брони переводит событие в `STATUS:CANCELLED` + `SEQUENCE:1`; парсеры Google/Apple/Outlook валидируют календарь без ошибок синтаксиса.

### US3 — Ротация токена и админ-поверхность (P1)

OWNER в `/admin` (Resources):
- Поле `feedTokenVersion` в `Resources` защищено `access: { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess }`;
- Кнопка «Calendar link» (копирование webcal URL) + «Rotate token» (отзыв ссылки без влияния на существующие брони);
- Ротация вызывает `POST /api/admin/calendar-feed/[resourceId]` (OWNER-only) → инкрементирует `feedTokenVersion`, немедленно инвалидируя старый токен, и записывает аудит `calendar.feed-rotated` с метаданными `{ previousVersion, newVersion }`.

**Acceptance**: rotate → старый URL отдаёт 403, новый отдаёт 200; событие зафиксировано в `audit_events`.

---

## 3. Edge Cases

- **Краулеры Google/Apple опрашивают с одного IP**: разделение бакетов по `feed:${resourceId}:${ip}` с порогом 30/60s предотвращает взаимную блокировку ресурсов при синхронизации.
- **Поддержка валидации по HEAD**: эндпоинт отвечает 200 с валидными MIME/ETag заголовками при запросах HEAD от Google Calendar.
- **Длинные русскоязычные имена и названия услуг**: перенос строк по границе 75 октетов (`\r\n `) с сохранением целостности UTF-8 символов.
- **Пустые/null имена клиента**: безопасный фоллбэк `'Запись — Клиент'` вместо `'null — null'`.
- **Латентность подписчика**: Google/Apple поллит фид по своему расписанию (до ~суток); серверная свежесть обеспечивается ETag и HTTP 304.
- **Несколько ресурсов**: отдельный фид на каждый ресурс; соло-инстанс — один фид.
- **Пустой ресурс** (0 броней): валидный пустой VCALENDAR (без VEVENT) — не 404.
- **Токен скомпрометирован**: ротация версией — мгновенное аннулирование доступа.
- **Часовые пояса**: DTSTART/DTEND строго в UTC (`Z`), часовой пояс отображения выбирается клиентом календаря.

---

## 4. Requirements

### Functional Requirements
- **FR-501 (Feed endpoint & Caching)**: `GET/HEAD /api/calendar/feed/[resourceId]?token=` → RFC 5545 `text/calendar; charset=utf-8`; timing-safe HMAC сверка; rate limit `30/60s` на `feed:${resourceId}:${ip}`; HTTP ETag + `304 Not Modified` при совпадении `If-None-Match`; `Cache-Control: private, max-age=300, must-revalidate`.
- **FR-502 (ICS-тело & RFC 5545)**: `PRODID:-//UnderUndre//undreseller//EN`, `VERSION:2.0`; строгие окончания CRLF (`\r\n`); перенос строк > 75 октетов (Line Folding); VEVENT per бронь в окне `now−7d…now+90d`; UID стабильный; DTSTAMP из `updated_at`; статус-маппинг (`CONFIRMED` / `TENTATIVE` / `CANCELLED`); пустой ресурс → валидный пустой VCALENDAR (200).
- **FR-503 (PII-граница)**: SUMMARY = `<услуга> — <имя>` (с фоллбэками на непустые значения); телефон/email/DESCRIPTION запрещены (grep-тест тела фида); тело не логируется.
- **FR-504 (Ротация)**: владельческая ротация токена per-resource; `Resources.feedTokenVersion` закрыт `adminOnlyFieldAccess`; старый токен → 403 мгновенно; запись в `audit_events` (`calendar.feed-rotated`, `{ previousVersion, newVersion }`).

### Non-Functional Requirements
- **NFR-501 (Regression)**: 142+ старых тестов зелёные; новые ≥12 (403-матрица, ETag/304, HEAD, folding 75 октетов, CRLF, PII-grep, ротация, пустой фид, отмена).
- **NFR-502 (No new deps)**: 0 — ICS-сериализация hand-rolled по RFC 5545 (чистая функция без сторонних библиотек).
- **NFR-503 (Perf)**: p95 фида < 50 ms при ≤2k броней (B-tree индекс 002 `(resource_id, start_time)` уже в схеме); при 304 Not Modified — < 5 ms.
- **NFR-504 (PII в логах)**: дени-лист канон — тело фида не логируется; токен исключён из логов.

## 5. Success Criteria

- **SC-001**: 403-матрица (невалидный/ротированный/чужой) — 0 несанкционированных чтений; `feedTokenVersion` скрыт от публичного REST API.
- **SC-002**: ICS-тело структурно валидно по RFC 5545 (PRODID, CRLF, folding 75 октетов, DTSTAMP детерминизм, ETag/304).
- **SC-003**: grep тела фида — 0 телефонов/email'ов (PII-граница); отсутствие пустых `'null — null'`.
- **SC-004**: ротация мгновенно инвалидирует старый URL и регистрирует аудит; 142+ регрессия зелёная.
- **SC-005**: Google Calendar и Apple Calendar успешно подписываются без ошибок 429 и синтаксических сбоев.

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: Форма интеграции | **ICS push-фид** (односторонний) | Dossier 2026-11-09: OAuth-верификация per deployment + 0 сигналов; Booksy-прецедент |
| Q2: Яндекс | **Исключён** владельцем | Нет публичного REST write API; CalDAV — не в этой спеке |
| Q3: Full GC two-way | **Заморожен до L1-сигнала** (первый клиент) | Возвращается как 005-bis с решённой OAuth-топологией (service account DWD / общий проект) |
| Q4: Что в SUMMARY | `<услуга> — <имя клиента>` (с фоллбэками) | Фид живёт на сторонних серверах — PII-граница FR-503 |
| Q5: Буферы в фиде | **Нет** — только услуга | Буферы — внутренняя кухня availability, мастеру нужны границы услуги |
| Q6: Холды в фиде | Показывать `STATUS:TENTATIVE` | Мастер видит будущую запись до оплаты; отмена → CANCELLED |
| Q7: Rate limiting | `feed:${resourceId}:${ip}`, `30/60s` | Защита от блокировки Googlebot crawler при синхронизации подписок |
| Q8: Кэширование | `ETag`, `304 Not Modified`, `Cache-Control` | Снижение нагрузки на сервер и трафика подписчиков на >95% |

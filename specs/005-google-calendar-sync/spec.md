# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `005-google-calendar-sync` (директория сохранена для истории тегов; фактический скоуп — **Calendar Feed**)
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001 (`980bc32`) + 002 (`c5f3bf1`) + 003 (`3697b3d`) + 004 (`9efe76a`)
**Статус:** **DRAFT — REVISION 2.0 (2026-11-09; re-scope по forensic dossier + решению владельца: full Google Calendar API two-way ЗАМОРОЖЕН до L1-сигнала; Яндекс исключён владельцем; скоуп = односторонний ICS/webcal push-фид per-resource, ноль OAuth; бизнес-план v2.6.0)**
**Source of truth по бизнесу:** план v2.6.0 §2.3 (форма интеграции = Calendar Feed; лимит «≤1» расходуется фидом) · **forensic dossier:** рыночная проверка 2026-11-09 (Booksy без нативного пуша; YClients/Altegio — с GC two-way; 100-user cap неверифицированного GCP-проекта)

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Мастер живёт в личном календаре; бронь, которой там нет, = «а во сколько запись?» в Telegram и ручное дублирование. Полный GC API two-way упирается в sensitive-scope OAuth-верификацию на каждое white-label развёртывание (100-user cap lifetime на неверифицированный GCP-проект) — стоимость владения выше вклада при нулевом клиентском сигнале.

### 1.2. Решение

**Односторонний ICS push-фид per-resource** (RFC 5545 `text/calendar`): мастер подписывается на webcal-ссылку в ЛЮБОМ календаре (Google/Apple/Outlook) и видит брони своего ресурса. HMAC-токен в URL (канон токенов 003), ноль OAuth/верификаций, ротация = перегенерация токена. Гигиенический фактор закрываем самой дешёвой формой.

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO GC API / OAUTH:** full two-way (push + freeBusy-импорт) заморожен до L1-сигнала — решено владельцем 2026-11-09, план v2.6.0.
* ❌ **NO YANDEX:** выплен владельцем (нет публичного REST write API; CalDAV — не в этой спеке).
* ❌ **NO PHONE / FULL PII IN FEED:** фид хранится на сторонних серверах (Google et al) — в SUMMARY/DESCRIPTION запрещены телефон и контакты; имя клиента + услуга + время.
* ❌ **NO BUFFERS IN FEED:** фид показывает услугу (durationMin); служебные буферы 002 — внутренняя кухня.
* ❌ **NO WRITE-BACK:** подписка read-only по определению; встречные правки календаря фид не видит (ограничение формы, документировано в UAT).

---

## 2. User Stories (Prioritized)

### US1 — Feed endpoint + HMAC-токен (P0)

`GET /api/calendar/feed/[resourceId]?token=<nonce>` → `text/calendar; charset=utf-8` (RFC 5545). Токен = HMAC-SHA256(secret, resourceId) в URL; timing-safe сверка; невалидный/чужой токен → 403; ротация токена владельцем в `/admin`. Rate limit канон 002 (10/60s на IP).

**Acceptance**: 0 неавторизованных чтений (403-матрица); ротация инвалидирует старый URL; endpoint p95 < 50 ms (тот же контур, что availability).

### US2 — ICS-тело: брони → VEVENT (P0)

Каждая активная бронь ресурса (BOOKED/HELD/PENDING_APPROVAL/PAYMENT_PENDING) → VEVENT: `UID: booking-<reservationId>@<host>` (стабильный — правки propagate), `DTSTART/DTEND` UTC (`Z`), `DTSTAMP`, `SUMMARY: <услуга> — <имя клиента>`, `STATUS: CONFIRMED`; отмена/релиз → `STATUS:CANCELLED` + `SEQUENCE+1` (канон cancel-флоу 002). Окно фида: now−7d … now+90d. Внешнее busy-импортирование — НЕТ (заморожено с GC API).

**Acceptance**: повторная генерация фида при неизменных бронах — детерминированное тело (кроме DTSTAMP); отмена брони → следующий fetch содержит `STATUS:CANCELLED` ≤ 60 c (серверная правда; латентность подписки — сторона календаря, документирована в UAT).

### US3 — Ротация и админ-поверхность (P1)

OWNER в `/admin` (Resources): кнопка «Calendar link» (copy webcal URL) + «Rotate token» (не деструктив для броней). Ротированный токен → 403 на старом URL мгновенно.

**Acceptance**: rotate → старый URL 403, новый 200; событие в audit_events (`calendar.feed-rotated`).

---

## 3. Edge Cases

- **Латентность подписчика**: Google/Apple поллит фид по своему расписанию (до ~суток) — серверная свежесть ≤60 c, клиентская — не наша труба (документировано в UAT и runbook; мастер может «Refresh» вручную).
- **Несколько ресурсов**: отдельный фид на каждый ресурс; соло-инстанс — один фид.
- **Пустой ресурс** (0 броней): валидный пустой VCALENDAR (без VEVENT) — не 404.
- **HELD/PENDING_APPROVAL в фиде**: `STATUS:TENTATIVE` — мастер видит холд до оплаты; отмена холда → CANCELLED.
- **Токен утёк**: ротация — единственный ответ; перебор бессмыслен (256-bit HMAC).
- **TZ**: DTSTART/DTEND — UTC `Z`; отображение — сторона календаря (канон 002 US3).

## 4. Requirements

### Functional Requirements
- **FR-501 (Feed endpoint)**: `GET /api/calendar/feed/[resourceId]?token=` → RFC 5545 `text/calendar`; timing-safe HMAC; 403-матрица (невалидный/ротированный/чужой ресурс); rate limit 10/60s.
- **FR-502 (ICS-тело)**: VEVENT per активная бронь (UID стабильный, UTC, STATUS CONFIRMED/TENTATIVE/CANCELLED, SEQUENCE инкремент); окно now−7d…now+90d; пустой ресурс → валидный пустой VCALENDAR; детерминированное тело.
- **FR-503 (PII-граница)**: SUMMARY = `<услуга> — <имя>`; телефон/email/примечания запрещены (grep-тест по телу фида).
- **FR-504 (Ротация)**: владельческая ротация токена per-resource; старый токен → 403 мгновенно; audit `calendar.feed-rotated`.

### Non-Functional Requirements
- **NFR-501 (Regression)**: 142+ старых теста зелёные; новые ≥10 (403-матрица, ICS-структура, PII-grep, ротация, пустой фид, отмена).
- **NFR-502 (No new deps)**: 0 — ICS-серилиализация hand-rolled по RFC 5545 (escape-правила тестами; dep ради 4 полей отвергнут).
- **NFR-503 (Perf)**: p95 фида < 50 ms при ≤2k броней (B-tree индекс 002 уже в деле).
- **NFR-504 (PII в логах)**: дени-лист канон — тело фида не логируется.

## 5. Success Criteria

- **SC-001**: 403-матрица (невалидный/ротированный/чужой) — 0 несанкционированных чтений.
- **SC-002**: ICS-тело структурно валидно (RFC 5545: escape, STATUS, SEQUENCE, UID-стабильность) и отражает create/cancel ≤ 60 c серверно.
- **SC-003**: grep тела фида — 0 телефонов/email'ов (PII-граница).
- **SC-004**: ротация мгновенно инвалидирует старый URL; 142+ регрессия зелёная.

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: Форма интеграции | **ICS push-фид** (односторонний) | Dossier 2026-11-09: OAuth-верификация per deployment + 0 сигналов; Booksy-прецедент |
| Q2: Яндекс | **Исключён** владельцем | Нет публичного REST write API; CalDAV — не в этой спеке |
| Q3: Full GC two-way | **Заморожен до L1-сигнала** (первый клиент) | Возвращается как 005-bis с решённой OAuth-топологией (service account DWD / общий проект) |
| Q4: Что в SUMMARY | `<услуга> — <имя клиента>`; телефон/контакты запрещены | Фид живёт на сторонних серверах — PII-граница FR-503 |
| Q5: Буферы в фиде | **Нет** — только услуга | Буферы — внутренняя кухня availability, мастеру нужны границы услуги |
| Q6: Холды в фиде | Показывать `STATUS:TENTATIVE` | Мастер видит будущую запись до оплаты; отмена → CANCELLED |

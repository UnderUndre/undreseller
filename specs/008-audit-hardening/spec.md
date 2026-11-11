# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `008-audit-hardening`
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001 (`980bc32`) + 002 (`c5f3bf1`) + 003 (`3697b3d`) + 004 (`9efe76a`) + 005 (`3a576e4`) + 006 (`a66eed5`) + 007 (`cb7a8ec`)
**Статус:** **DRAFT — REVISION 1.1 (2026-11-12; интегрировано antigravity-ревью `reviews/antigravity.md` verdict HIGH 5H/5M/1L: F1 job-токены → deleteJobOnComplete, F2 refund через FOR UPDATE вместо несуществующего статуса, F3 утечка accessToken в задачах, F4 message_id+chatId резолв карточек, F5 CSP 'unsafe-inline' против RSC-брейка, F6 intentService в плане, F7 миграция+index.ts+enum вне транзакции, F8 boot через instrumentation, F9 контракт clientIpFrom, F10 booking-conflict testid, F11 семантика очистки грида). Source of truth — два аудита: `docs/reviews/code-review-zcode.md` (48 находок: 3 BLOCKER / 11 CRITICAL / 22 WARNING / 12 SUGGESTION) и `docs/reviews/security-audit-zcode.md` (3 High / 17 Medium / 13 Low, verdict HIGH)**
**Source of truth по бизнесу:** план v2.7.1 (undreplans ledger) — **без дельты**: харденинг не меняет ICP/цены/рельсы; это защита денег, инвентаря и данных · **WAIVER:** `business-plan-waiver.md` (техническая спека, прецедент 002/003/004)

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Whole-repo код-ревью и security-аудит (2026-11-12) вскрыли три класса трещин: (1) **схема не деплоится** — единственная миграция не создаёт ни одной доменной таблицы 002–007, свежий инсталл мёртв; (2) **деньги/доступ**: клиентский idempotencyKey отдаёт accessToken чужой брони (OWASP A01), staff-авторизация Telegram — тавтология, Stripe-вебхук подтверждает оплаты при снятом холде, raw-токены брони персистятся в job input; (3) **воронка ломается в трёх тупиках** (OTP-шаг без выхода, тихий сетевой отказ, вечный спиннер после оплаты) плюс e2e release-гейт мёртв против контракта 007. Инфраструктурный хвост: Postgres на 0.0.0.0:5432 с fallback-паролем, security headers отсутствуют, accessToken светится в логах.

### 1.2. Решение

Одна спека-харденинг: устранить полный P0-хвост обоих аудитов (все BLOCKER/CRITICAL/High) + P1-квиквины с денежным/комплаенс-углом, закрыть слепую зону HTTP-уровня route-тестами, оживить e2e release-гейт. Всё остальное (UX-hygiene Medium/Low, feed-токены, password policy, graphql/REST-капы глубже одной строки) — в бэклог, вне этой спеки.

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO REFACTOR BEYOND FIX:** правки только по фиксируемым находкам; попутные «улучшения» запрещены (анти-слоп канон).
* ❌ **NO NEW FSM STATUSES / SCHEMA RENAMES:** схема — additions-only (создание недостающего); ядро 001/002 не трогаем.
* ❌ **NO NEW DEPENDENCIES:** фикс-путь без новых пакетов (NFR канон 007).
* ❌ **NO SCOPE CREEP INTO BACKLOG:** Medium/Low без денежного/комплаенс-угла не входят (перечислены в §4 FR-BK как явный бэклог).
* ❌ **NO SILENT CONTRACT CHANGES:** каждый изменяемый HTTP-ответ фиксируется в error-shapes снапшоте до мерджа.

---

## 2. User Stories (Prioritized)

### US1 — Разворачиваемая схема (P0 — деплой)

Свежий инсталл: `payload migrate` на пустой БД создаёт **все** доменные таблицы (`booking_intents`, `waitlist_entries`, `tg_links`, `telegram_outbox`, `blacklist`, `inbox_events`, `payment_events`, `email_delivery_log`, `payload_jobs` + теневые), все недостающие enum-значения (`refund_requested/refund_failed/refund_rejected/paid_requires_resolution`) и колонки (`reschedule_token_hash`, `reminder_sent_at`, `stripe_payment_intent_ref`). CI-гейт: migrate на пустой БД + smoke-бронь — зелёный до мерджа любого schema-touching PR.

**Acceptance**: пустая БД + migrate + smoke-бронь через публичный API → 201; повторный migrate идемпотентен.

### US2 — Изоляция токенов брони (P0 — OWASP A01)

Клиентский idempotencyKey больше не является ключом к чужим броням: сервер вычисляет ключ сам (детерминированно из верифицированного контекста: email брони + услуга + слот) или отвергает чужой; повтор по ключу возвращает бронь **только** при совпадении email; claim-роут делегирует в сервис (дубль логики удаляется). Различение 404/403/409 на не-токеновых ветках унифицируется там, где оно создаёт oracle.

**Acceptance**: перебор ключей `booking-intent-1..N` от чужого email возвращает 404/403 без accessToken; легитимный повтор того же клиента возвращает его же бронь.

### US3 — Целостность staff-авторизации Telegram (P0 — Elevation of Privilege)

Авторизация колбэка привязывает карточку к чату **серверно** (карточка запоминает свой chat при отправке; колбэк сверяется), отозванный staff и чужие участники группы теряют кнопки (инвалидация клавиатуры при отзыве), `complete` идёт через FSM-канон, клиентский acknowledge гейтится tg_links-привязкой до включения клиентских карточек.

**Acceptance**: колбэк из чата, не соответствующего карточке → auth-denied; callback без действующей карточки → отказ; acknowledge по чужому orderId → отказ.

### US4 — Целостность денежного пути (P0)

Stripe-вебхук: CAS-UPDATE проверяет rowCount; при проигранной гонке — re-read и корректная ветка (late-payment/late-reconfirm), order не трогается до успешного CAS. Raw-токены брони не персистятся в job input: Payload-таска отправки письма конфигурируется с `deleteJobOnComplete` (вход стирается из очереди сразу после отправки — сырые токены живут только в pending-окне джобы; ссылки cancel/reschedule на экране подтверждения остаются валидными, хэши в БД не перезаписываются). Refund-approve: `SELECT … FOR UPDATE` в транзакции (без введения нового статуса — Via Negativa), детерминированный Stripe idempotencyKey, статус пишется сразу в финальное значение; `charge.refunded` сверяет сумму с order (partial ≠ full). Плюс: accessToken заказа не попадает в stdout (логируется только id).

**Acceptance**: гонка webhook×cancel → ровно один корректный исход (confirmed / late-reconfirmed / paid_requires_resolution); гонка refund×refund → один Stripe-вызов, статус верифицируем; partial refund не помечает ордер `refunded`; после отправки письма input джобы пуст; stdout не содержит `accessToken=`.

### US5 — Trust-gate route hardening (P0)

Trust-cookie путь фазы 1 проходит ту же grid-валидацию, что и intent-путь (future/сетка/существование ресурса) — брони вне сетки и на несуществующем ресурсе невозможны; ошибки валидации не дают необработанных 500. Семантика очистки грида разделена: сбой загрузки availability очищает устаревший грид; сбой сабмита брони показывает ошибку, **сохраняя** грид для повторной попытки.

**Acceptance**: бронь с валидным cookie и off-grid `start` → 422; несуществующий resourceId → 422 (не 500); упавший fetch при сабмите → видимое сообщение при живом гриде; упавшая загрузка availability → пустой грид (без слотов чужой даты).

### US6 — Воронка без тупиков (P0 — UX)

(a) Время брони на confirmation/claim-лендинге рендерится в таймзоне клиента. (b) Токены ошибок/успеха проходят контраст 4.5:1 в обеих темах. (c) OTP-шаг имеет выход «Выбрать другой слот» (без потери введённых полей) + autoFocus на код; конфликт слота на OTP-шаге помечается тем же testid, что и на гриде (е2е-контракт). (d) После оплаты ошибочный confirm-order показывает честный экран с повтором, а не вечный спиннер. (e) Страница логина говорит языком клиента и не светит админку.

**Acceptance**: время на confirmation совпадает с локальным для клиента; обе темы проходят 4.5:1 на error/success; каждый тупик флоу имеет видимый выход; SLOT_TAKEN на OTP-шаге различим e2e-селектором; не-аутентифицированный пользователь на /login видит customer-копию.

### US7 — Release gates live (P0 — тесты)

(a) e2e booking переписан под двухфазный контракт 007 (email → OTP-шаг → verify → confirmation; 409 на проигранной гонке вкладок — на OTP-verify). (b) HTTP-уровень: route-тест-матрица booking/waitlist (202/201/400/409/429/Retry-After, intentId-без-otp, honeypot-гварды → 200 + 0 строк, INVALID_JSON) по канону calendar-feed. (c) Trust-cookie route-тесты: happy → 201 без OTP; mismatch/tampered → OTP-путь; Set-Cookie атрибуты. (d) Снапшот error-shapes расширен каталогом 007 (INTENT_CAP/INTENT_DEAD/OTP_INVALID/BLACKLISTED/INTENT_CONSUMED/RATE_LIMITED+retryAfterSec). (e) TTL-ветка opt-in (confirm после 48h → 403) покрыта. Доставка OTP-кода в e2e — через test-транспорт (env-gated), без обхода контракта.

**Acceptance**: `test:e2e` зелёный на HEAD; ≥15 новых HTTP-тестов; error-shapes снапшот ловит переименование кода.

### US8 — Инфраструктурный харденинг (P1)

(a) Postgres не публикует порт наружу (app-сеть compose / 127.0.0.1), пароль без fallback-дефолта (fail-closed как PAYLOAD_SECRET). (b) Security headers: статическая CSP с `'unsafe-inline'` для скриптов/стилей (совместимая с App Router-гидрацией и Payload-админкой — без per-request nonce), X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy strict-origin-when-cross-origin, HSTS, `X-Powered-By` off. (c) Определение IP fail-closed: контракт возвращает null при недостоверной цепочке; роуты при null получают отказ лимита (не общий bucket); CF-заголовок доверяется только при фактическом Cloudflare. (d) Single-instance guard вызывается на boot через `instrumentation.ts` (не на уровне модуля — билд не должен падать). (e) `/api/availability` — rate limit + короткий кэш (serviceId+date → слоты, 15–30с). (f) GraphQL disabled в prod (REST-канон остаётся). (g) Секреты/PII не логируются: accessToken-лог в find-order удалён, debug-остатки и сырые webhook-объекты переведены на структурный логгер без чувствительных полей.

**Acceptance**: снаружи 5432 не отвечает; ответ storefront содержит все заголовки; запрос с поддельным XFF напрямую на origin получает отказ лимита; GraphQL в prod → 404/выключен; `stdout` не содержит токенов заказов и сырых Telegram-апдейтов.

### US9 — Комплаенс-гигиена (P1)

(a) GDPR/152-ФЗ retention: терминальные orders и их брони старше 90 дней анонимизируются (email/имя/телефон → маркер удаления; audit-история сохраняется); purge расширяется на orders+slot_reservations. (b) JSON-LD на product-страницах экранирует `<` (stored XSS из admin-полей закрыт).

**Acceptance**: терминальная бронь 91-го дня не содержит PII клиента в читаемом виде; injected `</script>` в title товара не исполняется.

---

## 3. Edge Cases

- **Migrate на БД с частично созданной схемой** (dev-push vs fresh): идемпотентность шагов (IF NOT EXISTS-семантика), миграция не роняет повторный прогон.
- **Повтор брони с серверным ключом при разном email** (клиент сменил email в форме): ключ включает email → это новая бронь, не чужая выдача.
- **Вебхук vs cancel vs sweep одновременно**: re-read после 0-row CAS различает RELEASED (late-payment ветка) и всё ещё HELD (retry CAS) — ни одно состояние не теряется.
- **Job-генерация линков при ретрае джобы**: повторный прогон не выдаёт вторые линки (генерация только если письмо фактически не ушло / hash пуст).
- **Trust-cookie + off-grid слот одновременно**: честный 422 без отправки OTP и без создания интента.
- **Confirm-order retry при двойном нажатии**: идемпотентность по paymentIntent (повтор не создаёт вторую бронь).
- **Кэш availability при изменении расписания**: TTL ≤ 30с — устаревший слот ловится существующим SLOT_TAKEN-контуром.
- **Анонимизация при активной брони**: purge затрагивает только терминальные записи; активные брони не анонимизируются.

## 4. Requirements

### Functional Requirements
- **FR-801 (Deployable schema, US1)**: полный fresh-migrate + CI-гейт smoke.
- **FR-802 (Token isolation, US2)**: серверная детерминация idempotencyKey; отказ выдачи accessToken по чужому контексту; claim-роут делегирует сервису.
- **FR-803 (Staff authz, US3)**: серверная привязка карточка↔чат, инвалидация при отзыве, FSM-канон для complete, tg_links-гейт acknowledge.
- **FR-804 (Money path, US4)**: webhook CAS + re-read; job input стирается после отправки (`deleteJobOnComplete`); refund через `FOR UPDATE` + детерминированный Stripe idempotencyKey БЕЗ новых статусов; charge.refunded amount-сверка; accessToken не в логах.
- **FR-805 (Trust route, US5)**: grid-валидация trust-cookie пути; семантика: сбой availability → пустой грид, сбой submit → ошибка при живом гриде.
- **FR-806 (Funnel UX, US6)**: локальное время, контраст 4.5:1, OTP-выход (+ testid конфликта на OTP-шаге), honest confirm-order error, customer login copy.
- **FR-807 (Gates, US7)**: e2e под контракт 007; route-тест-матрица ≥15; trust-cookie route-тесты; error-shapes снапшот + каталог 007; TTL-ветка opt-in.
- **FR-808 (Infra, US8)**: закрытый Postgres, CSP `'unsafe-inline'` + остальные headers, контракт `clientIpFrom → string | null` с отказом лимита при null, boot-guard через instrumentation, availability RL+кэш, graphql off в prod, секреты/PII не в stdout.
- **FR-809 (Compliance, US9)**: анонимизация терминальных PII >90д; JSON-LD escape.
- **FR-810 (Migration mechanics, US1 — antigravity F7)**: миграция регистрируется в миграционном индексе; валидный down-метод; добавление enum-значений выполняется в отдельном от использования шаге (Postgres-квирк `unsafe use of new value`).
- **FR-BK (Backlog, явный)**: вне спеки — F-BE-07..16 (кроме вошедших в US4/US5), F-UX-07..20, SEC-A-04/05→частично/09/10/11/13/14/15, SEC-B-04/06/07(частично)/10..18, F-TQ-06..12 (кроме F-TQ-06 в US7). Бэклог — кандидат в 009-ux-hygiene.

### Non-Functional Requirements
- **NFR-801 (Regression)**: все 186+ существующих int-тестов зелёные; суммарный новый тест-хвост ≥25 (route-матрица + e2e-контракт + снапшот).
- **NFR-802 (No new deps)**: 0 новых пакетов.
- **NFR-803 (Fresh deploy)**: пустая БД → migrate → smoke-бронь ≤ 5 минут; повторный migrate — 0 ошибок.
- **NFR-804 (Security re-audit)**: повторный аудит фиксированных зон — 0 BLOCKER/CRITICAL/High в этих зонах; error-shapes снапшот расширен до мержа.
- **NFR-805 (PII)**: анонимизация не ломает audit-историю; читаемых PII в терминальных записях >90д — ноль.

## 5. Success Criteria

- **SC-001**: fresh-deploy сценарий (пустая БД → migrate → smoke-бронь) проходит end-to-end ≤5 минут — ноль ручных правок схемы.
- **SC-002**: атака перебором idempotencyKey возвращает 0 accessToken чужих броней (route-тест доказывает).
- **SC-003**: форвард staff-карточки в чужой чат даёт auth-denied на все действия (тест доказывает).
- **SC-004**: webhook-гонка с cancel не создаёт состояний вне FSM (STM-тест доказывает).
- **SC-005**: `test:e2e` зелёный; полный гейт (validate/lint/int/build/e2e) — 0 exit.
- **SC-006**: снаружи 5432 недоступен; storefront отдаёт полный набор security headers.
- **SC-007**: терминальная запись >90д не содержит читаемых PII; `</script>` в title товара не исполняется.

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: Объём спеки | P0 целиком + P1-квиквины (деньги/комплаенс/инфра-строки); остальное — явный бэклог FR-BK | одна спека-харденинг против двух; бэклог не теряется |
| Q2: Горизонт GDPR-анонимизации | 90 дней (канон tg_links/booking_intents из 004/007) | единый retention-канон репо |
| Q3: Доставка OTP в e2e | test-транспорт через env-gate (без обхода прод-контракта) | e2e не должен ломать HMAC-канон; транспорт гейтится окружением |

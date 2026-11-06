# SpecKit Review: 001-reinit-from-payload-ecommerce-template

**Reviewer**: antigravity  
**Reviewed at**: 2026-11-06T13:30:00Z  
**Commit**: 682c4e1a377cabf5de59b6d2a82980376a48fbb9 (working tree uncommitted)  
**Artifacts reviewed**: spec.md (rev 1.1), plan.md, research.md (D1–D7), tasks.md (11 задач), requirements-audit.md (PASS), qa/ (preliminary-rtm, rtm-matrix, test-cases 22 TC, uat-scenarios, regression-suite), reviews/zcode.md (self-review PASS), undreseller-legacy/specs/ (001–007), undreplans/docs/projects/undreseller/undreseller-business-plan.md (v2.5.0)

## Summary

Пакет реинициализации `001-reinit-from-payload-ecommerce-template` сделан добротно и трезво: границы скоупа (WRAP-атомарность, no bots, no second adapter) выдержаны строго, бизнес-план v2.5.0 синхронизирован, а наследие 436 тестов легаси разложено по полочкам. 
Однако внешний аудит вскрыл два скрытых «засора в трубах» высокой критичности (HIGH):
1. Зачистка роли `admin` в задаче T030 ограничена только хелперами `src/access/*`, в то время как в кодовой базе шаблона живые ссылки на `'admin'` сидят в `tests/e2e/frontend.e2e.spec.ts:394` (ломает E2E-тест при валидации), `src/components/AdminBar/index.tsx:39` (скрывает AdminBar от OWNER) и `src/app/(app)/next/seed/route.ts:17` (ломает сидинг).
2. Нарушена последовательность фаз изоляции БД: переключение на изолированную `undreseller_test` запланировано только в T040 (Phase 3), тогда как новые тесты FSM и инвариантов запускаются уже в T031/T033 (Phase 2), что неминуемо приведет к прогону тестов по живой dev-БД во время промежуточных коммитов Phase 2.

Плюс выявлены средние риски: отсутствие коллекционного access control на скелете `SlotReservations` (дыра для неавторизованного CRUD через REST/GraphQL API) и возможность невалидированной мутации FSM-статусов через выпадающий список в Payload Admin UI.

Реализация должна быть приостановлена до внесения этих поправок в `spec.md`/`tasks.md` (или явного override-gate).

---

## Findings

| ID | Severity | Area | Finding | Recommendation |
| --- | --- | --- | --- | --- |
| F1 | HIGH | Auth & E2E Wiring | T030 заменяет `'admin'` на `'OWNER'` только в `src/access/*`. Вне этого каталога остаются критические жесткие привязки к строке `'admin'`: (1) `tests/e2e/frontend.e2e.spec.ts:394` передает `data.roles = ['admin']` в POST `/api/users`, что вызовет ошибку валидации enum и завалит E2E checkout-сьют в T050; (2) `src/components/AdminBar/index.tsx:39` проверяет `user?.roles?.includes('admin')`, из-за чего панель администратора не отобразится владельцу магазина (`OWNER`); (3) `src/app/(app)/next/seed/route.ts:17` проверяет `checkRole(['admin'], user)`, блокируя сид-эндпоинт для `OWNER`. | Расширить скоуп T030 на тотальный sweep по репозиторию: обновить `frontend.e2e.spec.ts`, заменить проверку в `AdminBar` на `hasMinimumRole(user?.roles, 'OWNER')`, обновить `seed/route.ts`. |
| F2 | HIGH | Test Architecture & Isolation Sequence | В `plan.md` декларируется "Baseline-first" и "Каждый коммит зелёный: pnpm validate && pnpm test:int минимум". Но создание `test.env` и переключение на изолированную `undreseller_test` запланировано в **T040 (Phase 3)**, тогда как новые сьюты `tests/int/booking-fsm.int.spec.ts` и `tests/int/payments-invariants.int.spec.ts` внедряются в **T031 и T033 (Phase 2)**. При прогоне промежуточных коммитов Phase 2 тест `tests/int/api.int.spec.ts` будет выполняться против живой базы `DATABASE_URL` из `.env`, мутируя dev-данные. | Перенести настройку `test.env` и `vitest.setup.ts` dotenv-override из T040 (Phase 3) в **Phase 0/1 (T011 или перед T030)**, чтобы ВСЕ коммиты Phase 2 изначально шли в изолированную тестовую БД. |
| F3 | MEDIUM | Security / Attack Surface | В `spec.md` US5b, `research.md` D3 и `tasks.md` T032 не специфицирован блок `access` для коллекции `SlotReservations`. В Payload CMS коллекция без явного `access` по умолчанию оставляет эндпоинты открытыми для чтения и записи. Это создает неавторизованную поверхность CRUD через REST (`/api/slot-reservations`) и GraphQL. | В T032 явно задать `access` для `SlotReservations`: `read: adminOrSelf` (или `hasMinimumRole(roles, 'OWNER')`), `create/update/delete: adminOnly` (только `OWNER`). Fail-closed защита скелета до появления публичного букинг-API в 002. |
| F4 | MEDIUM | Data Integrity / FSM Bypass | `SlotReservations` в T032 объявляет поле `status` как обычный `select` со всеми DB-статусами (`HELD, BOOKED, ...`). В админ-панели Payload оператор или владелец сможет руками в выпадающем списке перевести статус из `HELD` напрямую в `BOOKED` или `RELEASED` в обход pure FSM kernel, без проверки TTL, freeze и late-payment логики. В легаси транзакционные сущности были защищены от прямого CRUD. | В T032 пометить поле `status` как `admin: { readOnly: true }` (или заблокировать update через access-функцию поля), зафиксировав в архитектуре, что смена статусов допустима только через сервисный доменный слой (спека 002+). |
| F5 | MEDIUM | Test Flakiness / DDL Race | Vitest 4 выполняет тестовые файлы параллельно. При одновременном старте `api.int.spec.ts`, `access-roles.int.spec.ts` и др. против свежесозданной пустой базы `undreseller_test`, несколько воркеров одновременно вызовут `getPayload()` и запустят `pushDevSchema`. В PostgreSQL параллельный DDL приводит к intermittent ошибкам `tuple concurrently updated` или `deadlock detected`. | В `vitest.config.mts` явно зафиксировать последовательное выполнение integration-тестов (`fileParallelism: false` или `maxConcurrency: 1`), либо вынести DDL-бутстрап в глобальный setup-хук. |
| F6 | LOW | Typing & Schema Drift | В `research.md` D5 сигнатура инварианта берется из легаси: `assertProviderAmountMatch({ provider, amountMinor, currency, order })` с ожиданием `order.totalMinor`. В схеме Payload Ecommerce (`payload-types.ts`) у `Order` и `Transaction` сумма хранится в поле `amount`, а не `totalMinor`. Если типизация будет скопирована 1:1 из легаси, вызовы с объектами Payload Order выбросят type error или runtime undefined. | В `src/lib/payments/invariants.ts` принимать плоский объект `{ amountMinor: number, currency: string, starsPrice?: number }` или поддерживать полиморфный `order.amount ?? order.totalMinor`. |
| F7 | LOW | E2E Harness Fragility | Хелпер `seedTestUser()` в `tests/helpers/seedUser.ts` создает `testUser` без указания `roles: ['OWNER']`, полагаясь на хук `ensureFirstUserIsAdmin`. Если в тестовой БД уже существует хоть один пользователь (например, от предыдущих тестов или сида), хук не сработает, пользователь получит дефолтную роль `customer`, и тест `admin.e2e.spec.ts` упадет с 403 на шаге `can navigate to dashboard`. | В `seedTestUser()` явно передавать `roles: ['OWNER']` с флагом `overrideAccess: true`. |

---

## Commercial / business plan notes

- **Plans loaded**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.5.0 (Payload Rebaseline от 06.11.2026).
- **Focus laws / SKU floors checked**: Лестница тарифов ($4,900 / $6,800 / $8,900 / $349) и фиксированный скоуп (Scope Knife: 3 роли, 1 сквозной процесс, 1 интеграция Google Calendar, провайдер-нейтральные платежи) полностью соблюдены. Пакет 001 строго ограничен «фундаментом и скелетом» (WRAP-атомарность).
- **Drift**: Конфликт технологических инвариантов разрешен: дельта §1.4 спеки корректно внесена владельцем в §2.5 бизнес-плана v2.5.0. Коммерческий гейт SC-007 закрыт без замечаний.

---

## Alternative approaches considered

- **Вынос чистых тестов (FSM и payments-invariants) в отдельный unit-раннер**:
  Сейчас и FSM-порт, и инварианты классифицированы как `.int.spec.ts` и гоняются через jsdom-раннер с загрузкой окружения. Альтернатива — завести полноценный unit-контур (`tests/unit/**/*.spec.ts` на node environment без jsdom и без подключения к Postgres), что снизит время прогона до <1 с. Автор выбрал сохранение единого скрипта `pnpm test:int` ради соблюдения NFR-101 (no new deps/scripts churn). Решение принято, но зафиксировано как точка роста для 002+.
- **Использование готовых Payload custom endpoints для FSM**:
  Вместо скелета коллекции без методов можно было сразу заложить `endpoints: [...]` на коллекции `SlotReservations` под команды FSM. Однако решение отложить это на 002 признано правильным — соблюдает жесткие рамки US5.

---

---

## Resolution round (2026-11-06, интегрировано автором в спеку rev 1.2)

| ID | Статус | Где закрыто |
| --- | --- | --- |
| F1 | RESOLVED | `spec.md` US4/FR-104, `plan.md` Source, `tasks.md` T030, `research.md` D1: тотальный sweep роли `admin` охватывает `AdminBar`, `seed/route.ts`, `tests/e2e/frontend.e2e.spec.ts:394` (`data.roles = ['OWNER']`) и `seedUser.ts`. |
| F2 | RESOLVED | `spec.md` US7/FR-108, `plan.md`, `tasks.md`: тест-изоляция вынесена в **Phase 1 (T015)** до написания тестов домена Phase 2. `undreseller_test` изолирует все промежуточные коммиты. |
| F3 | RESOLVED | `spec.md` US5b/FR-106, `research.md` D3, `tasks.md` T032: коллекция `SlotReservations` получила fail-closed access control (`read/create/update/delete: adminOnly` — только `OWNER`). |
| F4 | RESOLVED | `spec.md` US5b/FR-106, `research.md` D2/D3, `tasks.md` T032: поле `status` в `SlotReservations` помечено `admin: { readOnly: true }` — ручная смена статусов в админке заблокирована. |
| F5 | RESOLVED | `plan.md` Technical Context, `research.md` D4, `tasks.md` T015: в `vitest.config.mts` зафиксирован `fileParallelism: false` против параллельных DDL гонок на `pushDevSchema`. |
| F6 | RESOLVED | `spec.md` US6/FR-107, `research.md` D5, `tasks.md` T033: `assertProviderAmountMatch` принимает плоский интерфейс с полиморфной поддержкой как Payload `Order.amount`, так и `totalMinor`. |
| F7 | RESOLVED | `tasks.md` T030, `qa/test-cases.md` TC-001-007: в `tests/helpers/seedUser.ts` зафиксирована явная передача `roles: ['OWNER']` с `overrideAccess: true`. |

---

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-11-06T13:45:00Z
commit: 682c4e1a377cabf5de59b6d2a82980376a48fbb9
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
gate_note: All F1–F7 findings resolved in spec rev 1.2, plan.md, tasks.md (12 tasks), research.md D1–D5, and qa/test-cases.md. External review PASS requirement for Principle VI is met.
```

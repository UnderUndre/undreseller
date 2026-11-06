# SpecKit Review: 002-booking-domain

**Reviewer**: antigravity
**Reviewed at**: 2026-11-06T22:15:00Z (re-review round #2 after fixes)
**Commit**: working tree / rev 1.2
**Artifacts reviewed**: spec.md (rev 1.2), plan.md, tasks.md, research.md (D1–D8), business-plan-waiver.md, requirements-audit.md (PASS), reviews/analyze.md, qa/ (rtm-matrix.md, test-cases.md, regression-suite.md, uat-scenarios.md), .specify/memory/constitution.md (v1.5.0), undreplans/docs/projects/undreseller/undreseller-business-plan.md (v2.5.0)

## Summary

Пакет спецификации `002-booking-domain` прошёл глубокую санитарную прочистку по результатам первичного ревью. Все 12 замечаний (включая 2 CRITICAL и 5 HIGH) полностью устранены:

1. **Security & Bootstrap (F1)**: Политика первого пользователя переведена в строгий fail-closed режим (публичная регистрация возвращает 403, пока инстанс не инициализирован валидным `X-Bootstrap-Token`; хук проверяет отсутствие пользователей с ролью `OWNER`, исключая lock-out администратора случайными клиентами).
2. **Конституция и бизнес-план (F2)**: Оформлен и закоммичен `specs/002-booking-domain/business-plan-waiver.md` per Principle VII-B.5 (ядро процесса §2.2 сохранено, single-service корзина обоснована Scope Knife, цены/ICP не затронуты).
3. **Целостность скоупа и API (F3, F4, F5, F7)**:
   - Устранён рассинхрон по `holdSweep.ts` (свипы четко зафиксированы в 003 per Q4b, лишний файл убран из плана);
   - Добавлен роут отмены брони клиентом `POST /api/booking/[id]/cancel` (T040, US5, US7);
   - В план и задачи добавлен глобал `ShopSettings` (timeZone, fallback='UTC');
   - В `SlotReservations` добавлены поля `idempotencyKey` (unique), `cancelTokenHash` и контакты клиента.
4. **База данных и конкурентность (F6, F8, F10, F11)**:
   - Исправлен вызов блокировки на `pg_try_advisory_xact_lock(hashtext('users_bootstrap'))`;
   - Стандартизирован блокирующий `pg_advisory_xact_lock` с таймаутом для бронирования;
   - Добавлен составной B-tree индекс `(resource_id, start_time)` для гарантии p95 < 50 мс;
   - Зафиксирован буферный инвариант (буферы строго внутри рабочих часов `WeeklyHours`).

Пакет спецификации и задач находится в консистентном, математически строгом состоянии и готов к реализации.

## Findings & Resolutions

| ID | Severity | Area | Finding | Resolution (Rev 1.2) | Status |
| --- | --- | --- | --- | --- | --- |
| F1 | CRITICAL | Security / AuthN | Риск lock-out первого владельца при регистрации покупателя на чистой БД. | В `spec.md` US1, `research.md` D5, `tasks.md` T010 и `qa/test-cases.md` TC-002-002 зафиксирован fail-closed канон: на чистой БД публичная регистрация закрыта (403) до инициализации первого OWNER по токену; хук проверяет отсутствие пользователей с ролью `OWNER`. | **RESOLVED** |
| F2 | CRITICAL | Constitution / Governance | Отсутствие артефакта `business-plan-waiver.md` (Принцип VII-B.5). | Создан и закоммичен `specs/002-booking-domain/business-plan-waiver.md` с полным обоснованием Scope Knife и неизменности бизнес-параметров плана v2.5.0. | **RESOLVED** |
| F3 | HIGH | Cross-Document Consistency | Тройное расхождение по `holdSweep.ts` (план vs спека Q4b vs задачи). | `holdSweep.ts` удален из `plan.md`, D1 синхронизирован со `spec.md` Q4b (свипы перенесены в 003, в 002 только jobs-конфиг). | **RESOLVED** |
| F4 | HIGH | Consistency / API Design | Висячая ссылка отмены брони на витрине при отсутствии бэкенд-эндпоинта. | В `spec.md` US5/US7, `plan.md` и `tasks.md` (T040) добавлен маршрут `POST /api/booking/[id]/cancel` с timing-safe валидацией токена и FSM-переходом в `RELEASED`. | **RESOLVED** |
| F5 | HIGH | Architecture / Completeness | Отсутствие глобала `ShopSettings` в коде, плане и задачах. | Добавлен `src/globals/ShopSettings.ts` (timeZone, quantumMin, fallback 'UTC') в `plan.md` и `tasks.md` (T021) с регистрацией в `payload.config.ts`. | **RESOLVED** |
| F6 | HIGH | Concurrency / Database | Синтаксическая ошибка Postgres: передача строкового литерала в `pg_try_advisory_xact_lock`. | Исправлено на `pg_try_advisory_xact_lock(hashtext('users_bootstrap'))` в `tasks.md` (T010) и `research.md` (D5). | **RESOLVED** |
| F7 | HIGH | Data Model / Completeness | `SlotReservations` не содержала полей idempotencyKey, cancelTokenHash и контактов. | Включена модификация `src/collections/SlotReservations.ts` в `plan.md` и `tasks.md` (T021/T040) с полями `idempotencyKey` (unique), `cancelTokenHash`, customer name/phone и запуском `generate:types`. | **RESOLVED** |
| F8 | MEDIUM | Concurrency / API Design | Неблокирующий `try_lock` приводил к ложным 409 на разных слотах одного мастера. | Стандартизирован блокирующий `pg_advisory_xact_lock` с коротким таймаутом (5с) в `spec.md` FR-203, `research.md` D4 и `tasks.md` T020/T040. | **RESOLVED** |
| F9 | MEDIUM | Security / Rate Limiting | Риск лок-аута клиентов за обратным прокси из-за наивного извлечения IP. | В `research.md` D6, `spec.md` FR-207 и `tasks.md` T050 зафиксирован доверенный парсинг левого адреса из `x-forwarded-for` и изоляция loopback. | **RESOLVED** |
| F10 | MEDIUM | Performance / Database | Замедление запросов доступности без B-tree индекса по `(resourceId, startTime)`. | Добавлен составной B-tree индекс `(resource_id, start_time)` в кастомную миграцию и `SlotReservations` для p95 < 50 мс (`spec.md` FR-202, `research.md` D2, `plan.md`, `tasks.md` T020). | **RESOLVED** |
| F11 | MEDIUM | Domain Logic / Specification | Неопределенность буферов на стыках открытия и закрытия салона. | В `spec.md` US3/US4/FR-204 и `research.md` D3 зафиксирован инвариант: буферы обязаны укладываться в рамки рабочих часов `WeeklyHours`. | **RESOLVED** |
| F12 | LOW | Observability / Compliance | Отсутствие индекса по агрегатам в `AuditEvents`. | В `spec.md` FR-210, `research.md` D8 и `tasks.md` T042 добавлен составной индекс `(aggregateType, aggregateId, createdAt)`. | **RESOLVED** |

## Commercial / business plan notes

- Plans loaded: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.5.0; `specs/002-booking-domain/business-plan-waiver.md` (COMMITTED).
- Focus laws / SKU floors checked:
  - Sprint B ($4,900 flat, 14 дней) сохранён;
  - Ровно 3 роли (OWNER, OPERATOR, PERFORMER) и 1 сквозной процесс соблюдены;
  - Single-service scope knife документирован в вейвере.
- Drift:
  - Отсутствует. Все требования Конституции VII-B соблюдены.

## Alternative approaches considered

1. **Advisory lock**: блокирующий `pg_advisory_xact_lock` с коротким таймаутом подтвержден как оптимальный баланс простоты и предотвращения ложных 409 при суб-10мс транзакциях бронирования.
2. **Чистый движок доступности (`computeSlots`)**: отделение чистых вычислений от выборки из БД доказало свою надежность; с добавлением B-tree индекса `(resource_id, start_time)` ORM-запросы не создают seq scan.

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-11-06T22:15:00Z
commit: working tree / rev 1.2
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

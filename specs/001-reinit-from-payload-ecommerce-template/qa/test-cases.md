# Test Cases: 001-reinit-from-payload-ecommerce-template (ISO/IEC/IEEE 29119-3)

**Generated**: 2026-11-06 (`/speckit.test-design`) · **Slug-префикс**: TC-001-NNN · **Всего TC**: 22
**Соотношение Positive / Negative+Boundary**: 9 / 13

**Общие предусловия**: `pnpm ii` выполнен; Postgres 16 из docker-compose; тест-БД `undreseller_test` создана (bootstrap: `createdb undreseller_test`); int-тесты идут через `test.env` (research D4).

---

## US1: Baseline (FR-101)

### TC-001-001: build/lint/typecheck зелёные
- **Traceability**: FR-101 · Task T010 · **Tier**: Regression · **Priority**: P0 · **Type**: Functional · **Technique**: EP
- **Execution Steps**: `pnpm build && pnpm lint && pnpm validate`
- **Expected Result**: 0 ошибок; `src/payload-types.ts` в репо синхронен конфигу

### TC-001-002: int smoke зелёный
- **Execution Steps**: `pnpm test:int`
- **Expected Result**: шаблонный smoke (`payload.find users`) PASS на тест-БД

### TC-001-003: e2e checkout зелёный (env-прereqs)
- **Execution Steps**: Stripe test-keys в `.env` + `pnpm stripe-webhooks` + `pnpm test:e2e`
- **Expected Result**: admin.e2e + frontend.e2e (вариант → корзина → гостевой checkout → order) PASS; env-прereqs записаны в `evidence/baseline.md`

## US2: Governance (FR-102)

### TC-001-004: конституция адаптирована
- **Traceability**: FR-102 · Task T020 · **Tier**: Regression · **Priority**: P0 · **Type**: Functional · **Technique**: EP
- **Expected Result**: `.specify/memory/constitution.md` присутствует; гейты ссылаются на pnpm/vitest/playwright; NON-NEGOTIABLE принципы VI/X/VII текстуально соответствуют легаси; grep `npm run validate|npm test` → 0 вхождений в гейт-секциях

### TC-001-005: snapshot-скрипт idempotent
- **Traceability**: FR-102 · Task T022 · **Tier**: Sanity · **Priority**: P1 · **Type**: Functional · **Technique**: Error Guessing
- **Execution Steps**: `bash .specify/scripts/bash/snapshot-stage.sh spec 001-reinit-from-payload-ecommerce-template` ×2
- **Expected Result**: первый вызов создаёт `spec/001-…/v1`, повторный возвращает существующий тег без дубля

### TC-001-006 (перенумерован): port map полнота — см. US3 блок ниже

## US3: Port map (FR-103)

### TC-001-006: 11/11 доменов классифицированы
- **Traceability**: FR-103 · Task T041 · **Tier**: Smoke · **Priority**: P2 · **Type**: Functional · **Technique**: Checklist
- **Expected Result**: `legacy-port-map.md` содержит все 11 доменов Annex A, каждый с классом/целевой спекой/риском; dead weight помечен obsolete

## US4: Roles (FR-104)

### TC-001-007: OWNER имеет полный доступ к /admin
- **Traceability**: FR-104 · Task T030 · **Tier**: Regression · **Priority**: P0 · **Type**: Functional · **Technique**: EP
- **Execution Steps**: юзер roles=['OWNER'] → admin-роуты, Payload admin UI и AdminBar на витрине (`canSeeAdmin = true`, F1); `seedTestUser` создает явного OWNER (`overrideAccess: true`, F7)
- **Expected Result**: доступ разрешён, AdminBar виден на витрине

### TC-001-008: PERFORMER не пускают в /admin
- **Priority**: P0 · **Type**: Negative
- **Expected Result**: admin-root access → false; UI-редирект на login

### TC-001-009: OPERATOR — app-level без /admin
- **Expected Result**: OPERATOR не имеет admin-доступа (001); storefront работает

### TC-001-010: customer — field-level скрытие
- **Traceability**: FR-104 · **Priority**: P1 · **Type**: Negative
- **Expected Result**: adminOnly-поля скрыты для customer (регрессия шаблона = 0)

### TC-001-011: первый юзер = OWNER (BVA: 0 юзеров / 1 юзер / 2 юзера)
- **Traceability**: FR-104 · Task T030 · **Priority**: P0 · **Type**: Boundary · **Technique**: BVA
- **Expected Result**: на пустой БД хук назначает `['OWNER']`; при существующем OWNER хук не срабатывает; роль `admin` в options отсутствует

### TC-001-012: комбинированные наборы ролей (max-иерархия)
- **Traceability**: FR-104 · Task T040 · **Priority**: P1 · **Type**: Boundary · **Technique**: Decision Table (упрощённая)
- **Test Data**: `['PERFORMER','customer']`, `['OPERATOR','PERFORMER']`, `['OWNER','customer']`
- **Expected Result**: `hasMinimumRole` = max(rank): первый набор → PERFORMER-права, второй → OPERATOR, третий → OWNER

## US5: FSM + SlotReservations (FR-105, FR-106)

### TC-001-013: FSM-сьют легаси зелёный 1:1
- **Traceability**: FR-105 · Task T031 · **Tier**: Regression · **Priority**: P0 · **Type**: Functional · **Technique**: State Transition (наследует легаси-эталон)
- **Expected Result**: все сценарии `booking-fsm` + `confirming-freeze` легаси PASS на `src/lib/kernel/bookingFsm.ts` без правок семантики (two-track, TTL 15m, freeze+ceiling, late-payment re-confirm/re-booked)

### TC-001-014: SlotReservations валидация + types + fail-closed access
- **Traceability**: FR-106 · Task T032, T034 · **Tier**: Sanity · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA
- **Expected Result**: endTime ≤ startTime → отказ; scheduleVersion = 0 → отказ; status readOnly в админке (F4); гостевой/неавторизованный запрос к `/api/slot-reservations` получает 401/403 (fail-closed access `adminOnly`, F3); `payload generate:types` → 0 diff после запуска; admin-CRUD черновика брони работает

## US6: Payments invariants (FR-107)

### TC-001-015: minor-units + provider-aware пары (Order.amount)
- **Traceability**: FR-107 · Task T033 · **Tier**: Sanity · **Priority**: P1 · **Type**: Functional · **Technique**: EP + BVA
- **Test Data**: amount 0 / -1 / 10.5 → reject; Stars (5000, XTR, totalMinor 10000) → match; Stars (4999) → mismatch; fiat (10000, USD vs USD) → match; fiat (10000, EUR vs USD) → mismatch; поддержка Payload `Order.amount` наряду с `totalMinor` (F6)
- **Expected Result**: вердикты совпадают с легаси-семантикой fulfillment.ts

### TC-001-016: Stripe-путь не тронут
- **Traceability**: FR-107 · **Tier**: Regression · **Priority**: P1 · **Type**: Negative
- **Expected Result**: `git diff` не затрагивает checkout/Stripe-эндпоинты шаблона; e2e TC-001-003 остаётся зелёным

## US7: QA baseline (FR-108)

### TC-001-017: изоляция тест-БД в Phase 1 + vitest sequential
- **Traceability**: FR-108 · Task T015 · **Tier**: Regression · **Priority**: P0 · **Type**: Functional · **Technique**: Error Guessing
- **Execution Steps**: `pnpm test:int` с `.env` DATABASE_URL → dev-БД; проверка `fileParallelism: false` в `vitest.config.mts` (F5)
- **Expected Result**: соединение открывается к `undreseller_test` (grep-пруф vitest.setup + лог подключения); dev-БД не мутируется (F2); параллельные DDL гонки отсутствуют

### TC-001-018: ≥4 int-сьюта зелёные
- **Expected Result**: smoke + booking-fsm + access-roles + payments-invariants (+error-shapes) PASS

## NFR (Smoke-блок T050)

### TC-001-019: 0 новых deps — `git diff <base> -- package.json`: только script `validate`
### TC-001-020: legacy read-only — `git -C ../undreseller-legacy status` clean
### TC-001-021: memory fencing doc-block присутствует в docker-compose.yml (≤500 MB + PG 4096/2048)
### TC-001-022: pinned версии — package.json: payload 3.93.0 / next 16.3.3 / plugin-ecommerce 3.93.0 (без `^` дрейфа на этих трёх)

---

## Defect Report Template (для прогонов)

```
[DEF-###] Severity: Blocker|Critical|Major|Minor
Environment: local/staging + commit SHA
Related TC: TC-001-NNN
Steps to Reproduce: ...
Actual vs Expected: ...
Level 1 Evidence: raw log / curl / response JSON
```

# Implementation Plan: 001 (001-reinit-from-payload-ecommerce-template)

> "Не неси в новый дом трубы от старой канализации — неси чертежи." — Инженерный фольклор
> "Fail-closed — это не паранойя, это гигиена." — Валера

**Branch**: `main` (repo-level reinit; single-branch — та же IX-девиация, что вся линия легаси, см. Constitution Check) | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md) (rev 1.2, audit PASS, R1/R2 + external review F1–F7 integrated)
**Input**: `specs/001-reinit-from-payload-ecommerce-template/spec.md` + `requirements-audit.md` (PASS) + Annex A/B спеки (разведка легаси + шаблона)

## Summary

Реинициализация фундамента на Payload Ecommerce Template: (1) baseline green с evidence-файлом; (2) тест-изоляция в Phase 1 (T015) до фазы домена и восстановление SpecKit-говернанса из легаси с адаптацией гейтов под pnpm/vitest/playwright; (3) `legacy-port-map.md` — 11 доменов → класс переносимости → целевая спека; (4) staff-роли OWNER/OPERATOR/PERFORMER на Payload access control (тотальный sweep роли `admin` по всему коду и тестам, first-user=OWNER, админ-UI только OWNER); (5) pure-FSM kernel port 1:1 с адаптацией тестов; (6) SlotReservations skeleton-коллекция (fail-closed access, status readOnly в админке); (7) платёжный extension point + minor-units/provider-aware инварианты как pure-модуль с поддержкой Payload `Order.amount`; (8) QA-базовая линия с sequential-настройкой vitest во избежание DDL-гонок. **0 новых deps, 0 миграций БД в 001 (Payload push), Stripe-путь шаблона не тронут.**

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22, Next.js 16.3.3 App Router, React 19, Payload 3.93.0 + `@payloadcms/plugin-ecommerce` 3.93.0 — **pinned (NFR-104)**.
**Primary Dependencies**: без изменений от шаблона (NFR-101: 0 новых deps; `validate`-скрипт добавляется в scripts, не в deps).
**Storage**: PostgreSQL 16 (`@payloadcms/db-postgres`) — **схема через Payload push, hand-written миграций в 001 нет** (Expand/Contract N/A; GiST/advisory — 002+ raw-SQL миграции Payload).
**Testing**: vitest (int, jsdom, `fileParallelism: false` во избежание DDL race-conditions на `pushDevSchema`) + playwright (chromium e2e: admin + frontend/checkout). Базовая линия шаблона: 1 int smoke + 2 e2e сьюта. Новые сьюты: FSM-порт, access-matrix, invariants, error-shape snapshot.
**Target Platform**: Docker (compose = Postgres 16-alpine; app-сервис с Dockerfile — 002+; NFR-103 doc-block).
**Project Type**: web-монолит (Payload admin + storefront в одном Next-приложении).
**Performance Goals**: doc-инвариант ≤500 MB RAM app (NFR-103); тесты: полный vitest-прогон ≤60 c (ориентир легаси ~4 c + Payload boot).
**Constraints**: fail-closed канон; pinned BETA-зависимости; solo-dev; pnpm workspace (`pnpm ii` — единственный инсталл-путь).
**Scale/Scope**: white-label канон плана v2.5.0 (≤200 items / ≤20 staff / ≤2k bookings/мес) — не меняется.
**Security Surface**: нейтральная в 001 (roles/access — сужение к плану §2.1; новые векторов нет; STRIDE-матрица — 002+ на money-path).
**Database Migration Trigger**: отсутствует (Payload push; GiST — 002).
**Supply Chain**: без изменений (шаблонный lockfile не трогается).
**Research Spikes & Disposal**: 0 спайков (research D1–D7 — переиспользование proven-дизайнов легаси; Constitution XI).

## Constitution Check

Конституция восстанавливается в ходе US2 (FR-102) — чек по легаси-канону v1.9.0:

| Принцип | Статус | Примечание |
|---|---|---|
| I. Source of Truth | PASS | `.claude/` восстанавливается как authoritative; генерируемых деревьев (.gemini/.github/prompts) в 001 нет — транс пайплайн вне скоупа реinit |
| II. Transformer, Not Fork | N/A | нет новых AI-таргетов |
| III. Protected Slots | N/A | |
| IV. SemVer 0.x | N/A | app-репо (v1.0.0), не clai-helpers CLI |
| V. Token Economy | PASS | восстанавливается только используемый subset команд |
| VI. Cross-AI Review | ON TRACK (1/2 external) | analyze PASS ✅ + zcode self-review (не external) + **antigravity PASS ✅ (1-й внешний, F1–F7 remediated)** → нужен ещё ≥1 внешний PASS до implement |
| VII. Artifact Versioning | DEVIATION (одноразовая) | скрипт появляется в US2 → теги `spec|plan|tasks|…/001-…/v1` создаются одним батчем после US2, до implement |
| VII-B. Business Plan | PASS | дельта §1.4 зафиксирована; **план v2.5.0 «Payload Rebaseline» записан 2026-11-06 — SC-007 закрыт** |
| VIII. Self-Maintaining | PASS | `specs/main/architecture.md` v2 в US2 (T022) |
| IX. Two-Phase | DEVIATION (lineage) | repo-reinit физически на main (working tree уже swapped владельцем); planning+implementation на одной ветке — retro-пункт, как вся легаси-линия |
| X. Expand/Contract | N/A | 0 миграций в 001 |
| XI. Spike Governance | PASS | 0 спайков |
| XII. QA Contour | ON TRACK | requirements-audit PASS ✅; test-design файлы этим пакетом; qa-signoff после staging |
| XIII. Sovereign Capacity | PASS | WIP = 1 спринт (соло) |

## Project Structure

### Documentation (this feature)

```text
specs/001-reinit-from-payload-ecommerce-template/
├── spec.md                 # rev 1.2
├── requirements-audit.md   # PASS
├── legacy-port-map.md      # NEW (T041) — Annex A → полный реестр
├── plan.md                 # этот файл
├── research.md             # D1–D7
├── tasks.md
├── qa/                     # preliminary-rtm, rtm-matrix, test-cases, uat-scenarios, regression-suite
├── reviews/                # analyze.md, zcode.md (+ будущие внешние)
└── evidence/               # baseline.md, stride-verification.md, governance-tags.md
```

### Source (изменения)

```text
# Phase 0 — baseline
evidence/baseline.md                                  # NEW: сырой вывод build/lint/int/e2e + env-прereqs
# Phase 1 — governance restore & test isolation (US2, US7)
test.env                                              # NEW/MOD: TEST_DATABASE_URL (изоляция в Phase 1 — T015, F2)
vitest.setup.ts                                       # MOD: dotenv-override для тест-БД (T015)
vitest.config.mts                                     # MOD: fileParallelism: false против DDL-гонок (T015, F5)
.specify/memory/constitution.md                       # NEW: v1.9.0 адаптированный (pnpm/vitest/playwright гейты)
.specify/scripts/bash/snapshot-stage.sh               # NEW: копия легаси (идемпотентный guard)
.specify/scripts/powershell/snapshot-stage.ps1        # NEW: копия легаси
.claude/commands/speckit.*.md                         # NEW: subset (specify/clarify/plan/tasks/analyze/review/implement/qa-контур)
specs/main/architecture.md                            # NEW: v2 топография Payload
specs/main/requirements.md                            # NEW: FR-карта нового фундамента
# Phase 2 — domain skeleton (US4–US6)
src/collections/Users/index.ts                        # MOD: roles enum + ensureFirstUserIsAdmin → OWNER
src/access/roles.ts                                   # NEW: hasMinimumRole / иерархия OWNER>OPERATOR>PERFORMER
src/access/index.ts (или existing helpers file)       # MOD: экспорт role-хелперов
src/components/AdminBar/index.tsx                     # MOD: проверка hasMinimumRole(user?.roles, 'OWNER') (F1)
src/app/(app)/next/seed/route.ts                      # MOD: проверка hasMinimumRole(user?.roles, 'OWNER') (F1)
tests/e2e/frontend.e2e.spec.ts                       # MOD: замена 'admin' на 'OWNER' в data.roles (F1)
tests/helpers/seedUser.ts                             # MOD: явный roles: ['OWNER'] + overrideAccess (F7)
src/lib/kernel/bookingFsm.ts                          # NEW: pure port 1:1 (legacy lib/kernel/bookingFsm.ts)
src/lib/kernel/reservationStatus.ts                   # NEW: единый const DB-статусов
src/collections/SlotReservations.ts                   # NEW: skeleton-коллекция (fail-closed access, status readOnly; F3, F4)
src/payload.config.ts                                 # MOD: регистрация SlotReservations
src/payload-types.ts                                  # AUTO: generate:types (не ручками)
src/lib/payments/invariants.ts                        # NEW: minor units + provider-aware пары с поддержкой Order.amount (pure; F6)
tests/int/booking-fsm.int.spec.ts                     # NEW: FSM-порт (адаптация легаси suite)
tests/int/payments-invariants.int.spec.ts             # NEW: инварианты (pure)
# Phase 3 — QA & Port Map (US7, US3)
tests/int/access-roles.int.spec.ts                    # NEW: role-matrix
tests/int/error-shapes.int.spec.ts                    # NEW: минимальный snapshot-сьют
package.json                                          # MOD: script "validate": "tsc --noEmit"
docker-compose.yml                                    # MOD: doc-block Memory Fencing (NFR-103)
specs/001-reinit-from-payload-ecommerce-template/legacy-port-map.md # NEW: port map 11/11 доменов
```

Каждый файл — один писатель; T030 (roles) и T032 (collection) пересекаются на `payload.config.ts`/`Users` только через generate:types в конце фазы — sync-точка.

## Research Decisions (полный текст — research.md D1–D7)

D1 roles set-семантика · D2 FSM-port стратегия и FSM↔DB маппинг · D3 SlotReservations как Payload-коллекция (без raw SQL в 001, fail-closed access, readOnly status) · D4 тест-изоляция через отдельную БД в Phase 1 + vitest sequential DDL · D5 payments extension point с Order.amount · D6 governance restore механика · D7 admin-UI = OWNER-only.

## Threat Modeling (STRIDE)

Нейтральная фаза: новых внешних входов нет (Stripe-путь не тронут, ботов нет). Сужение: roles/access формализуют авторизацию админки (сегодня любой `admin` = полный доступ — это и остаётся OWNER-семантикой). `SlotReservations` закрыт fail-closed access control (`adminOnly` — только OWNER) для исключения неавторизованного внешнего CRUD (F3). E (elevation): first-user→OWNER хук — единственная новая привилегированная поверхность, покрыта тестом TC-001-004. Полная STRIDE-матрица — T050 (grep-пруфы) + 002+ на money-path.

## Rollback

Git-revert по коммитам (1 задача = 1 коммит); схема БД — Payload push (revert кода + `payload generate:types` возвращает консистентность); миграций нет — откат мгновенный. Восстановленный governance-файлы — чистые addition, откат = удаление.

## Risks & Complexity Tracking

| Риск | Вероятность | Митигация |
|---|---|---|
| e2e baseline хрупкий без Stripe test-keys / stripe CLI | средняя | evidence/baseline.md фиксирует env-прereqs; int-гейты не зависят от Stripe; e2e — owner-run с локальными ключами |
| Зависание 'admin' в коде (F1) ломает E2E и AdminBar | средняя | T030 расширен: sweep охватывает AdminBar, seed route, frontend.e2e и seedUser |
| Мутация dev-БД тестами до Phase 3 (F2) | средняя | Изоляция test.env перенесена в Phase 1 (T015) до написания тестов Phase 2 |
| DDL race-condition в параллельном Vitest (F5) | средняя | `vitest.config.mts` настраивается на `fileParallelism: false` в T015 |
| Payload BETA (3.93) API-дрейф | низкая | pinned версии (NFR-104); обновления — отдельная спека |
| FSM-порт разъедется с легаси-семантикой | низкая | порт 1:1 + тесты легаси как эталон (TC-001-013: те же сценарии) |
| set-роли (hasMany) дают неожиданные комбинации | низкая | max-иерархия `hasMinimumRole` + TC-001-012 на комбинированные наборы |
| тест-изоляция требует ручного `createdb` | низкая | bootstrap-шаг в test.env/README + TC-001-017 grep-пруф |

Нарушений конституции, требующих justification-таблицы, нет (VII/IX — задокументированные девиации).

## Next

`/speckit.tasks` → 12 задач (T010, T015, T020–T022, T030–T034, T040, T041, T050, T051), 3 параллельных lane'а после Phase 0; closeout — sync barrier.

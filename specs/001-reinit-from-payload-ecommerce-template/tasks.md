# Tasks: 001 (001-reinit-from-payload-ecommerce-template)

> "1 задача = 1 коммит = 1 секунда роллбэка." — Канон WRAP

**Input**: Design documents from `/specs/001-reinit-from-payload-ecommerce-template/` (spec.md rev 1.2, plan.md, research.md D1–D7, requirements-audit PASS, reviews/antigravity.md F1–F7 integrated)
**Prerequisites**: plan.md, spec.md (US1–7), requirements-audit PASS

**Organization**: Phase 0 (baseline) → Phase 1 (governance) → Phase 2 (domain skeleton) → Phase 3 (QA) → closeout. T030–T033 независимы по файлам; `payload generate:types` — sync-точка конца Phase 2; T050 — fan-in.

## Format: `[ID] [AGENT] [Story?] Description`

## Agent Tags

| Tag | Agent | Domain |
| --- | --- | --- |
| `[BE]` | backend-specialist | Payload collections/access/lib + тесты |
| `[SETUP]` | orchestrator | governance, evidence, closeout |
| `[DOC]` | documentation-writer | architecture v2, port-map |

---

## Phase 0: Baseline (US1)

- [X] T010 [BE] [US1] FR-101: baseline прогнан — validate/lint/test:int/build **0 exit** (build против `undreseller_test`: dev-БД легаси-загрязнена, см. evidence); e2e **ENV-BLOCKED** (Stripe keys unavailable) — owner-run; `evidence/baseline.md` с env-прereqs; первый юзер → `admin` (шаблонный хук, до T030)

## Phase 1: Governance restore & Test Isolation (US2, US7)

- [X] T015 [BE] [US7] FR-108: тест-изоляция — `test.env` + bootstrap `createdb`; `vitest.setup.ts` **delete-then-load** (dotenv@8 не умеет override — находка реализации); `vitest.config.mts`: `fileParallelism: false` + `environment: 'node'` (pg под jsdom неработоспособен) + hookTimeout 120s; изоляция пруфом: 5/5 сьютов на `undreseller_test`
- [X] T020 [SETUP] [US2] FR-102: `.specify/memory/constitution.md` (копия легаси **v1.10.0** → app-adapted **v1.10.1**: pnpm/vitest/playwright гейты, clai-helpers/publish N/A), `.specify/scripts/{bash,powershell}/snapshot-stage.{sh,ps1}` (verbatim), `CLAUDE.md` (указатель + команды)
- [X] T021 [SETUP] [US2] FR-102: `.claude/commands/speckit.*.md` — 12 команд скопированы из легаси (specify, clarify, requirements-audit, plan, tasks, test-design, analyze, review, implement, qa-signoff, status, diff)
- [X] T022 [DOC] [US2] FR-102: `specs/main/{architecture,requirements}.md` v2 написаны; batch snapshot-теги — **PENDING owner commit** (скрипт на месте; теги создаются батчем после коммита пакета)

## Phase 2: Domain skeleton (US4–US6)

- [X] T030 [BE] [US4] FR-104: roles + `hasMinimumRole`; тотальный sweep **12 ссылок + хук** (7 access-хелперов, Users admin-access, AdminBar, seed route, frontend.e2e:394, seedUser `overrideAccess: true`); первый юзер → OWNER; grep-пруф: 0 вхождений role-строк 'admin'
- [X] T031 [BE] [US5] FR-105: FSM-порт 1:1 (17 символов экспорта, zero semantic deviations — отчёт портера); `kernel/reservationStatus.ts` SSOT (bookingFsm ре-экспортирует тип); сьют **42 легаси-сценария PASS** (34 booking-fsm + 8 confirming-freeze; legacy deadlineSweeper/recordConfirmingFreeze inlined чисто)
- [X] T032 [BE] [US5] FR-106: коллекция создана (options из SSOT, status readOnly, fail-closed adminOnly ×4, валидаторы endTime/scheduleVersion pure-экспорт); зарегистрирована в config; `generate:types` чист (SlotReservation в payload-types); guard-покрытие через error-shapes + enum-SSOT import
- [X] T033 [BE] [US6] FR-107: `invariants.ts` (minor-units + Stars/фиат + полиморфизм Order.amount/totalMinor); `payments-invariants.int.spec.ts` — 13 тестов PASS (BVA ±1, XTR, case-insensitive, tiny-order floor, polymorphism)
- [X] T034 [BE] [US4–US6] sync: `generate:types` — roles union + slot-reservations в payload-types; `tsc` **0 ошибок** (26 шаблонных долгов вычищено по пути: generatePreviewPath, CheckoutPage x3, CartModal x2)

## Phase 3: QA baseline & Port Map (US7, US3)

- [X] T040 [BE] [US7] FR-108: access-roles (10 тестов: matrix + комбинированные наборы + field-hiding), error-shapes (4); `validate` script добавлен — **exit 0**
- [X] T041 [DOC] [US3] FR-103: `legacy-port-map.md` — 11/11 доменов классифицированы + dead weight помечен; 001-домены (1,3,7) помечены как сделанные

## Phase 4: Closeout (sync barrier)

- [X] T050 [SETUP] [US1–7] Regression-гейт: validate/lint/test:int/build — **0 exit**; e2e ENV-BLOCKED (owner-run); audit — 11 H/C → **hotfix 2026-11-07: 0 H/C** (overrides next 16.4.1/sharp/dompurify/happy-dom/vitest; root-next был затронут — 3 CRITICAL RCE в публичном рантайме; полная история в evidence); NFR-103 doc-block добавлен в docker-compose.yml; NFR-102 пруф — legacy clean
- [X] T051 [SETUP] [US1–7] статусы проставлены; теги — после owner commit; `/speckit.qa-signoff` готов к прогону после staging + e2e owner-run

---

## Dependency Graph

```
T010 → T015
T010 → T020
T020 → T021, T022
T015 → T030
T030 → T031, T032, T033
T031, T032, T033 → T034
T034 → T040
T010 → T041
T020 → T050
T030, T031, T032, T033, T040, T041, T021, T022 → T050
T050 → T051
```

### Self-Validation Checklist

- [x] Every task ID referenced exists above
- [x] No circular dependencies
- [x] No orphan IDs
- [x] Fan-in `+` only, fan-out `,` only
- [x] No chained arrows on a single line

Примечания: T015 обеспечивает тест-изоляцию до T030/T031; T020–T021 — чистые file-additions (нет конфликтов); T030 — единственный писатель `Users`/roles; T031/T032/T033 — разные файлы; T034 — fan-in Phase 2 (generate:types + tsc); T050 — fan-in всего.

---

## Parallel Lanes

| Lane | Agent Flow | Tasks | Blocked By |
| ---- | ---------- | ----- | ---------- |
| 1 | [BE] baseline | T010 | — |
| 2 | [BE] isolation + [SETUP]+[DOC] governance | T015 (test DB isolation) \|\| (T020 → T021, T022) | T010 |
| 3 | [BE] domain skeleton | T030 → T031, T032, T033 → T034 | T015 |
| 4 | [BE] QA + [DOC] port-map | T040, T041 | T034 (T040); T010 (T041) |
| 5 | [SETUP] closeout | T050 → T051 | все |

## Agent Summary

| Agent | Tasks | Can Start After |
| ----- | ----- | --------------- |
| [BE] | 8 (T010, T015, T030–T034, T040) | immediately |
| [SETUP] | 3 (T020, T021, T050, T051) | T010 (T020) |
| [DOC] | 2 (T022, T041) | T020 (T022); T010 (T041) |

**Critical Path**: T010 → T015 → T030 → T031/T032/T033 → T034 → T040 → T050 → T051 (12 задач).

**Total**: 12 задач.

---

## Agent Dispatch Plan

| Agent | Subagent/Command | Skills | Input Context | Tasks | Files |
| ----- | ---------------- | ------ | ------------- | ----- | ----- |
| `[BE]` | backend-specialist | api-patterns, typescript-expert, payload-cms (если есть), clean-code | spec §2, research D1–D5, Annex A/B | T010, T015, T030–T034, T040 | см. Source-таблицу plan.md |
| `[SETUP]` | orchestrator | architecture, clean-code | research D6, plan §Constitution | T020, T021, T050, T051 | .specify/, .claude/, evidence/ |
| `[DOC]` | documentation-writer | documentation-templates | Annex A/B, research D2/D3 | T022, T041 | specs/main/, legacy-port-map.md |

---

## Implementation Strategy

**Baseline-first**: Phase 0 фиксирует зелёную линию шаблона ДО любых правок (легаси-урок 003/004: чинить гейты до, а не после). Governance параллелится с domain skeleton. Каждый коммит зелёный: `pnpm validate && pnpm test:int` минимум; e2e — на Phase 0 и Phase 4.

**Constitution VI**: implement заблокирован до analyze PASS + ≥2 внешних ревью PASS (self-review zcode не засчитывается — см. reviews/zcode.md).

## Notes

- Тесты в каждой задаче — TDD-Lite; никаких `as any`/`console.log`/raw SQL в 001.
- Snapshot: теги создаются батчем в T022 (VII-девиация задокументирована в plan).
- Легаси-источники для порта: `undreseller-legacy/lib/kernel/bookingFsm.ts`, `undreseller-legacy/lib/payments/providerContract.ts` (invariants), `undreseller-legacy/lib/security/staffRbac.ts` (иерархия), `undreseller-legacy/tests/unit/booking-fsm.test.ts` + `confirming-freeze.test.ts` (эталоны сценариев).

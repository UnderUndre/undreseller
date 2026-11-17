# Tasks: 013-local-ai-triage

**Input**: `spec.md` rev 1.0, `plan.md`, `data-model.md`, `contracts/local-ai-triage.md`, `research.md`, `requirements-audit.md` PASS
**Organization**: Phase 1 Setup → Phase 2 Schema (Expand) → Phase 3 US1 (Intake) → Phase 4 US2/US3/US4 (Pure AI Core, LM Studio Client, Payload Job, Approvals & GDPR) → Phase 5 US5 (Eval Suite) → Phase 6 Polish, Telemetry, Security & Verification.

---

## Phase 1: Setup & Environment Contract

- [X] T1301 [SETUP] Document optional `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_MODEL`, `LOCAL_LLM_API_KEY`, `LOCAL_LLM_TIMEOUT_MS`, `LOCAL_LLM_RESPONSE_FORMAT`, `LOCAL_LLM_ALLOW_REMOTE`, and `TELEGRAM_OWNER_CHAT_IDS` in `.env.example` and add `"eval:ai"` script without new runtime dependencies in `package.json`

## Phase 2: Foundational Schema (Expand-only — Principle X)

- [X] T1302 [DB] Add nullable `customerNotes` (`maxLength: 2000`), field-locked `aiTriageStatus`, and read-only `aiTriageJson` to `src/collections/SlotReservations.ts` and `customerNotes` to `src/collections/BookingIntents.ts`
- [X] T1303 [DB] Add `aiTriageEnabled`, `aiDelegationLimit`, `aiDelegationCurrency`, `aiMinConfidence`, and `adminOnlyFieldAccess` `ownerChatIds` to `src/globals/ShopSettings.ts`
- [X] T1304 [DB] Create idempotent Expand-only SQL migration (`ALTER TYPE enum_payload_jobs_task_slug / enum_payload_jobs_log_task_slug ADD VALUE IF NOT EXISTS 'ai-triage'`, `CREATE TYPE enum_slot_reservations_ai_triage_status / enum_shop_settings_ai_delegation_currency`, `ADD COLUMN IF NOT EXISTS`, 4-column `CREATE TABLE IF NOT EXISTS shop_settings_owner_chat_ids` with `_order` and `_parent_id` indexes) with matching `down()` rollback in `src/migrations/20261118_000001_local_ai_triage.ts` and register it in `src/migrations/index.ts`

## Phase 3: US1 — Optional Customer Notes Intake (P0)

**Goal**: Принять, провалидировать (`0..2000` символов после `trim()`) и сохранить `customerNotes` на обоих путях бронирования (OTP-гидратация и trust-cookie) с индикацией `hasNotes` на staff-карточке.
**Independent Test**: `POST /api/booking` с `customerNotes` (1..2000 chars) сохраняет заметку в БД и не вызывает LLM; `> 2000` chars возвращает `400 VALIDATION_FAILED`.

- [X] T1310 [BE] [US1] Extend `CreateIntentInput`, `createIntent`, and `verifyIntentBooking` with typed `customerNotes` validation and DB hydration in `src/lib/booking/intentService.ts`
- [X] T1311 [BE] [US1] Extend `CreateBookingInput` and `createBooking` with parameterized `customer_notes` and `ai_triage_status` persistence, `hasNotes` flag for `enqueueStaffCard`, and best-effort `ai-triage` job enqueue strictly AFTER `PREPAID`/`DEPOSIT` `createPaymentIntent` succeeds in `src/lib/booking/bookingService.ts`
- [X] T1312 [BE] [US1] Parse, trim, and validate optional `customerNotes` (`<= 2000` chars, non-string → `400 VALIDATION_FAILED`) for both trust-cookie and OTP paths in `src/app/api/booking/route.ts`
- [X] T1313 [FE] [US1] Add optional `customerNotes` textarea (`maxLength={2000}`) with accessible label to `src/components/booking/SlotGrid.tsx` and add i18n keys to `src/i18n/locales/ru.json` and `src/i18n/locales/en.json`

## Phase 4: US2, US3 & US4 — Pure AI Core, LM Studio Client, Async Job, Approvals & GDPR (P0)

**Goal**: Реализовать PII-санитайзер, SSRF-safe HTTP-клиент к LM Studio, детерминированную матрицу делегирования, асинхронную Payload Job `ai-triage`, обогащение Telegram Outbox, выдачу в `/api/approvals` и GDPR-очистку.
**Independent Test**: При mock `fetchImpl` (и при выключенной LM Studio) джоба переходит `pending -> processing -> done|failed`, PII=0 в запросе к модели, бронь не блокируется.

- [X] T1320 [BE] [US2] Implement pure PII sanitizer (`sanitizeForLlm` in pass order `EMAIL` → `IBAN` (`[ID]`) → `PHONE` → `ID` of `8..30` digits / `4×4` groups while preserving amounts, price ranges like `1000 - 1500 AED`, and dates, plus escaping `<`/`>` to `&lt;`/`&gt;`) in `src/lib/ai/sanitizePii.ts`
- [X] T1321 [BE] [US3] Implement pure structured extraction parser (`parseTriageExtraction` stripping `<think>`/markdown fences and strictly returning `null` on any schema/bound violation), deterministic `routeTriageDecision` (5-condition rule), and merged `AiTriageRecord` type in `src/lib/ai/triagePolicy.ts`
- [X] T1322 [BE] [US4] Implement zero-dependency `fetch` (`redirect: 'error'`) LM Studio client with SSRF guard (`validateLocalLlmUrl` normalizing `[::1]`, unconditionally blocking `169.254.0.0/16`/link-local/credentials, and failing closed with `REMOTE_LLM_FORBIDDEN`), `AbortSignal.timeout`, `<customer_note>` isolation, and max-1 `temperature: 0` JSON retry in `src/lib/ai/localLlmClient.ts`
- [X] T1323 [BE] [US2] Implement `aiTriageTask` (`retries: 0`, `deleteJobOnComplete: true`, `pending -> processing` atomic claim gated on `status IN ('HELD','BOOKED','PENDING_APPROVAL')`, `done`/`failed` update with `AiTriageRecord`, PII-free `audit_events`, and `telegram_outbox` follow-up skipped if booking became `RELEASED`) in `src/jobs/aiTriage.ts` and register it in `src/payload.config.ts`
- [X] T1324 [BE] [US3] Include `customerNotes`, `aiTriageStatus`, and `aiTriage` (`AiTriageRecord | null`) in `OPERATOR+` payload of `src/app/api/approvals/route.ts` and merge `customer_notes = NULL, ai_triage_json = NULL` into the existing single `UPDATE slot_reservations` statement (> 90 days) in `src/jobs/gdprPurge.ts`

## Phase 5: US5 — Live LM Studio Eval Suite (P1)

**Goal**: Дать воспроизводимый локальный бенчмарк для живой LM Studio на GPU хоста с проверкой схемы, маршрутизации, prompt injection, утечек PII и latency.
**Independent Test**: `pnpm eval:ai` прогоняет ≥ 25 кейсов против LM Studio и падает с exit code 1 при `PII Leaks > 0` или `Schema Compliance < 90%`.

- [X] T1330 [BE] [US5] Author ≥ 25 labeled eval cases (RU/EN/translit, `1499/1500/1501` boundary amounts, cross-currency, urgency, ≥ 3 prompt injection, ≥ 3 PII cases) in `tests/eval/triage-dataset.json` and implement CLI runner in `scripts/eval-local-llm.ts`

## Phase 6: Cross-Domain Tests, Security Audit, Telemetry & Release Verification

- [X] T1340 [E2E] Implement comprehensive offline integration test suite (PII BVA, SSRF guard, 5-condition routing Decision Table, OTP hydration, atomic job claim, fail-open timeout/5xx, `/api/approvals` RBAC, 90d GDPR purge) in `tests/int/local-ai-triage.int.spec.ts`
- [X] T1341 [SEC] Verify STRIDE mitigations (PII=0 in LLM payloads/logs/`audit_events`, SSRF fail-closed check, zero `approveBooking`/FSM coupling, zero new runtime deps in `package.json`) and record evidence in `specs/013-local-ai-triage/qa/security-check.md`
- [X] T1342 [OPS] Verify PII-free structured logging, migration `up`/`down` rollback on clean DB, and run `pnpm generate:types`, `pnpm validate`, `pnpm lint`, `pnpm test:int`, `pnpm build` with 0 errors
- [X] T1343 [DOC] Update `specs/main/architecture.md` and `specs/main/requirements.md` to reflect as-built `013-local-ai-triage` after implementation

---

## Dependency Graph

```text
T1301 → T1322
T1302 → T1304
T1303 → T1304
T1304 → T1310
T1304 → T1311
T1304 → T1323
T1310 → T1312
T1311 → T1312
T1312 → T1313
T1320 → T1322
T1321 → T1322
T1320 + T1321 + T1322 → T1323
T1311 → T1323
T1304 → T1324
T1321 → T1324
T1320 + T1321 + T1322 → T1330
T1312 + T1313 + T1323 + T1324 → T1340
T1330 + T1340 → T1341
T1340 + T1341 → T1342
T1342 → T1343
```

### Graph Self-Validation
- [x] All Task IDs exist (`T1301..T1304`, `T1310..T1313`, `T1320..T1324`, `T1330`, `T1340..T1343`).
- [x] No chained arrows on a single line; only `→` and `+` operators used.
- [x] Zero cycles; zero orphans.
- [x] `[SEC]` (`T1341`) and `[E2E]` (`T1340`) depend strictly on implementation tasks.
- [x] Shared files isolated to single tasks (no parallel write conflicts between agents).

**Critical Path**: `T1302 → T1304 → T1311 → T1323 → T1340 → T1341 → T1342 → T1343` (8 tasks). **Total**: 18 tasks.

---

## Parallel Lanes

| Lane | Tasks | Blocked By |
| --- | --- | --- |
| Lane 1 (Setup & AI Core) | `T1301`, `T1320`, `T1321` → `T1322` → `T1330` | — |
| Lane 2 (Schema & Intake) | `T1302`, `T1303` → `T1304` → `T1310`, `T1311` → `T1312` → `T1313` | — |
| Lane 3 (Job & Approvals) | `T1323`, `T1324` | `T1304`, `T1311`, `T1320..T1322` |
| Lane 4 (Verification & Closeout) | `T1340` → `T1341` → `T1342` → `T1343` | `T1312`, `T1313`, `T1323`, `T1324`, `T1330` |

---

## Agent Summary

| Agent | Task Count | Task IDs | Start Condition |
| --- | :---: | --- | --- |
| `[SETUP]` | 1 | `T1301` | Immediate |
| `[DB]` | 3 | `T1302`, `T1303`, `T1304` | Immediate |
| `[BE]` | 9 | `T1310`, `T1311`, `T1312`, `T1320`, `T1321`, `T1322`, `T1323`, `T1324`, `T1330` | Pure (`T1320`, `T1321`) immediate; DB-coupled after `T1304` |
| `[FE]` | 1 | `T1313` | After `T1312` |
| `[E2E]` | 1 | `T1340` | After `T1312`, `T1313`, `T1323`, `T1324` |
| `[SEC]` | 1 | `T1341` | After `T1330`, `T1340` |
| `[OPS]` | 1 | `T1342` | After `T1340`, `T1341` |
| `[DOC]` | 1 | `T1343` | After `T1342` |

---

## Agent Dispatch Plan

| Agent | Subagent / Role | Context Sections | Task IDs | Target Files |
| --- | --- | --- | --- | --- |
| `[DB]` | `database-architect` | `data-model.md`, `plan.md` §Migration | `T1302..T1304` | `src/collections/{SlotReservations,BookingIntents}.ts`, `src/globals/ShopSettings.ts`, `src/migrations/` |
| `[BE]` | `backend-specialist` | `spec.md`, `contracts/local-ai-triage.md`, `plan.md` | `T1310..T1312`, `T1320..T1324`, `T1330` | `src/lib/ai/*`, `src/lib/booking/*`, `src/jobs/*`, `src/app/api/*`, `src/payload.config.ts`, `scripts/eval-local-llm.ts`, `tests/eval/` |
| `[FE]` | `frontend-specialist` | `spec.md` US1, `contracts/local-ai-triage.md` §1 | `T1313` | `src/components/booking/SlotGrid.tsx`, `src/i18n/locales/{ru,en}.json` |
| `[E2E]` | `test-engineer` | `qa/test-cases.md`, `qa/rtm-matrix.md` | `T1340` | `tests/int/local-ai-triage.int.spec.ts` |
| `[SEC]` | `security-auditor` | `plan.md` §STRIDE, `spec.md` §1.3 | `T1341` | `specs/013-local-ai-triage/qa/security-check.md` |
| `[OPS]` | `devops-engineer` | `plan.md` §ORR, `quickstart.md` | `T1342` | Verification commands + migration rollback check |
| `[DOC]` | `documentation-writer` | `specs/main/{architecture,requirements}.md` | `T1343` | `specs/main/{architecture,requirements}.md` |

---

## Suggested MVP Scope

- **MVP (US1 + US2 + US3 + US4)**: `T1301..T1324` + `T1340..T1342` — весь боевой цикл бронирования, PII-санитайзинг, LM Studio триаж, маршрутизация делегирования и fail-open.
- **Full Feature (+ US5)**: добавить `T1330` (живой eval-набор из 25+ кейсов для демонстрации метрик).

# 004 Backlog: Capability Packs 003.2 — Carried Over, Unstarted

**Origin:** аудит 2026-10-24 ([`003-tasks-audit.md`](003-tasks-audit.md)) — 31 таск спеки 003 был
помечен `[X]` без артефактов; снят с галочки и перенесён сюда с сохранением ID для трассировки.
Полные формулировки — в [`../003-commerce-operations-capability-packs/tasks.md`](../003-commerce-operations-capability-packs/tasks.md).

**Статус относительно релиза 004:** НИ один из этих тасков не является релиз-блокером. По исходному
плану 003 это Tier 2 коммерческие паки за гейтом валидации спроса (T069). Очередность внутри 004
определяется спекой, не этим файлом.

## Состояние на диске (факты аудита)

- `lib/packs/` не существует; в `lib/kernel/` нет `fulfillmentPlanService.ts` и `paymentPlanService.ts`.
- Паковых миграций нет: `20261022050000_003_goods_and_commerce_pack`, `20261023000000_003_quote_pack`,
  `20261023010000_003_journey_pack`, `20261023020000_003_documents_change_pack`,
  `20261023030000_003_compliance_pack`, `20261023040000_003_ops_import_pack` — отсутствуют.
- Семейства Quote / Party / ChangeRequest / Jurisdiction / ServiceCase **в schema.prisma отсутствуют целиком**.
- 14 моделей есть в схеме БЕЗ миграции (Offering, OfferingVariant, ServicePolicy, BundleComponent,
  InventoryBalance, InventoryMovement, OrderLine, PaymentPlan, PaymentMilestone, PaymentAllocation,
  FulfillmentPlan, FulfillmentSegment, CompletionEvidence + OperatorAction) — латентная мина P2021.
  **Решение, которое надо принять в 004:** одна консолидированная additive-миграция ИЛИ вычистить
  модели из схемы до момента планирования пака.
- T065/T066 указывают на файлы эпохи 002 (`app/api/admin/items`, `app/api/catalog`, ItemCard,
  CartDrawer) — паковой логики внутри ноль.

## US3 — Mixed Orders & Segmented Fulfillment (Phase 5): T022–T026

| ID | Суть (конденсированно) | Вердикт аудита |
|---|---|---|
| T022 | `lib/kernel/fulfillmentPlanService.ts`: FulfillmentPlan/Segment/Provider, CompletionEvidence (FR-318/319) | MISSING |
| T023 | `POST /api/checkout`: иммутабельные OrderLine-снапшоты, CapacityPort, init сегментов | MISSING |
| T024 | `/api/admin/fulfillment/my-segments` + `.../segments/[id]/evidence` (RBAC + audit) | MISSING |
| T025 | CheckoutModal + /checkout: mixed cart + segmented fulfillment summary | MISSING |
| T026 | `tests/unit/fulfillment-plan.test.ts` | MISSING |

## US4 — Payment Plans & Provider Registry (Phase 6): T027–T029

| ID | Суть | Вердикт |
|---|---|---|
| T027 | `lib/kernel/paymentPlanService.ts`: PaymentProvider registry (FR-316) + PaymentPlan/Milestone/Allocation (FR-315) | MISSING |
| T028 | Stars/NowPayments/refunds пишут PaymentAllocation, не мутируя PaymentEvent (INV-007) | MISSING |
| T029 | `tests/unit/payment-plan.test.ts` (30/70 lifecycle, partial refunds) | MISSING |

**Связка с 004 P0:** реализация `PaymentProvider`-интерфейса (FR-316, текст уже в спеке 003 §spec.md:710-723) —
часть релизного P0-контура 004 (invoice API вместо рукодельной ссылки + FSM). T027–T029 едут следом за ним.

## US6 — Quotes & Margin Guard (Phase 8): T035–T038 — все MISSING
T035 миграция Quote/QuoteLine (моделей в схеме нет) · T036 quoteService (версионирование, MarginGuard,
конвертация в Order) · T037 quote API endpoints · T038 тесты.

## US7 — Party Timeline & Journeys (Phase 9): T039–T042 — все MISSING
T039 миграция Party/Journey/OperatorAction (OperatorAction — schema-only без миграции) · T040 journeyService
(PartyTimelineView, conversation-to-draft, ContinuationLink HMAC) · T041 API роуты · T042 тесты.

## US8 — Change Requests & Documents (Phase 10): T043–T045 — все MISSING
T043 миграция ChangeRequest/CommercialDocument/NumberingProfile · T044 changeRequestService
(selective releaseCapacity, CREDIT_NOTE) · T045 тесты.

## US9 — Compliance Adapters (Phase 11): T046–T048 — все MISSING
T046 миграция JurisdictionProfile/ComplianceOperation* · T047 5 SPI-портов + manifest wizard +
NOT_COMPLIANCE_READY гейт · T048 тесты (включая AST-проверку нуля хардкода стран).

## US10 — Redacted Read Models & Staged Imports (Phase 12): T049–T052 — все MISSING
T049 миграция ServiceCase/ImportBatch/DataQualityIssue · T050 importAndQualityService ·
T051 agentRead MCP-адаптер (read-only) · T052 privacy-тесты.

## US1 — Goods & Inventory Pack (Phase 15): T063–T067

| ID | Суть | Вердикт |
|---|---|---|
| T063 | 13 моделей + миграция `20261022050000` + per-item currency | SCHEMA-ONLY (схема есть, миграции и кода нет) |
| T064 | inventoryService: транзакционный InventoryMovement-леджер | MISSING |
| T065 | API каталога/инвентаря с pack-семантикой | PARTIAL (файлы 002-эпохи, 0 pack-логики) |
| T066 | UI каталога за Goods Pack конфигом | PARTIAL (то же) |
| T067 | `tests/unit/goods-inventory-pack.test.ts` | MISSING |

---

## Tier-1 (003.1) частичные долги — галочки НЕ сняты, но зазоры идут в 004

Артефакты существуют, поэтому `[X]` оставлены; расхождения с заявками (из аудита):

- **T008/T031**: Better Auth установлен и не используется (сессии самописные) — в 004 решить: честная интеграция или дескоуп библиотеки.
- **T018**: `ShopSettings.timeZone` проброшен в computeAvailableSlots и игнорируется (математика в UTC) — таймзонный баг для не-UTC инстансов; рынок 004 вне РФ, это P0-кандидат.
- **T020**: нет rate limiting на create/cancel; `idempotencyKey` принимается и не используется.
- **T002/T003**: лицензионный гейт без скана уязвимостей, вне npm scripts/CI.
- **T033**: AuditEvent-записи в staffAuth.ts, не в staffRbac.ts (функционально есть).
- **T057/T058**: e2e покрывает не тот флоу; бенчмарк — не тот профиль NFR, не компилируется.
- **T059**: DR-дрилл фейкает результаты (нет restore, безусловный PASS).
- **T060/T068**: `AuditEvent.reason` пишется без PII-редакции (против INV-010); `serviceAddressSnapshot` вне nightlyPurge; OpenTelemetry отсутствует.
- **T061**: living docs не упоминают in-call/out-call.
- **T062**: гейты валидации красные на HEAD (tsc + jest).

## Входы из ресерча 004, релевантные этому бэклогу

- Notification reliability (Telegram+email fallback, лог доставки) — P0/P1 из `competitors-research.md`; закрывает жалобу #1 рынка.
- Custom Booking Fields (динамические поля брони per-instance) — стратегический дифференциатор (P1); стыкуется с T021-слоем, не с паками.
- Slot Hold FSM + UNDERPAID — P0; предусловие для T027–T029.

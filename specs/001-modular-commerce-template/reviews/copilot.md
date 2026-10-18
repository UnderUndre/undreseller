Повторно проверил актуальные spec.md, plan.md и tasks.md. Предыдущие блокеры закрыты: MCP вынесен в Phase 2, pre-implementation review отделён от post-implementation quality gate, а финальный join теперь ожидает T-009 и T-031.

Вердикт: PASS
verdict: PASS
reviewer: copilot
critical_count: 0
high_count: 0
medium_count: 2
low_count: 1
gate_recommendation: APPROVE_REVIEW

Что подтверждено
MCP boundary закрыт

spec.md теперь определяет MCP как Phase 2 candidate, запрещает production MCP в Sprint B, ограничивает spike двумя днями, локальным stdio, read-only инструментами и обращением только через существующий application service layer. Прямой доступ к Prisma/PostgreSQL, произвольные запросы, raw payloads и mutation tools запрещены.

plan.md повторяет ту же границу, а tasks.md включает production MCP server, remote MCP endpoint и MCP mutation tools в список того, для чего нельзя создавать задачи в v1.

Review gate и quality gate разделены

plan.md теперь отдельно требует до начала реализации:

analyze.md со статусом PASS или OVERRIDDEN;
два review от разных внешних providers;
review-stage snapshot tag.

T-037 явно назван отдельным post-implementation gate и больше не подменяет Principle VI.

Финальный dependency join исправлен

T-037 теперь ожидает критические feature branches, включая T-009, T-021, T-025, T-027, T-030, T-031, T-032, T-033 и T-034. Поэтому client handover через T-035 не может пройти без privacy cleanup, durable inbox, payment concurrency, health, DR и тестового набора.

Предыдущие технические блокеры остаются закрыты

Подтверждены:

versioned canonical inbox payloads;
численные ограничения raw body и payload;
atomic attempt counter;
payload retention;
user erasure в durable inbox;
at-least-once delivery semantics;
inventory compensation через stockDecremented;
общий advisory-lock protocol;
transactional alert outbox;
запрет самописного auth stack;
final vulnerability, license и telemetry gates.
Неблокирующие замечания
F1. MEDIUM: T-034 всё ещё может стартовать до T-027

T-034 включает concurrency test для sweeper и fulfillment, но его собственный dependency expression не содержит T-027:

T-009 + T-011 + T-012 + T-026 + T-030 + T-031 + T-036 → T-034


При этом T-027 является владельцем реализации sweeper. T-037 действительно ждёт и T-027, и T-034, поэтому финальный gate защищён, но планировщик может попытаться выполнить T-034 до готовности тестируемого sweeper.

Лучше заменить строку на:

T-009 + T-011 + T-012 + T-015 + T-016 + T-017 +
T-025 + T-026 + T-027 + T-030 + T-031 + T-036
→ T-034


Это также закрепит непосредственных владельцев logger, startup assertion, inbox и AI fixture tests, перечисленных внутри T-034.

F2. MEDIUM: из assertions T-034 снова пропало {}

В T-034 написано:

old SENT/FAILED payloadJson scrubbed to , while old PENDING...


Ожидаемое значение после to отсутствует, хотя spec.md и T-031 корректно требуют payloadJson = {}.

Исправить на:

old SENT/FAILED payloadJson scrubbed to {},
while old PENDING and recent SENT payloadJson remain preserved

F3. LOW: заголовки всё ещё содержат старую дату revision

Все три документа показывают Revised: 2026-10-13, хотя текущая редакция уже включает более поздние решения по MCP, auth boundary и quality gates.

Это не влияет на реализацию, но затрудняет forensic traceability. Стоит обновить дату revision и создать предусмотренный конституцией snapshot tag.

Gate status

Техническая спецификация теперь пригодна для реализации:

technical_spec_status: PASS
architecture_blockers: none
money_and_concurrency_blockers: none
privacy_blockers: none
mcp_scope_status: fixed
dependency_gate_status: sufficient_for_final_completion


Но фактический /speckit.implement разрешён только после выполнения процессуальных условий Principle VI:

pre_implementation_requirements:
  analyze_review: PASS_or_OVERRIDDEN
  external_reviews:
    minimum_distinct_providers: 2
    verdicts: PASS_or_OVERRIDDEN
  review_snapshot_tag: required


Текущий Copilot review может быть одним из двух внешних review. Сам по себе он не открывает implementation gate, но со стороны содержания этой редакции блокирующих findings больше нет.

---

## Финальное подтверждение неблокирующих улучшений (2026-10-18)

- **F1 RESOLVED**: Граф зависимостей `T-034` явно включает всех прямых владельцев (`T-009 + T-011 + T-012 + T-015 + T-016 + T-017 + T-025 + T-026 + T-027 + T-030 + T-031 + T-036 → T-034`).
- **F2 RESOLVED**: Значение `{}` дословно закреплено в тексте ассерта `T-034`.
- **F3 RESOLVED**: Дата ревизии `Revised: 2026-10-18` актуализирована во всех артефактах (`spec.md`, `plan.md`, `tasks.md`).
- Статус: **`PASS`**, готов к снятию snapshot-тега этапа.
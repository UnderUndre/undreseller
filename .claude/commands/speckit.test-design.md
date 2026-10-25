---
description: Enterprise test artifact engine per ISO/IEC/IEEE 29119:2021 (Parts 2, 3, 4). Generates test-cases.md, RTM matrix with NFR evidence table, UAT scenarios, and regression suites into specs/<slug>/qa/. Runs after /speckit.tasks, in parallel with /speckit.implement.
handoffs:
  - label: Analyze (validate spec/plan/qa coverage)
    agent: speckit.analyze
    prompt: Validate the spec, plan and test coverage.
  - label: Implement
    agent: speckit.implement
    prompt: Execute the tasks.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

ultrathink

> "Find what the developer forgot. Test behavior, not implementation."
> "Баг, пойманный на бумаге, стоит 10 минут. Баг на проде — бессонную ночь онколла." — Валера

Goal: Сгенерировать полную тестовую обвязку для ручных QA-тестировщиков по стандарту **ISO/IEC/IEEE 29119-3:2021** (test documentation) и техникам **ISO/IEC/IEEE 29119-4:2021** (test design). Все артефакты кладутся в `specs/<slug>/qa/`.

Timing (Shift-Left): команда запускается после `/speckit.tasks` и **до/параллельно** `/speckit.implement`, чтобы ручной QA начинал опрессовку сразу после выкатки на staging/preview.

## Execution steps

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly` from repo root. Parse `FEATURE_DIR`. Required inputs:
   - `spec.md` (FR, квантованные NFR, acceptance criteria)
   - `plan.md` + `contracts/` (API-контракты, состояния БД)
   - `tasks.md` (для трассировки Task → TC)
   - `qa/preliminary-rtm.md` (если есть — берутся готовые Risk Scores; если нет — посчитай по формуле сам)
   - Missing spec/plan/tasks → abort и предложить соответствующую команду. Не выдумывай требования.

2. **Risk-Based Testing engine** (ISO 29119-2): возьми Risk Score из preliminary-rtm или посчитай
   $$\text{Risk Score} = \text{Impact (1–5)} \times \text{Probability (1–5)}$$
   и масштабируй глубину тест-дизайна:
   - **Risk ≥ 20 (Critical)**: Decision Table + State Transition + BVA (7 точек: MIN-1, MIN, MIN+1, NOMINAL, MAX-1, MAX, MAX+1) + Error Guessing/Attack Patterns + Exploratory Charter + UAT.
   - **Risk 15–19 (High)**: BVA + Decision Table (для комбинаторной логики) + негативные + сетевые сбои.
   - **Risk 6–14 (Medium)**: Equivalence Partitioning + базовые негативные + UI/UX.
   - **Risk 1–5 (Low)**: Smoke positive (happy path).

3. Generate the artifacts into `specs/<slug>/qa/`:

### Файл 1: `qa/rtm-matrix.md` (End-to-End Traceability)

Полная цепочка `FR ↔ Task ↔ Commit/PR ↔ TC ↔ Bug`. Включи обязательную NFR-секцию с Level 1 Evidence:

```markdown
# Requirements & Risk Traceability Matrix (RTM)

| Req ID | Суть | Impact | Prob | Risk Score | Test Tier | Test Cases | Task | Implementation PR | Defect IDs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |

## NFR Traceability & Level 1 Evidence Table

| NFR ID | Категория | Требование | Метод валидации | Инструмент | Threshold | Evidence (файл) | Статус |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| NFR-PERF-01 | Latency | p95 ≤ 150ms @ 300 RPS | Нагрузочный тест | k6 | p95 ≤ 150ms | [PENDING] | [ ] |
```

Только FR → TC — недостаточно: NFR без привязки к сырым пруфам (k6 json, scanner report, failover log) — пустой звук. Evidence-колонки на этом этапе `[PENDING]`, заполняются при прогоне.

### Файл 2: `qa/test-cases.md` (ISO 29119-3 Formal Test Case Specifications)

Каждый тест-кейс:

```markdown
### TC-[SLUG]-[001..N]: [Краткое однозначное название]

- **Traceability**: FR-ID / NFR-ID, Task ID
- **Tier**: [Smoke] / [Sanity] / [Regression] / [Extended]
- **Priority**: P0 (Critical) / P1 (High) / P2 (Medium) / P3 (Low)
- **Type**: Functional / Negative / Security / UI-UX / Boundary
- **Technique**: BVA / EP / Decision Table / State Transition / Error Guessing
- **Pre-conditions**: состояние системы, роль и права пользователя, тестовые данные (ID записей, балансы)
- **Test Data**: точные значения (никаких «любая строка»); границы и спецсимволы явно
- **Execution Steps**: атомарные шаги без двусмысленности
- **Expected Result**: точный UI-отклик, код ответа API, изменение состояния в БД
- **Post-conditions**: клинап (сброс сессии, удаление тестовых записей)
```

**Anti-Slop QA чек-лист** (обязателен перед записью файла):
- Нет шагов вида «введите корректные данные» / «проверьте, что всё работает» — все значения захардкожены.
- Атомарность: один TC проверяет ровно одну ветку или одну границу.
- Независимость: TC-002 не зависит от успеха TC-001 (каждый сам выставляет предусловия).
- Детерминированность: ожидаемый результат проверяем однозначно (не «система быстро отвечает», а «тост "Сохранено" появился, статус в таблице → Active»).
- Соотношение Positive / Negative + Boundary — не менее 40/60 в сторону негативных и границ.

### Файл 3: `qa/uat-scenarios.md` (Business Acceptance — UAT)

QA ищет баги расхождения со спекой; UAT проверяет бизнес-ценность. Это разные вопросы — не смешивай. Формат:

```markdown
## UAT-001: [Сквозной бизнес-процесс]

- **Target Persona**: [роль бизнес-заказчика]
- **Business Goal**: [что должно стать возможным без обращения в саппорт]
- **Success Criteria**: [измеримые бизнес-результаты, ≤ 3 пунктов]
- **Validation Steps**: [сквозные шаги от лица персоны]
- **Business Sign-off**: [PENDING]
```

### Файл 4: `qa/regression-suite.md` (Plan of Progons)

Тиражирование кейсов по временным окнам (защита от «гоняем всё подряд»):
- **Smoke Suite (P0)**: ≤ 15 минут, блокирует деплой на staging при любом падении.
- **Sanity Suite (P1)**: ≤ 45 минут, затронутые смежные подсистемы.
- **Full Regression (P2/P3)**: перед мажорными релизами и промоушеном ветки.

4. Report completion:
   - Число сгенерированных TC по тирам (Smoke/Sanity/Regression/Extended) и техникам.
   - RTM coverage: % FR/NFR со статусом COVERED (цель — 100%).
   - Список созданных файлов в `qa/`.
   - Next step: `/speckit.analyze` (проверит покрытие), затем `/speckit.implement`; после деплоя на staging — ручной прогон и `/speckit.qa-signoff`.

Behavior rules:

- Никаких кейсов «на глаз»: каждый TC обязан ссылаться на FR/NFR и применять именованную технику из ISO 29119-4.
- Risk ≥ 20 без Decision Table и State Transition coverage — считается незакрытым, предупреди в отчёте.
- Не редактируй spec.md / plan.md / tasks.md. Нашёл противоречие — задокументируй в RTM как дефект требований и предложи `/speckit.clarify`.
- Багрепорт-шаблон (для последующих дефектов при прогоне): Severity (Blocker/Critical/Major/Minor), Environment, Related TC, Steps to Reproduce, Actual vs Expected, Level 1 Evidence (raw log / curl / response JSON).

Context for prioritization: $ARGUMENTS

## Snapshot Stage (Principle VII)

```bash
.specify/scripts/bash/snapshot-stage.sh test-design <slug>
```

```powershell
.specify\scripts\powershell\snapshot-stage.ps1 -Stage test-design -Slug <slug>
```

Tag `test-design/<slug>/v<N>` MUST be reported back. Idempotent.

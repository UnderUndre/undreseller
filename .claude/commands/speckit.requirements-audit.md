---
description: Formal requirements quality gate (ISO/IEC/IEEE 29148:2018, clauses 5.2.5 & 5.2.6). Audits spec.md for Verifiability, Consistency, Completeness, Unambiguity; computes Risk Scores and drafts the preliminary RTM. REJECT blocks /speckit.plan.
handoffs:
  - label: Clarify Spec (if REJECTED)
    agent: speckit.clarify
    prompt: Fix the rejected requirements in the spec. Findings
  - label: Build Technical Plan (if PASS)
    agent: speckit.plan
    prompt: Create a plan for the spec. I am building with...
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

ultrathink

> "Какое ТЗ — такое и ХЗ." — Народная мудрость
> "Если требование кривое, вся последующая труба будет течь независимо от качества реализации." — Валера

Goal: Compile-time проверка требований. Ты — строгий аудитор тестируемости и качества спецификации. Твоя задача — зарубить нетестируемую, противоречивую или неоднозначную спецификацию **ДО** того, как архитектор начнет проектировать систему. Без статуса **AUDIT PASS** переход к `/speckit.plan` **ЗАПРЕЩЁН**.

## Execution steps

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly` from repo root. Parse `FEATURE_DIR` and `FEATURE_SPEC`. If parsing fails or the spec is missing — abort and instruct user to run `/speckit.specify` (or `/speckit.full-spec`) first. Do not invent a spec.

2. Load `FEATURE_SPEC` and run the **4-Pillar Gate** audit:

### Гейт 1: Verifiability & Quantization (Тестируемость)

- Каждое FR обязано иметь детерминированный pass/fail результат.
- Каждое NFR обязано быть квантовано метрикой (проценты, мс, RPS, лимиты).
- Стоп-слова без цифр — немедленный **FAIL** для конкретного требования: `fast`, `secure`, `convenient`, `user-friendly`, `scalable`, `real-time`, `быстро`, `удобно`, `безопасно`, `масштабируемо`, `периодически`. Требование формулировки: явное квантованное значение (например, "p95 ≤ 150 мс при 300 RPS").

### Гейт 2: Consistency & Conflict Matrix (Непротиворечивость)

Построй матрицу попарных пересечений требований $FR_i \times FR_j$ там, где они касаются одной сущности или подсистемы:
- Конфликты прав (Admin vs User, read-only vs mutation).
- Конфликты жизненного цикла данных (hard delete vs retention, GDPR vs аудиторские требования).
- Взаимоисключающие состояния конечного автомата сущности.
- Наличие хотя бы одного неразрешенного логического конфликта = **FAIL** (требования могут быть по отдельности тестируемыми и всё равно вместе невыполнимыми).

### Гейт 3: Completeness & Boundary Conditions (Полнота)

- Поведение при падении внешних зависимостей (circuit breaker / fallback) описано?
- Зафиксированы лимиты пустых списков (N=0), одного элемента (N=1) и насыщения (N=MAX)?
- Сценарии таймаутов и гонок (race conditions, idempotency keys) описаны?
- Ошибочные и пустые состояния UI определены?

### Гейт 4: Unambiguity (Однозначность)

- Нет синтаксической и семантической двусмысленности.
- Терминология сведена к единому словарю: одна сущность не может называться то `клиент`, то `пользователь` в разных разделах.

3. **Risk-Based Testing scoring**: для каждого FR/NFR оцени
   $$\text{Risk Score} = \text{Impact (1–5)} \times \text{Probability (1–5)}$$
   - Risk ≥ 20 (Critical) → обязательные техники верификации: Decision Table + State Transition Machine + Exploratory Charter + UAT.
   - Risk 15–19 (High) → BVA (7 точек), негативные тесты, симуляция сбоев.
   - Risk 6–14 (Medium) → EP + базовые негативные проверки.
   - Risk 1–5 (Low) → Smoke happy-path.

4. Write the audit report to `specs/<slug>/requirements-audit.md`:

```markdown
# Requirements Audit Report: [SLUG]

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: [PASS / REJECTED]
- **Audit Date**: YYYY-MM-DD

### 1. Стоп-слова и неквантованные метрики
- Обнаружено нарушений: [0 / N]
- [FR/NFR ID]: [цитата] → [причина]

### 2. Матрица конфликтов (Consistency Cross-Check)
| ID 1 | ID 2 | Суть конфликта | Рекомендация |
| :--- | :--- | :--- | :--- |

### 3. Анализ полноты (Boundary & Failure Coverage)
- Edge-cases: [ДА / НЕТ]
- Fallback-стратегии: [ДА / НЕТ]

### 4. Итоговый статус гейта
- **GATE VERDICT**: [PASS / REJECTED]
```

5. Write the preliminary RTM draft to `specs/<slug>/qa/preliminary-rtm.md` — **до** архитектурного плана, чтобы задать вектор для `plan.md` и `tasks.md`:

```markdown
# Preliminary Requirements Traceability Matrix (Draft RTM)

| Req ID | Тип | Формулировка | Impact | Prob | Risk Score | Обязательные техники верификации | Planned Verification Level |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FR-001 | FR | Вход по OAuth 2.0 | 5 | 4 | 20 | State Machine, Attack Guessing, UAT | Manual QA + Contract Test |
| NFR-001 | NFR | p95 Latency < 150ms | 4 | 3 | 12 | Load Testing (k6 script) | Automated CI Pipeline |
```

6. Report completion:
   - Gate verdict (PASS / REJECTED) и по каким требованиям.
   - Число нарушений по каждому из 4 гейтов.
   - Пути к `requirements-audit.md` и `qa/preliminary-rtm.md`.
   - Next step: PASS → `/speckit.plan` (или `/speckit.clarify` если были отдельные серые зоны); REJECTED → блокировка, `/speckit.clarify` или правка `spec.md`.

Behavior rules:

- REJECTED = пайплайн остановлен. `/speckit.plan` вызывать запрещено; выведи список критических блокеров.
- Байпас только через явный `--override-gate "<причина>"` (задокументируй причину в отчёте).
- Не переписывай spec.md сам — только аудит и рекомендации; правки через `/speckit.clarify` или руками пользователя.
- Оценивай каждое требование независимо, но конфликты — только попарно по одной сущности.

## Snapshot Stage (Principle VII)

```bash
.specify/scripts/bash/snapshot-stage.sh requirements-audit <slug>
```

```powershell
.specify\scripts\powershell\snapshot-stage.ps1 -Stage requirements-audit -Slug <slug>
```

Tag `requirements-audit/<slug>/v<N>` MUST be reported back. Idempotent.

## Business plan hook

Если аудит вскрыл противоречия в монетизации, ICP или юнит-экономике — предложи `/speckit.business-plan` UPDATE. Иначе: `Business plan: unchanged`.

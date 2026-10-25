---
description: QA Sign-off & release gate (runs after manual QA execution on staging). Verifies smoke suite results, defect status, NFR evidence, and UAT sign-off; issues APPROVED / APPROVED WITH RISKS / BLOCKED certificate that gates /speckit.code-review and merge.
handoffs:
  - label: Fix Defects
    agent: speckit.fix-review
    prompt: Fix the QA defects listed in the sign-off report.
  - label: Code Review (if APPROVED)
    agent: speckit.code-review
    prompt: Review the implementation diff.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty). Typical input: отчёт ручного QA (пройденные/упавшие кейсы), список дефектов, ссылки на evidence-файлы, целевой PR/commit.

## Outline

ultrathink

> "Пока не доказано, не ебёт что сказано." — Правило Level 1
> "Труба не опрессована, давление не держит — мердж заблокирован." — Валера

Goal: Блокировать мердж PR и переход к финальному аудиту `/speckit.code-review`, пока ручное тестирование и бизнес-приёмка не закрыты. Агент не запускает тесты сам — он **проверяет отметки** ручного QA в артефактах `specs/<slug>/qa/` и выносит трёхпозиционный вердикт.

## Execution steps

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly` from repo root. Parse `FEATURE_DIR`. Verify presence of:
   - `qa/rtm-matrix.md`
   - `qa/test-cases.md`
   - `qa/uat-scenarios.md`
   - `qa/regression-suite.md`
   Missing artifacts → **BLOCKED** сразу: предложи `/speckit.test-design`. Не выдумывай результаты прогонов.

2. Collect the manual QA execution results from `qa/test-cases.md` (статусы PASSED/FAILED/BLOCKED/SKIPPED), `qa/rtm-matrix.md` (Defect IDs, Implementation PR, NFR evidence) и `qa/uat-scenarios.md` (Business Sign-off). Если тестировщик передал отчёт в `$ARGUMENTS`, сверяй его с файлами; расхождения — задокументируй.

3. Evaluate the **gate criteria**:

### Гейт-критерии

- [ ] **Smoke Suite**: 100% TC с Tier `[Smoke]` = PASSED.
- [ ] **Critical Defects**: 0 открытых P0/P1 (закрыты и перепроверены, либо явно перенесены в бэклог с подтверждением риск-овнера).
- [ ] **NFR Evidence**: для каждого критического NFR (Risk ≥ 15) в RTM заполнена колонка Evidence (сырой файл: k6 json, scanner report, failover log) со статусом PASS. «По ощущениям летает» — не evidence.
- [ ] **UAT**: в `uat-scenarios.md` проставлены галочки выполнения и `Business Sign-off: APPROVED`.
- [ ] **Traceability Audit**: колонки `Implementation PR` / `Commit SHA` заполнены в `rtm-matrix.md`.

4. Вынеси **трёхпозиционный вердикт** и запиши `specs/<slug>/qa/signoff-report.md`:

```markdown
# QA Sign-Off Certificate: [SLUG]

- **Target PR / Commit SHA**: [PR #ID / SHA]
- **Audit Date**: YYYY-MM-DD
- **Sign-Off Status**: [APPROVED / APPROVED WITH RISKS / BLOCKED]
```

### 1. APPROVED
- Smoke 100% PASS, открытых P0/P1/P2 = 0, все критические NFR подтверждены Level 1 Evidence, UAT подписан.
- 👉 Разрешён переход к `/speckit.code-review` и безоговорочный мердж.

### 2. APPROVED WITH RISKS
- Smoke 100% PASS, 0 открытых P0/P1.
- Имеются P2/P3 (Minor/Cosmetic) или граничный NFR-хвост (например, p99 превышен на 5% в пике), не блокирующие базовый бизнес-флоу.
- **Обязательное условие** — заполненный Residual Risk Register в отчёте:

```markdown
| Bug ID / NFR Gap | Описание риска | Вероятность | Ущерб | План фикса | Risk Owner (подтверждение) |
| :--- | :--- | :--- | :--- | :--- | :--- |
```

- 👉 Мердж разрешён с флагом `--risk-accepted`; автоматически предложи тикеты техдолга в бэклог. Risk Owner подтверждается пользователем явно — агент не подписывает риск за него.

### 3. BLOCKED
- Упал хотя бы один Smoke (P0), есть неразрешённый P1, отсутствует Level 1 Evidence для критического NFR, либо бизнес-заказчик отклонил UAT.
- 👉 Мердж заблокирован, `/speckit.code-review` отклоняется. Пайплайн возвращается на `/speckit.implement` или `/speckit.fix-review`. Выведи список упавших кейсов и открытых дефектов.

5. Report completion:
   - Итоговый статус и статистика (Smoke X/X, Regression Y/Y, открытые P0/P1, UAT).
   - Путь к `qa/signoff-report.md`.
   - При BLOCKED / WITH RISKS: конкретный следующий шаг (`/speckit.fix-review` или подтверждение риск-овнера).

Behavior rules:

- Никогда не выставляй PASS за тест-кейс, у которого нет явной отметки PASSED от ручного QA. SKIPPED ≠ PASSED.
- APPROVED WITH RISKS без заполненного Residual Risk Register и подтверждённого Risk Owner — запрещён, трактуется как BLOCKED.
- Байпас только через явный `--override-gate "<причина>"` (задокументируй в отчёте).
- Если тестировщик нашёл новый баг вне кейсов — зарегистрируй BUG-[SLUG]-[ID] (Severity, Environment, Related TC, Steps, Actual vs Expected, Level 1 Evidence) в RTM и учти в вердикте.

## Snapshot Stage (Principle VII)

```bash
.specify/scripts/bash/snapshot-stage.sh qa-signoff <slug>
```

```powershell
.specify\scripts\powershell\snapshot-stage.ps1 -Stage qa-signoff -Slug <slug>
```

Tag `qa-signoff/<slug>/v<N>` MUST be reported back. Idempotent.

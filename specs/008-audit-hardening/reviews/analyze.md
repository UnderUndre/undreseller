# Analyze Report: 008-audit-hardening

**Run**: #1 · **Date**: 2026-11-12 · **Artifacts**: spec rev 1.0 (`405bfa3`) + requirements-audit PASS + clarify (0 open) + plan.md + tasks.md
**Canon**: cross-artifact consistency (constitution MUST, coverage, graph validity)

## Detection Passes

### 1. Constitution compliance
- X additions-only: миграция без rename/drop ✓; IX single-branch ✓; XII Risk-15 → STM/DT в задачах T810/T812/T813 ✓; VII теги батчем ✓; XIII WIP=1 ✓. Violations MUST: 0.

### 2. Coverage matrix (FR ↔ tasks)

| FR | Tasks | Покрытие |
|---|---|---|
| FR-801 | T820 (+T860 smoke) | 100% |
| FR-802 | T812 (+T851 route-тесты) | 100% |
| FR-803 | T813 (+T850 зависимость) | 100% |
| FR-804 | T810, T811 | 100% |
| FR-805 | T821 | 100% |
| FR-806 | T830, T831, T843 | 100% |
| FR-807 | T850, T851, T852 | 100% |
| FR-808 | T840, T841 (+T860) | 100% |
| FR-809 | T842 | 100% |
| FR-BK | вне спеки (явный бэклог) | N/A |

Оphans: 0. Недопокрытых FR: 0.

### 3. Findings (severity)

- **[A-01] [LOW]** T843 (CSP-проверка) — браузерная верификация ручная, не автоматизируется в гейте: принято (канон nextjs-15-5: curl лжёт), отмечено в evidence-плане T860.
- **[A-02] [LOW]** T851 частично [E2E]/частично [BE] — маршрутные тесты на vitest-контуре, не playwright: помечен [E2E] по канону репо (006 прецедент), double-tagging не требуется.
- **[A-03] [LOW]** error-shapes снапшот изменяет «замороженные» контракты (серверный key меняет 400-shape): противоречия нет — Via Negativa §1.3 прямо разрешает фиксацию ДО мерджа; тест T852 обновляет снапшот синхронно с T812.
- CRITICAL: 0. HIGH: 0.

### 4. Graph validity
- Циклов нет, orphan'ов нет (self-validation tasks.md ✓), critical path T810→T812→T821→T850→T860 валиден, lanes консистентны с dependency graph.

## VERDICT

```yaml
verdict: PASS
reviewer: analyze
run: 1
reviewed_at: 2026-11-12T01:35:00+02:00
spec_revision: "1.0"
critical_count: 0
high_count: 0
medium_count: 0
low_count: 3
```

Гейт VI (Principle VI): analyze PASS + внутренние ревью — до `/speckit.implement` требуется ≥2 external PASS (antigravity/codex/gemini) или logged owner override.

Гейт 8.5 (QA-contour): manual QA на staging + `/speckit.qa-signoff` — ПОСЛЕ имплементации, перед code-review.

---

## Run #2 addendum (2026-11-12): интеграция antigravity-ревью

**Вход**: reviews/antigravity.md verdict HIGH (5H/5M/1L, все 11 согласованы) → spec rev 1.1, plan/tasks обновлены.

**Проверка интеграции (F1–F11 → задачи)**: F1→T811 (deleteJobOnComplete) ✓ · F2→T810 (FOR UPDATE без нового статуса — Via Negativa восстановлен) ✓ · F3→T842 (sendOrderAccessEmail в plan+tasks) ✓ · F4→T813 (route + message_id + to_chat_id резолв + allow-list) ✓ · F5→T840/T843 (статическая CSP 'unsafe-inline', nonce-вариант явно отложен) ✓ · F6→T812 (intentService в plan, координация сигнатуры) ✓ · F7→T820 (index.ts + down() + enum отдельной миграцией) ✓ · F8→T840 (instrumentation.ts) ✓ · F9→T840 (контракт string|null + отказ лимита) ✓ · F10→T830/T850 (testid booking-conflict на OTP-шаге) ✓ · F11→T821 (семантика очистки разделена: availability vs submit) ✓

**Coverage после интеграции**: FR-801..810 (добавлен FR-810 миграционной механики) ↔ T810–T852 — 10/10, orphans 0. Граф не изменился (T810→T811 осталась: deleteJobOnComplete на той же таске). Бюджет задач не изменился (13).

**Resolve antigravity HIGH**: 5/5 устранены (F1–F5); MEDIUM 5/5 (F6–F10); LOW 1/1 (F11).

```yaml
verdict: PASS
reviewer: analyze
run: 2
reviewed_at: 2026-11-12T02:05:00+02:00
spec_revision: "1.1"
critical_count: 0
high_count: 0
medium_count: 0
low_count: 2
```

Гейт VI: antigravity run #1 = 1/2 external. Для implement: ещё ≥1 external PASS (codex/gemini) или owner override.

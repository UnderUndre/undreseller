# SpecKit Analyze: 014-composite-booking

**Reviewer**: analyze (self-consistency, run #1)
**Reviewed at**: 2026-11-18T14:30:00Z
**Artifacts**: `spec.md` (rev 1.1, clarified), `plan.md`, `tasks.md`, `data-model.md`, `research.md`, `contracts/composite-booking.md`, `quickstart.md`, `requirements-audit.md` (PASS run #1), `qa/{preliminary-rtm,rtm-matrix,test-cases,uat-scenarios,regression-suite}.md`

---

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
| --- | --- | --- | --- | --- | --- |
| L1 | Underspecification (UX) | LOW | `spec.md` §3 (Edge: смена цены между фазами) | Re-derive цен на фазе 2 может дать сумму, отличную от показанной клиенту на фазе 1; честный UX-контракт (показать финальную сумму на OTP-шаге) не описан | При реализации T1413/T1432 показать финальные суммы на OTP-шаге из ответа фазы 2 / `expiresAt`-карточки; зафиксировать в plan-drift note |

---

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | QA Coverage | Notes |
| --- | :---: | --- | --- | --- |
| FR-1401 (Schema Expand-only + addOn) | Yes | `T1402`, `T1403`, `T1404` | `TC-014-001/002` | 100% |
| FR-1402 (Composite intake, 3 пути, гидратация, drift) | Yes | `T1410`, `T1412`, `T1413` | `TC-014-003..009` | Risk 16: BVA + STM + Negative |
| FR-1403 (Composite availability, race) | Yes | `T1411` | `TC-014-010..013` | Risk 16: BVA + Concurrency + GiST adjacency |
| FR-1404 (Money path) | Yes | `T1420` | `TC-014-014..018` | Risk 15: Decision Table + STM money |
| FR-1405 (Itemized surfaces) | Yes | `T1430`, `T1431`, `T1432` | `TC-014-019..022` | 100% incl. legacy NULL fallback |
| FR-1406 (013/GDPR compat) | Yes | `T1433` | `TC-014-023/024` | Regression |
| NFR-1401..1406 | Yes | `T1440`, `T1441`, `T1442` | RTM NFR table | gates + snapshot + perf assert |

---

## Constitution Alignment Issues

- **I–V**: PASS — 0 deps, без дублей.
- **VI**: ON TRACK — нужен ≥ 2 external PASS (или owner `--override-gate`) до `/speckit.implement`.
- **VII/XII**: PASS — полный QA-контур (24 TC, 38%/62% Pos/Neg+BVA, RTM, UAT, regression).
- **VII-B**: PASS — `Business plan: unchanged` (§2.2 канон реализуется).
- **X**: PASS — строго Expand-only; enum'ов нет; `down()` точечный.
- **IX/XI/XIII**: PASS/DEVIATION (lineage как 001–013; spike = 0; WIP в лимите).

Violations MUST: **0**.

## Commercial / Business Plan Alignment

- Plan files loaded: BP v2.7.2 (§2.2 «мульти-сервисная корзина с шагом 30 минут» — канон сквозного процесса) + L1-запрос реального клиента (зафиксирован в шапке спеки как триггер).
- Findings: **none** — фича реализует запланированный канон, дельты ICP/цен/рельсов нет; Reality-гейт 013 закрыт клиентским сигналом.

## Unmapped Tasks

- `0` unmapped (`T1401..T1443` трассируются на FR/NFR); Dependency Graph валиден (исправлен artifact `T1421??` → удалён), lanes/dispatch присутствуют, shared files изолированы (`bookingService` → только T1420).

## Metrics

- Total Requirements: `12` (6 FR + 6 NFR)
- Total Tasks: `17`
- Coverage %: `100%`
- Ambiguity count: `1` (LOW)
- Duplication count: `0`
- CRITICAL/HIGH/MEDIUM: `0/0/0`
- LOW: `1`

## VERDICT

```yaml
verdict: PASS
reviewer: analyze
reviewed_at: 2026-11-18T14:30:00Z
critical_count: 0
high_count: 0
medium_count: 0
low_count: 1
```

**Next**: `/speckit.review` ×2 external (или owner `--override-gate`) → `/speckit.implement`.

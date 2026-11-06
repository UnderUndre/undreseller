# SpecKit Review: 001-reinit-from-payload-ecommerce-template

**Reviewer**: zcode  
**Reviewed at**: 2026-11-06T12:00:00Z  
**Commit**: working tree (планирующий пакет 001 не закоммичен — коммитит владелец)  
**Artifacts reviewed**: spec.md (rev 1.1), plan.md, research.md (D1–D7), tasks.md (11 задач), requirements-audit.md (PASS), qa/ (preliminary-rtm, rtm-matrix, test-cases 22 TC, uat-scenarios, regression-suite)

**Provider note (честность гейта)**: это ревью выполнено тем же инструментом и в той же сессии, что автор спеки — **self-review**. По Principle VI оно не засчитывается как внешний ревьюер: до `/speckit.implement` нужно ≥1–2 действительно внешних PASS (codex/antigravity/gemini/copilot) либо `--override-gate` с логом. Ценность этого документа — adversarial-проход, чтобы внешние глаза получили уже подчищенный пакет.

## Summary

Пакет зрелый для «фундамент+скелет»: скоуп атомарный, легаси-уроки (baseline-first, тест-изоляция, money-path замки) вшиты в задачи, а не в прозу. Головная слабость — не в дизайне, а в операционке: e2e-гейт зависит от Stripe-ключей владельца, а шаблонные access-хелперы ссылаются на убиваемую роль `admin` — если T030 перепишет не все хелперы, админка ляжет рантаймом, а не на тестах. Оба риска закрыты правками tasks.md в resolution-раунде ниже.

## Findings

| ID | Severity | Area | Finding | Recommendation |
| --- | --- | --- | --- | --- |
| F1 | MEDIUM | Ops / Gate fragility | e2e-гейт (TC-001-003, T050) зависит от Stripe test-keys + живого `stripe-webhooks` listener — без них baseline «краснеет» ложно, и SC-001 недостижим в голом CI | `evidence/baseline.md` обязан иметь секцию env-прereqs с чеклистом ключей; e2e помечен owner-run; int-гейты не зависят от Stripe (уже так) |
| F2 | MEDIUM | Auth wiring | Удаление роли `admin` из options ломает **существующие** шаблонные access-хелперы (`src/access/*` проверяют `'admin'`), если T030 ограничится добавлением `roles.ts` | T030 дополнен: sweep **всех** `src/access/*` хелперов с заменой `'admin'` → `hasMinimumRole(roles,'OWNER')`; гейт — TC-001-007..011 (admin-доступ по матрице) |
| F3 | MEDIUM | Schema sync | Enum статусов SlotReservations (select options) может разъехаться с DB-маппингом FSM (D2) — два источника истины | T031/T032 дополнены: единый const-модуль статусов в kernel + guard-тест на синхронность options ↔ маппинга |
| F4 | LOW | CI | CI в репо нет — все гейты локальные, VII-теги создаются вручную | Задокументировано как known limitation; CI-проводка — 002+ (deploy-спека) |
| F5 | LOW | Test bootstrap | Изоляция D4 требует ручного `createdb undreseller_test` — первый прогон у нового разработчика упадёт без doc-шага | Bootstrap-команда в шапке test.env + regression-suite.md (сделано); прогон TC-001-017 фиксирует пруф |
| F6 | MEDIUM | VII-B gate | Бизнес-план v2.5.0 «Payload Rebaseline» ещё не написан — SC-007 внешний гейт перед implement | Owner action: апдейт §2.5 (или оформленный вейвер) до `/speckit.implement`; analyze PASS обусловлен этим гейтом |

## Commercial / business plan notes

- Plans loaded: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.4.0.
- Focus laws / SKU floors checked: ICP/лестница $4,900/$6,800/$8,900/$349 не затронуты; «ровно 3 роли» соблюдено (admin схлопнут в OWNER); ≤1 бизнес-интеграция не расходуется (Payload-Stripe = capability, не новая интеграция; Stars/NOWPayments вне скоупа).
- Drift: §1.4 спеки фиксирует дельту §2.5 (Next 15/Prisma/Zod4/Argon2id/500MB/GiST → Payload-стек) — см. F6.

## Alternative approaches considered

- **Payload-статусы orders как основа FSM вместо легаси-порта** — отвергнуто research D2: теряется two-track семантика (FREE/PREPAID) и freeze-механика, проверенная 436 тестами легаси.
- **Testcontainers для изоляции** — отвергнуто D4: новый dep (NFR-101) ради того, что даёт `createdb`.

## Resolution round (2026-11-06, интегрировано автором)

| ID | Статус | Где закрыто |
| --- | --- | --- |
| F1 | RESOLVED | tasks.md T010: env-прereqs секция обязательна в evidence |
| F2 | RESOLVED | tasks.md T030: sweep всех access-хелперов с `'admin'` |
| F3 | RESOLVED | tasks.md T031/T032: shared const-модуль статусов + guard-тест |
| F4 | ACCEPTED | known limitation, CI — 002+ |
| F5 | RESOLVED | test.env + regression-suite.md bootstrap-шаг |
| F6 | ~~OPEN (owner gate)~~ **RESOLVED 2026-11-06** | Бизнес-план обновлён до **v2.5.0 Payload Rebaseline** (`undreplans/.../undreseller-business-plan.md`: §2.5 под Payload-стек, changelog, примечания §3/§4); гейт SC-007 снят |

## VERDICT

```yaml
verdict: PASS
reviewer: zcode
reviewed_at: 2026-11-06T12:00:00Z
commit: working-tree
critical_count: 0
high_count: 0
medium_count: 4
low_count: 2
gate_note: self-review — НЕ засчитывается в Principle VI external-квоту
```

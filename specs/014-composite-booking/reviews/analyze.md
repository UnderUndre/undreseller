# SpecKit Analyze: 014-composite-booking

**Reviewer**: analyze (self-consistency, run #2 — post-antigravity-fix)
**Reviewed at**: 2026-11-19T01:10:00+04:00
**Commit**: `2b575fd` (014 artifacts committed + AG-F1..F8 remediation; tags `spec/plan/tasks/014-composite-booking/v1` @ 2b575fd)
**Artifacts**: `spec.md` (rev 1.2), `plan.md`, `tasks.md`, `data-model.md`, `research.md`, `contracts/composite-booking.md`, `quickstart.md`, `requirements-audit.md` (PASS run #1), `qa/*`, `reviews/antigravity.md` (CRITICAL @ 0338a92, verified 8/8 findings TRUE)
**Supersedes**: analyze.md run #1 (PASS @ 0338a92, pre-review)

---

## Findings

All 8 findings from the antigravity external review (verified TRUE against the codebase by zcode, 2026-11-19) are resolved at `2b575fd`:

| ID | Severity | Resolution (commit 2b575fd) |
| --- | --- | --- |
| AG-F1 (CRITICAL) | resolved | Twin-column `_products_v.version_add_on` в FR-1401, data-model §1.3/§3, T1404 (up + down); `min: 5 → min: 0` на field-config `durationMin` в T1402 (бизнес-граница в `validate`); TC-014-001/002 покрывают |
| AG-F2 (CRITICAL) | resolved | Money-канон зафиксирован во всех слоях: `orders.amount` = списываемая сумма (0/Σdeposit/Σprice по режиму — канон 003/012, совместимо с `assertProviderAmountMatch`/`charge.refunded` и тестами `prepaid-booking:95`/`deposit-flow:121`); `totalPriceMinor` — производная в `deriveComposite` (`chargeableAmountMinor`/`totalPriceMinor` в contract §4), `items_json` per-позиционно, response `totalPriceInUSD`(+`totalDepositInUSD`); QA: TC-004 (`amount=0`, totalPrice 120), TC-005 (`0`/`115`), TC-014 (`3500`), TC-015 (FULL → Σ price) |
| AG-F3 (HIGH) | resolved | `cacheKey = ${service}:${items.join(',')}:${date}:${resourceId}` + `effectiveService = service ?? items[0]` (FR-1403, contract §2, T1411); `rescheduleBooking` composite override из строки (`total_duration_min`/buffers) — T1420 + contract §2 |
| AG-F4 (HIGH) | resolved | Бесплатные addOn (`addOn && priceInUSD===0 && depositAmount===0`) нейтральны к `paymentMode` (US3/US4, contract §1/§4, T1410); валидатор `depositAmount` допускает 0 для бесплатных addOn (T1402); zero-гвард `INVALID_DEPOSIT_AMOUNT` (код добавлен в Via Negativa, NFR-1405, T1442, contract) |
| AG-F5 (HIGH) | resolved | `ADDON_ONLY_BASKET` = предикат состава (нет не-addOn ИЛИ Σ<5), позиционная формулировка удалена из spec US1/US4 + contract §1; `[addOnId, primaryId]` легален (primary-first нормализация); legacy parity: одиночный вход сохраняет `404 SERVICE_NOT_FOUND`/`422 SERVICE_NOT_BOOKABLE` (FR-1402, NFR-1406, contract §1), `COMPOSITE_INVALID` — мульти-корзина (≥2) |
| AG-F6 (MEDIUM) | resolved | `src/app/[locale]/book/[slug]/page.tsx` добавлен в карту файлов §6 + T1432 (primaryService/availableAddOns DTO, фильтр paymentMode); T1431 + FR-1405: `<DepositPayment>` агрегаты из `items_json` с legacy-fallback `itemId: text` |
| AG-F7 (MEDIUM) | resolved | T1412: SELECT `slot_end, items_json` + атомарный dead-UPDATE + audit (`COMPOSITE_DRIFT`) до 403 (US1); T1420: idempotency fallback key, `findBookingByIdempotencyKey` возвращает `items`/`totalDurationMin`, `items` в `enqueueStaffCard`; T1430: JOIN `p.id::text = sr.item_id` (латентный int=varchar баг 003); ребро `T1430 → T1433` сериализует правки `bookingService.ts` |
| AG-F8 (LOW) | resolved | `spec.md` US6: промпт = primary title без «+N доп.» (синхрон с FR-1406); TC-014-019: 6 позиций (MAX_ITEMS=6) → 4 строки + `+2 ещё` |
| L1 (run #1, LOW) | resolved | Drift note в plan.md: финальные суммы на OTP-шаге (T1413/T1432), re-derive фазы 2 — показать на подтверждении до списания |

Stale-pattern sweep: `Order.amount = Σ priceInUSD`, «первая позиция addOn», «или все позиции addOn», `totalAmountMinor`, «7 позиций → +3 ещё» — отсутствуют в артефактах (grep verified). Новых противоречий fix-pass не внёс.

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | QA Coverage | Notes |
| --- | :---: | --- | --- | --- |
| FR-1401 (Schema Expand-only + addOn + twin-column) | Yes | `T1402`, `T1403`, `T1404` | `TC-014-001/002` | 100% |
| FR-1402 (Composite intake, 3 пути, гидратация, drift, legacy parity) | Yes | `T1410`, `T1412`, `T1413` | `TC-014-003..009` | + AG-F5 parity |
| FR-1403 (Composite availability, cacheKey, reschedule override) | Yes | `T1411`, `T1420` | `TC-014-010..013` | + AG-F3 |
| FR-1404 (Money path — канон списываемой суммы) | Yes | `T1420` | `TC-014-014..018` | + AG-F2 |
| FR-1405 (Itemized surfaces + server-page DTO + DepositPayment aggregates) | Yes | `T1430`, `T1431`, `T1432` | `TC-014-019..022` | + AG-F6 |
| FR-1406 (013/GDPR compat) | Yes | `T1433` | `TC-014-023/024` | Regression |
| NFR-1401..1406 | Yes | `T1440`, `T1441`, `T1442` | RTM NFR table | + `INVALID_DEPOSIT_AMOUNT` в snapshot |

## Constitution Alignment Issues

- **I–V**: PASS — 0 deps, без дублей.
- **VI**: ON TRACK — внешнее ревью #1 (antigravity, CRITICAL @ 0338a92) **исправлено и верифицировано 8/8**; для гейта нужен ≥1 внешний PASS на пост-фикс дереве (`2b575fd`) или owner `--override-gate`.
- **VII**: PASS — артефакты закоммичены (`2b575fd`), теги `spec/plan/tasks/014-composite-booking/v1`; `review/014-composite-booking/v1` @ 0338a92 — исторический (pre-fix).
- **VII-B**: PASS — BP unchanged (v2.7.2 §2.2 канон).
- **X**: PASS — Expand-only + twin-column; `down()` дропает 4 новых колонки; enum'ов нет.
- **IX/XI/XII/XIII**: PASS/DEVIATION (lineage как 001–013; spike = 0; QA-контур 29119; WIP в лимите).

Violations MUST: **0**.

## Commercial / Business Plan Alignment

- BP v2.7.2 (§2.2 «мульти-сервисная корзина с шагом 30 минут») + L1-клиентский сигнал в шапке спеки.
- Findings: **none** — Via Negativa границы удержаны; antigravity отдельно подтвердил нулевой коммерческий дрейф.

## Unmapped Tasks

- `0` unmapped; граф валиден, `T1430 → T1433` устраняет shared-file конфликт `bookingService.ts`; lanes/dispatch актуальны.

## Metrics

- Total Requirements: `12` (6 FR + 6 NFR)
- Total Tasks: `17`
- Coverage %: `100%`
- Ambiguity count: `0`
- Duplication count: `0`
- CRITICAL/HIGH/MEDIUM: `0/0/0`
- LOW: `0`

## VERDICT

```yaml
verdict: PASS
reviewer: analyze
reviewed_at: 2026-11-19T01:10:00+04:00
commit: 2b575fd
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

**Next**: ≥1 внешний PASS на пост-фикс дереве (`2b575fd`) или owner `--override-gate` → `/speckit.implement`.

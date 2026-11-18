# Regression & Execution Plan: 014-composite-booking

---

## 1. Smoke Suite (P0 — ≤ 15 минут, блокирует merge/deploy)

Оффлайн на mock gateway + real PG:
- `TC-014-003` legacy parity (побитовая совместимость)
- `TC-014-004` happy path composite (Σ/primary/snapshot)
- `TC-014-005` addOn не двигает span
- `TC-014-007` `MIXED_PAYMENT_MODES` 422
- `TC-014-008` капы BVA (6/7, 480/481)
- `TC-014-010` composite grid
- `TC-014-012` гонка 201+409
- `TC-014-014` DEPOSIT Σ
- Гейты: `pnpm validate && pnpm lint && pnpm test:int && pnpm build`

## 2. Sanity Suite (P1 — ≤ 30 минут)

- `TC-014-001/002` миграция и addOn-валидатор
- `TC-014-006`, `TC-014-009` fail-closed и intent drift
- `TC-014-011`, `TC-014-013` буферы и смежность
- `TC-014-016` idempotency по составу
- `TC-014-019..022` itemized surfaces
- `TC-014-024` GDPR purge

## 3. Full Regression (P1/P2 — перед приёмкой)

- `TC-014-015`, `TC-014-017`, `TC-014-018` money/approval контуры целиком
- `TC-014-023` 013 compatibility + `pnpm eval:ai` (013 регресс)
- Полный существующий suite 212+ (регрессионный baseline)
- `UAT-001`, `UAT-002` на staging

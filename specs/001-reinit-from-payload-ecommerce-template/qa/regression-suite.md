# Regression Suite: 001-reinit-from-payload-ecommerce-template

**Generated**: 2026-11-06 · Запускается: после каждой задачи (int-уровень) и на closeout (полный).

## Уровень 1 — после каждой задачи (fast gate)
```bash
pnpm validate && pnpm lint && pnpm test:int
```
- tsc 0 ошибок; eslint 0; int-сьюты PASS (smoke, booking-fsm, access-roles, payments-invariants, error-shapes)

## Уровень 2 — Phase 0 (T010) и closeout (T050) — полный
```bash
pnpm build && pnpm test:e2e
```
- build чистый; e2e: admin.e2e + frontend.e2e (checkout с Stripe test-keys + stripe-webhooks listener)
- Эталон: шаблонные 2 e2e сьюта должны оставаться зелёными на протяжении всей 001 (TC-001-016: Stripe-путь не тронут)

## Уровень 3 — нефункциональные пруфы (T050, evidence/)
- `git diff <base> -- package.json` (NFR-101/TC-001-019)
- `git -C ../undreseller-legacy status` clean (NFR-102/TC-001-020)
- grep doc-block docker-compose.yml (NFR-103/TC-001-021)
- grep pinned версий (NFR-104/TC-001-022)
- grep `npm run validate|npm test` в конституции → 0 (TC-001-004)
- snapshot idempotency (TC-001-005)

## Эталон легаси (порт-ориентир, не исполняется здесь)
`undreseller-legacy`: 58 сьютов / 436 тестов — источник сценариев для FSM-сьюта и будущих 002+; в 001 исполняется только адаптированный FSM-сьют.

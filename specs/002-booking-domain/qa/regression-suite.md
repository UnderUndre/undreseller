# Regression Suite: 002-booking-domain

## Уровень 1 — после каждой задачи
```bash
pnpm validate && pnpm lint && pnpm test:int
```

## Уровень 2 — closeout (T060)
```bash
pnpm build && pnpm test:e2e  # e2e: booking-flow (без Stripe) + шаблонные
```

## Уровень 3 — пруфы (evidence/)
- гоночный лог double-booking (100 попыток → 0)
- p95 availability замер (<50 ms)
- idempotency ×100 лог
- audit H/C (0) + deps diff
- 72+ теста 001 — зелёные (0 регрессии фундамента)

## Эталон
001: 5 сьютов / 72 теста — нулевой регрессионный базой.

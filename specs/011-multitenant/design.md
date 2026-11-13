# Дизайн-документ: 011-multitenant (white-label mode)

> **Статус:** DESIGN — НЕ имплементировать без ≥3 платящих клиентов. This is a one-way door.

## 1. Зачем

Бизнес-план v20.3 → Product 2 (Sprint B): каждый клиент бюро получает собственную booking-страницу под своим брендом на том же кодовом базисе. Модель: $500 setup + $349/mo Care. Один деплой обслуживает N клиентов.

## 2. Два подхода (mutually exclusive — one-way door)

### Подход A: Tenant-per-database (separate DB per client)

Каждый клиент = своя Postgres БД + свой Next.js контейнер. Docker-compose расширяется per-client.

```
kamancha.underundre.com  → app-kamancha (DB: kamancha)
kasa.underundre.com      → app-kasa (DB: kasa)
```

**Pros:**
- Полная изоляция данных (GDPR/152-ФЗ идеал)
- Утечка одного теннанта ≠ утечка всех
- Backup/restore per-client
- Custom-domain легко (CNAME + Cloudflare tunnel per client)
- Payload config проще (нет tenant_id фильтра на каждом запросе)

**Cons:**
- Ресурсы растут линейно: каждый клиент = свой Postgres контейнер + app контейнер (~300 MB RAM на Hetzner CPX42)
- Deployment updates = N отдельных перезапусков
- Мониторинг N контейнеров вместо 1
- docker-compose превращается в монстра при N > 10

**Verdict:** подходит для N ≤ 5 клиентов (current WIP limit), не масштабируется дальше.

### Подход B: Shared DB + tenant_id (row-level isolation)

Один деплой, одна БД. Коллекции `services`, `resources`, `weekly-hours`, `bookings`, `booking_intents` получают поле `tenant_id` (relationship к коллекции `tenants`). Payload `beforeOperation` хук автоматически фильтрует по текущему теннанту.

```
underundre.com        → app (DB: shared) — Cloudflare Tunnel wildcard *.underundre.com
Middleware: Host header → tenant resolution → tenant_id injection
```

**Pros:**
- Один деплой, один Postgres, один backup
- Ресурсы не растут линейно
- Payload admin показывает только данные текущего теннанта (beforeOperation hook)
- Масштабируется до N клиентов без изменения инфраструктуры

**Cons:**
- Риск data leak между теннантами (каждый запрос обязан фильтровать)
- Every raw SQL query needs `AND tenant_id = $current` — легко забыть
- Payload admin требует tenant-scoped user session
- Custom domains сложнее (wildcard + middleware resolution)
- Migration = один деплой для всех (breaking change бьёт всех сразу)

**Verdict:** масштабируемо, но каждый raw SQL query — потенциальная протечка. Требует audit trail на уровне СУБД (Row-Level Security в Postgres).

## 3. Рекомендация

**Подход A (tenant-per-database) для первых 3–5 клиентов** — проще, безопаснее, изоляция полная. При N > 5 мигрировать на Подход B (это отдельная спека с Expand/Contract миграцией).

## 4. Что нужно для Подхода A (implementation checklist)

1. Dockerfile: multi-stage (pnpm build → standalone Next.js)
2. Entrypoint: `payload migrate && node server.js`
3. docker-compose.prod.yml template (parameterized: ${TENANT_SLUG}, ${DATABASE_URL}, ${PAYLOAD_SECRET}, ${PORT})
4. Brand config: Payload globals `BrandSettings` (name, logo, colors, timezone, currency, locale)
5. Subdomain routing: Cloudflare Tunnel per-tenant route → docker port mapping
6. Seed script per-tenant: services + resources + weekly-hours + brand config
7. Monitoring: healthcheck endpoint per container + Uptime Kuma

## 5. Что НЕ входит (Via Negativa)

- ❌ SSO между тенантами (нет — клиенты не пересекаются)
- ❌ Shared admin panel (нет — каждый клиент получает свой admin на своём поддомене)
- ❌ Tenant marketplace / self-signup (нет — соло-фаундер вручную добавляет клиентов)
- ❌ Real-time multi-tenant metrics (нет — docker stats достаточно для ≤5)

## 6. Стоимость infra при N клиентах

| N | Hetzner | RAM needed | Monthly |
|---|---|---|---|
| 1 | CPX42 (8 GB) | ~600 MB | €82.69 |
| 3 | CPX42 (8 GB) | ~1.8 GB | €82.69 |
| 5 | CCX23 (16 GB) upgrade | ~3 GB | ~€170 |
| 10 | Second node | ~6 GB | ~€340 |

Break-even: 3 клиента × $349/mo = $1,047/mo > €170/мес VPS. OК.

## Clarifications

### Session 2026-11-13
- Q: Жизненный цикл и статус white-label архитектуры → A: Оставить как ADR / Design Doc (RFC) со статусом `FROZEN/DESIGN` до закрытия бизнес-гейта (≥3 платящих клиента). Спека `spec.md` не генерируется до выполнения условия.


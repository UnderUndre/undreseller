# Baseline & Gates Evidence: 001-reinit (T010 + T050)

**Дата**: 2026-11-06 · **Commit**: 682c4e1a… (working tree, коммитит владелец) · **Node**: v24.18.0 · **pnpm**: 12.15.0 · **Postgres**: 16 (docker `undreseller_db`)

## Env-прereqs (обязательная секция — zcode F1)

1. Docker: `docker compose up -d` → `undreseller_db` (PG16 на :5432).
2. Тест-БД: `docker exec undreseller_db psql -U postgres -c "CREATE DATABASE undreseller_test"` (однократно).
3. **ВНИМАНИЕ**: dev-БД `undreseller` загрязнена легаси-Prisma схемой (39 таблиц) — payload push против неё висит на интерактивном подтверждении rename/drop. Для baseline-билда использовалась изолированная тест-БД. Решение по dev-БД — за владельцем (см. «Owner decisions» ниже).
4. e2e: Stripe test keys в `.env` (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOKS_SIGNING_SECRET`) + `pnpm stripe-webhooks` listener — **в этой сессии недоступны, e2e owner-run**.

## Результаты гейтов (сырой итог)

| Гейт | Команда | Результат | Exit |
| :--- | :--- | :--- | :--- |
| tsc | `pnpm validate` | 0 ошибок (было 26 pre-existing шаблонных — вычищены) | **0** |
| eslint | `pnpm lint` | 0 errors / ~100 warnings (шаблонный стиль-долг; compiler-lints warn — бэклог 002+) | **0** |
| int-тесты | `pnpm test:int` | **5/5 сьютов, 70/70 тестов PASS** (booking-fsm 42 легаси-сценария, access-roles 10, invariants 13, error-shapes 4, api smoke) за 6.3 c | **0** |
| build | `pnpm build` (DATABASE_URL → `undreseller_test`) | 25 маршрутов собрано | **0** |
| e2e | `pnpm test:e2e` | **ENV-BLOCKED** (Stripe keys unavailable) — owner-run | — |
| audit | `pnpm audit --audit-level=high` (после hotfix 2026-11-07) | **0 H/C — 1 low + 6 moderate** (было 11 H/C). Fix: `pnpm-workspace.yaml` overrides — next 16.4.1 / sharp 0.35.5 / dompurify 3.4.17 / happy-dom 21.0.4 / vitest 4.1.0 (покрывает root + все вложенные копии @payloadcms/*) | **0** |

## Реализационные находки (drift-заметки к plan)

1. **dotenv@8 не умеет `override`** (опция с v16) — `vitest.setup.ts` переписан (delete → load). Без фикса все тесты ходили в dev-БД (F2 почти сработал бы всерьёз).
2. **drizzle-kit@0.31.7 баг 42P02**: единственный параметризованный запрос `db.query(sql, params)` теряет params против drizzle-orm 0.45 (`db.query` — relations-API). Исправлен `pnpm patch` (инлайн литералов — стиль всех соседних запросов файла); `pnpm.patchedDependencies` в package.json (не новый dep). Апстрим 0.31.9 — тот же баг.
3. **jsdom → node**: pg/drizzle-kit под jsdom неработоспособны; int-контур не использует DOM — `environment: 'node'`.
4. **Шаблонные tsc/eslint долги**: generatePreviewPath (`(frontend)`-роут, `posts`), implicit any (CheckoutPage ×3, CartModal ×2), tailwind.config.mjs require-в-ESM, eslint-config-next@16 flat-конфиги через FlatCompat (крэш валидатора) — вычищено в рамках TC-001-001.
5. **Таймауты vitest**: hookTimeout 120s / testTimeout 60s (холодный push).

## Owner decisions (флаги)

1. **Dev-БД `undreseller`** — легаси-Prisma данные. Варианты: (а) переименовать в `undreseller_legacy_archive` + чистый `undreseller` для Payload push; (б) wipe. До решения `pnpm dev`/build против dev-БД висит/падает.
2. **Audit H/C (11)** — ИСПРАВЛЕНО: рут-Next затронут (неавторизованные RCE в публичном рантайме) → residual-risk НЕПриемлем. Рекомендация: pnpm overrides (next 16.4.1, sharp 0.35.5, dompurify 3.4.17, happy-dom 21.0.4, vitest 4.1.0) + полный тест-свип — проверить совместимость с payload 3.93.0; оформляется как 002-deps или hotfix-коммит с ретро-заметкой.
3. **Snapshot-теги** (`spec|clarify|plan|tasks|…/001-…/v1`, `test-design/…`) — создаются после коммита пакета владельцем (скрипт `.specify/scripts/` уже на месте, батч по T022).


## Security Hotfix (2026-11-07): audit 11 H/C -> 0 H/C

- **Триггер**: полная проверка путей адвизори вскрыла, что рут-`next@16.3.3` (публичный рантайм витрины) входит в уязвимые диапазоны всех 4 next-находок — 3 CRITICAL, вкл. 2 неавторизованных RCE (Image Optimization, `use cache`) + next/og RCE + SSRF (Image Optimization) + DoS (Server Actions). Ранняя формулировка «публичный рантайм чист» — ошибка (смотрелся только findings[0].paths); исправлена здесь и в tasks.md T050.
- **Механика**: `pnpm-workspace.yaml` → `overrides` (pnpm 12 читает настройки ТОЛЬКО оттуда; секция `pnpm` в package.json больше не читается, а `--ignore-workspace` в скриптах инсталла игнорировал и allowBuilds, и overrides, и patch — убран из `ii`/`reinstall`).
- **Версии**: next 16.3.3→16.4.1, sharp 0.35.4→0.35.5, dompurify 3.4.15→3.4.17, happy-dom 20.14.6→21.0.4, vitest 4.0.18→4.1.0.
- **Верификация совместимости payload 3.93.0 + next 16.4.1**: validate 0 / lint 0 errors / test:int 70/70 / build 0 exit (25 маршрутов).
- **NFR-104**: пиннинг сохранён через overrides (обновления template-стека — по-прежнему отдельной спекой; этот hotfix — исключение по Security > Rules).
- **Остаток**: 1 low + 6 moderate (транзитивные) — фоновый кандидат в 002-deps.

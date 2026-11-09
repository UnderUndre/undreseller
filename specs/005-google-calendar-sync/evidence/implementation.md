# Implementation Evidence: 005-google-calendar-sync (Calendar Feed)

**Implemented**: 2026-11-09 · **Tasks**: T510–T530 (5/5) · **Gate override**: `reviews/_gate-override.md` (owner approval, 1/2 external)

## Gate 0 (exit) — all green

| Gate | Result |
| --- | --- |
| `npm run validate` (tsc --noEmit) | **0 errors** |
| `npm run lint` | **0 errors** (206 warnings — pre-existing профиль) |
| `npm run test:int` | **153/153 passed** (142 legacy + 11 new), два прогона подряд |
| `npm run build` | **0 exit** |
| `pnpm audit --prod` | **0 H/C** (1 low + 1 moderate, pre-existing) |
| `pnpm generate:types` | regenerated (Resources.feedTokenVersion) |
| **New deps** | **0** (NFR-502: hand-rolled RFC 5545) |

## What shipped (per task)

- **T510**: `src/lib/calendar/ics.ts` — PURE writer: escape RFC 5545 §3.3.11 (`,`/`;`/`\`/newline), **line folding ≤75 октетов UTF-8 safe** (never splits a code point — review F4), CRLF-инвариант, `PRODID:-//UnderUndre//undreseller//EN` + `VERSION:2.0` (F5), `REFRESH-INTERVAL:PT15M`, полный статус-маппинг **включая UNDERPAID → TENTATIVE** (re-check R1), SEQUENCE 0/1, DTSTAMP=`updated_at` (байт-детерминизм — D3), фоллбэки `Запись — Клиент` (F9), окно now−7d…now+90d.
- **T511**: `Resources.feedTokenVersion` (int, **adminOnlyFieldAccess** — F8); `feedToken.ts` — вычислимый HMAC `calendar-feed:v<N>:<resourceId>` (timing-safe, ничего секретного в БД).
- **T520**: `GET/HEAD /api/calendar/feed/[resourceId]` — rate limit **30/60s на `feed:${resourceId}:${ip}`** (F1 — краулеры с общих egress IP), **ETag `W/"sha256"` + 304 Not Modified** (F2), **HEAD-валидация** (F3), PII-gate (тело не логируется), выборка окна B-tree'ом.
- **T521**: `GET/POST /api/admin/calendar-feed/[resourceId]` (OWNER-only) — GET webcal URL / POST rotate (CAS version++ + audit `calendar.feed-rotated` с `{previousVersion, newVersion}` — F10); минимальный UI `CalendarFeedLink` (copy/rotate).
- **T530**: закрыто (см. гейты).

## Proof artifacts (11 новых тестов, TC-005-001..012)

- 403-матрица (невалидный/чужой ресурс) через реальные NextRequest-хендлеры.
- **Rate-limit изоляция бакетов**: 30 запросов к ресурсу A → 429; ресурс B с того же IP → 200 (F1-контракт).
- **ETag/304**: повторный If-None-Match → 304 пустым телом; **HEAD → 200 без тела** с валидными заголовками.
- **Folding**: сегменты ≤75 октетов, unfold восстанавливает строку байт-в-байт; кириллица не рвётся.
- **Статус-матрица**: все 8 DB-статусов, CANCELLED → SEQUENCE:1.
- **PII-grep**: 0 телефонов, '@' только в каноническом UID, DESCRIPTION отсутствует.
- **Rotate**: старый токен 403 / новый 200.
- **Детерминизм**: два вызова с frozen clock — байт-идентичное тело.

## Implementation discoveries

1. **Тест-байты vs JS-эскейпы**: в одинарной JS-строке `'\,'` = `,` (неизвестный эскейп съедается) — ассерты на RFC-эскейп требуют `\\,` в источнике; три итерации на этом и сгорело (упрощение D4 по SEQUENCE сэкономило бы их больше, если бы фид был REQUEST-моделью).
2. **`checkRateLimit(key, max, windowMs)`** — сигнатура с позиционными аргументами (не объектом) — 004-канон подтверждён.
3. Next App Router: явный `export async function HEAD` работает рядом с GET (F3 без кастомного сервера).

## Residual risks / deferred

- Live-подписка реальными Google/Apple календарями (поллинг-латентность, folding-парсинг вендоров) — на qa-signoff staging (канон 003/004).
- Полный GC API two-way — 005-bis при первом клиенте (OAuth-топология — отдельное решение владельца).

# SpecKit Code Review Report — 001-reinit (implementation diff)

**Reviewer**: `zcode`  
**Reviewed at**: 2026-11-07T01:00:00Z  
**Mode**: `Local Git Diff (working tree vs 682c4e1)` — scoped to 001 implementation: `src/access/*`, `src/collections/{Users,SlotReservations}`, `src/lib/{kernel,payments/invariants}`, `src/payload.config.ts`, `tests/{int,e2e,helpers}`, `vitest.*`, `test.env`, `package.json`, `pnpm-workspace.yaml`, `docker-compose.yml`, `eslint.config.mjs`, `tailwind.config.mjs` + security-hotfix overrides  
**Inspected Files**: 24 (+ grep-свипы по всему src/)  
**Pass Status**: `BLOCKER: 0 | CRITICAL: 0 | WARNING: 2 | SUGGESTION: 3`

> **Pass 1 gate note**: `qa/signoff-report.md` отсутствует (QA-signoff — после staging, по канону ещё не прогонялся; вейвера нет). По букве команды это REJECT; ревью выполнено по явной инструкции владельца — **вердикт условный до `/speckit.qa-signoff`**, гейт зафиксирован, не обойдён молча.

---

### 1. 🚨 Critical Findings ([BLOCKER] / [CRITICAL])

Не найдено.

---

### 2. ⚠️ Performance & Reliability ([WARNING])

#### [F-01] [WARNING] (Confidence: 85/100) `status: readOnly` защищает только админ-UI, не API

- **Location:** `src/collections/SlotReservations.ts:86-98`
- **Failure Scenario:** `admin.readOnly: true` скрывает поле в админке, но Payload REST/GraphQL API по-прежнему принимает `status` в create/update-пейлоадах. Доступ к API ограничен `adminOnly` (OWNER), т.е. веткатор — только держатель OWNER-сессии (или скомпрометированная сессия), но intent F4 был «переходы только через доменный сервис», а enforcement — наполовину: владелец может дёрнуть `POST /api/slot-reservations` с `status: 'BOOKED'` в обход FSM/TTL/freeze.
- **Proposed Fix:**

```diff
     {
       name: 'status',
       type: 'select',
       required: true,
       defaultValue: 'HELD',
       options: RESERVATION_STATUS_OPTIONS,
+      access: {
+        // Airtight F4: даже OWNER не мутирует статус через API; доменный
+        // сервис в 002+ пишет через Local API (overrideAccess: true).
+        update: () => false,
+      },
       admin: {
         readOnly: true,
```

#### [F-02] [WARNING] (Confidence: 86/100) First-user OWNER takeover на свежем деплое (template-inherited)

- **Location:** `src/collections/Users/index.ts:15` (`create: publicAccess`) + `hooks/ensureFirstUserIsAdmin.ts`
- **Failure Scenario:** Шаблонная связка «публичная регистрация + первый юзер становится OWNER». Свежий VPS-деплой 001+ → сайт открыт до регистрации владельца → любой, кто первым ударит `POST /api/users`, станет **OWNER** (полный админ + роли-поле). Спека TC-001-011 закрепила поведение — риск не в коде, а в deployment-процедуре, которую бело-лейбл-шаблон обязан специфицировать.
- **Proposed Fix:** 002+: setup-token bootstrap (первый OWNER создаётся только с одноразовым токеном из env/лога) либо `create` на users → adminOnly до существования первого OWNER + runbook-пункт «владелец регистрируется до открытия публичного трафика».

---

### 3. 🧹 Architecture, Tests & Anti-Slop ([SUGGESTION])

#### [F-03] [SUGGESTION] (Confidence: 80/100) `PAYLOAD_SECRET || ''` — fail-open фоллбэк секрета подписи JWT

- **Location:** `src/payload.config.ts:85`
- **Failure Scenario:** Канон 007 fail-closed: пустой/отсутствующий секрет должен ронять бут с явной диагностикой, а не подставляться пустой строкой (поведение при пустом секрете зависит от Payload-интерналов — не верифицировано, что оно fail-closed).
- **Proposed Fix:**

```diff
-  secret: process.env.PAYLOAD_SECRET || '',
+  secret: process.env.PAYLOAD_SECRET || (() => { throw new Error('PAYLOAD_SECRET is required (fail-closed)') })(),
```

#### [F-04] [SUGGESTION] (Confidence: 80/100) Гонка первых двух регистраций → оба OWNER (template-inherited)

- **Location:** `src/collections/Users/hooks/ensureFirstUserIsAdmin.ts:12-14`
- **Failure Scenario:** Два конкурентных `create` на пустой таблице: оба читают `totalDocs === 0` → оба получают OWNER. Вероятность мизерная, но канон — CAS/уникальный guard.
- **Proposed Fix:** 002+: `find`+`create` в одной транзакции с advisory lock `users_bootstrap`, либо уникальный partial-индекс-маркер первого OWNER.

#### [F-05] [SUGGESTION] (Confidence: 80/100) `test.env` закоммичен с creds-форматом

- **Location:** `test.env` (tracked), `vitest.setup.ts`
- **Failure Scenario:** Содержит только локальные docker-дефолты (`postgres:postgres@127.0.0.1`) — утечки нет, но env-файл в git — приманка: рано или поздно туда допишут «временный» реальный ключ. Плюс `.env` в том же репо (owner-локально).
- **Proposed Fix:** Оставить tracked, но залочить comment-гвардейцем «ONLY local docker defaults; real secrets — in .env (gitignored)»; lint-греп в CI (002+): `grep -E '(SECRET|KEY)=' test.env` не должен находить непустых значений кроме NODE_OPTIONS/DATABASE_URL-localhost.

---

### Проверено и чисто (Passes 2–6, сводка)

- **Pass 2 (Security)**: sweep `'admin'` → 0 остатков; PII в новые модули не пишется (invariants/FSM — pure, без логирования); секретов в коде нет; инъекций нет (`$queryRaw`/`eval` — 0 в новом коде; `dangerouslySetInnerHTML` ×2 — template-inherited Lexical-рендер, вне диффа).
- **Pass 3 (Concurrency)**: новый код — pure-функции без разделяемого мутабельного состояния; единственная гонка — унаследованный first-user bootstrap (F-04).
- **Pass 4 (SRE)**: сетевых вызовов/небезопасных таймаутов новый код не добавляет; vitest-таймауты выставлены; unbounded-коллекций нет.
- **Pass 5 (Expand/Contract)**: 0 миграций — Payload push; GiST/advisory — осознанно 002+.
- **Pass 6 (Anti-slop)**: 70/70 int-тестов; FSM-порт 1:1 с provenance-заголовком; readability — пюровые модули с JSDoc; swallowed-catch — 0; AI-спагетти — 0.
- **Supply chain**: overrides пиннят точечные патченные версии (next 16.4.1 и др.) — 0 H/C; drizzle-kit патч ин-repo и ревьюабелен (инлайн литералов из доверенных pg-каталогов, инъекционная поверхность ~нулевая).

---

## VERDICT

```yaml
verdict: PASS
reviewer: zcode
reviewed_at: 2026-11-07T01:00:00Z (re-run after fix-review: 2026-11-07T02:00:00Z)
critical_count: 0
high_count: 0
warning_count: 2
suggestion_count: 3
gate_condition: условный до /speckit.qa-signoff (Pass 1 — signoff-report отсутствует, staging pending)
```

- **0 BLOCKER / 0 CRITICAL** → `LGTM — No high-confidence blocking risks. Ready to ship` — **при условии**: (1) F-01 закрыть в 002 (одна строка), (2) F-02 зафиксировать в deployment-runbook/спеке 002, (3) qa-signoff прогнать на staging. Рекомендация: `/speckit.fix-review` для автоматического применения F-01/F-03.

---

## Resolution round (2026-11-07, fix-review в рамках 001 — IX drift policy)

| ID | Статус | Где закрыто |
| --- | --- | --- |
| F-01 | **RESOLVED** | `SlotReservations.status`: field-level `access: { create, update: () => false }` — airtight; тест в access-roles сьюте; 002+ domain service через Local API `overrideAccess` |
| F-02 | → backlog 002 | Setup-token bootstrap — design-работа; компенсирующий контроль: runbook §4.1 (`specs/main/architecture.md`) |
| F-03 | **RESOLVED** | `PAYLOAD_SECRET` fail-throw на буте; тест: config import rejects без секрета |
| F-04 | → backlog 002 | Закрывается тем же bootstrap-токеном |
| F-05 | RESOLVED (частично) | Guard-комментарий в `test.env`; CI-греп — 002+ |

**Верификация после патчей**: validate 0 · lint 0 errors · test:int **72/72** (+2) · build 0 exit. Вердикт **PASS** подтверждён; условие qa-signoff (Pass 1) остаётся в силе до staging.

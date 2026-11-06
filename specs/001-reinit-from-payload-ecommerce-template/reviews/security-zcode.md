# Security Audit Report — 001-reinit (Payload foundation)

**Auditor**: `zcode` (security-auditor lens: STRIDE / OWASP Top 10:2025 / NIST SP 800-218 / ISO 27001)  
**Audited at**: 2026-11-07T01:10:00Z  
**Scope**: 001 implementation attack surface — roles/access, SlotReservations, payments invariants, FSM kernel, governance files, dependency overrides + drizzle-kit patch, config/env hygiene  
**Companion report**: `reviews/code-zcode.md` (общие находки F-01..F-05 — здесь только security-ракурс)

## 1. Attack surface map (DFD Level 1)

```text
[Internet] ──► (app) storefront: /shop /products/[slug] /checkout ──► Stripe (provider-side)
    │                      │ read-only published content; cart/order APIs (template)
    │                      └── guest order access via accessToken (UUID)
    ├──► (payload) /admin ──► JWT-cookie auth ──► access: OWNER-only (001)
    │        └── REST/GraphQL API ──► SlotReservations: adminOnly ×4 (fail-closed)
    ├──► /api/users create ──► PUBLIC (first-user → OWNER!) ← ⚠ SEC-1
    └──► /next/preview?previewSecret=… ──► PREVIEW_SECRET compare (!==)  ← наблюдение SEC-6
[Local only] docker PG :5432 (postgres:postgres defaults) · test.env · .env (gitignored)
```

## 2. STRIDE-матрица (001 scope)

| Threat | Поверхность | Статус | Обоснование |
| :--- | :--- | :--- | :--- |
| **S**poofing | `/admin` JWT-cookie (14d TTL, Payload core); preview route secret | ✅ сужено | Админка — OWNER-only (`hasMinimumRole`); иерархия формализована; legacy `'admin'`-строки ранг −1 (мёртвые) |
| **T**ampering | SlotReservations FSM-статусы; payments amounts | ⚠️ частично | `readOnly` — только админ-UI; API-мутация статуса доступна OWNER (SEC-2 / code F-01). Инварианты сумм — pure-модуль, применится в 004-адаптерах |
| **R**epudiation | Audit-трейл | ⏳ вне 001 | Payload audit-механика/`AuditEvent`-канон легаси — port map #7 → 002+; в 001 привилегированных мутаций, требующих трейла, кроме авторизации, нет |
| **I**nformation Disclosure | Delivery-log, PII в логах | ✅ N/A | Новый код не логирует и не хранит PII (pure-модули); deny-list логгер-канон — 002+ |
| **D**enial of Service | Публичные роуты; lockout | ⚠️ унаследовано | Rate-limiter легаси не перенесён (002+); template rate limits на checkout есть из коробки? — не верифицировано → 002+ аудит публичных роутов |
| **E**levation of Privilege | Users.create (public) → first-user OWNER | 🔴 SEC-1 | **Единственная реальная elevation-поверхность**: свежий деплой + публичный трафик до регистрации владельца = self-OWNER (см. ниже) |

## 3. Findings

### [SEC-1] [HIGH] A01 Broken Access Control — первый юзер = OWNER через публичную регистрацию (race/self-service)

- **Where**: `src/collections/Users/index.ts` (`create: publicAccess`) + first-user hook
- **Scenario**: деплой → публичный трафик до бутстрапа владельца → `POST /api/users` первым становится кто угодно → полный OWNER (в т.ч. `roles`-поле edit OWNER-only — но владелец уже он). Гонка двух первых регистраций — оба OWNER (code F-04).
- **Severity**: HIGH (CVSS-логика: privilege escalation, но требует窗口 свежего деплоя)
- **Remediation**: setup-token bootstrap (002+, канон: одноразовый токен из лога/env) или `create: adminOnly` до первого OWNER + runbook. **До 002+ — компенсирующий контроль: deployment-runbook пункт «первым действием после deploy — регистрация владельца, до открытия ingress»**.

### [SEC-2] [MEDIUM] A06/A10 — FSM-статус: fail-open через API при OWNER-компрометации

- **Where**: `SlotReservations.status` — `admin.readOnly` без field-level `access.update: () => false`
- **Scenario**: компрометация OWNER-сессии → REST-мутация статусов броней в обход FSM (double-booking окно до GiST в 002).
- **Remediation**: одна строка field-access (code F-01 diff); Local API в 002+ не задевается (`overrideAccess`).

### [SEC-3] [MEDIUM] A02 Security Misconfiguration — `PAYLOAD_SECRET || ''` фоллбэк

- **Where**: `src/payload.config.ts:85`
- **Scenario**: деплой без `PAYLOAD_SECRET` → поведение зависит от Payload-интерналов (не верифицировано fail-closed); канон проекта — явный throw на буте.
- **Remediation**: fail-throw guard (code F-03) + deployment checklist (002+).

### [SEC-4] [LOW] A03 Supply Chain — SBOM отсутствует; патч-файл — осознанный fork-риск

- **State**: overrides пиннят точечные версии (аналог lockfile-иммутабельности) ✅; drizzle-kit патч ин-repo, дифф 12 строк, ревьюабелен ✅; lockfile обновлён ✅; лицензии — MIT-периметр (Payload core MIT, eslint-config-next MIT) — AGPL/GPL-контаминации не добавлено ✅.
- **Gap**: SBOM (CycloneDX/SPDX) не генерируется — NIST SSDF gap → 002-deps (вместе с ротацией на непатченный drizzle-kit, когда апстрим починит).
- **Инъекционная поверхность патча**: литералы `${tableSchema}/${tableName}` приходят из pg-каталогов интроспекции (доверенный источник, dev-tooling) — риск ≈ 0, задокументировано.

### [SEC-5] [LOW] A04/A02 — env-гигиена

- `test.env` tracked с localhost-дефолтами (не секрет), но формат файла — приманка для будущих реальных ключей (code F-05); `.env` — gitignored ✓, `PAYLOAD_SECRET` выставлен локально ✓; docker `postgres:postgres` — dev-only, прод-деплой 002+ обязан переопределить (doc-block уже в compose).

### [SEC-6] [INFO] Hardening-бэклог (template-inherited, вне диффа — канон для 002+)

- `/next/preview` сравнивает `PREVIEW_SECRET` через `!==` — не timing-safe (канон 007 FR-707) → заменить на buffer-guard + `timingSafeEqual`.
- `dangerouslySetInnerHTML` ×2 (products page, InitTheme) — Lexical-HTML из CMS: доверенный admin-источник, но при SEC-1-компрометации — stored-XSS-вектор → sanitize-гейт при 002+.
- Payload JWT TTL 14 дней без refresh-ротации — для staff-ролей 002+ рассмотреть сокращение/ротацию.

## 4. OWASP Top 10:2025 покрытие

| Rank | Категория | Вердикт |
| :--- | :--- | :--- |
| A01 Broken Access Control | ⚠️ SEC-1 (HIGH, деплой-окно) + SEC-2 (MEDIUM) | remediation выше |
| A02 Security Misconfiguration | ⚠️ SEC-3/SEC-5 | fail-closed guard + checklist |
| A03 Supply Chain | ✅/⚠️ SEC-4 | overrides+patch ок; SBOM — 002 |
| A04 Cryptographic Failures | ✅ | HMAC в FSM-токенах — 002+; сейчас секретов в коде нет |
| A05 Injection | ✅ | 0 raw-concat в новом коде; `dangerouslySetInnerHTML` — INFO/SEC-6 |
| A06 Insecure Design | ⚠️ | SEC-1 — design-уровень шаблона, лечится bootstrap-токеном |
| A07 AuthN Failures | ✅ | Payload core (scrypt-подобный, JWT-cookie); роль-иерархия формализована |
| A08 Integrity Failures | ✅ | lockfile + точечные overrides + in-repo patch |
| A09 Logging & Alerting | ⏳ | audit-trail/deny-list — 002+ |
| A10 Exceptional Conditions | ✅ | fail-closed access на всех новых коллекциях; SEC-3 — единственный fail-open фоллбэк |

## VERDICT

```yaml
verdict: MEDIUM
auditor: zcode
audited_at: 2026-11-07T01:10:00Z
critical_count: 0
high_count: 1        # SEC-1 (deployment-window takeover; mitigation = runbook до 002+)
medium_count: 2      # SEC-2, SEC-3
low_count: 2         # SEC-4, SEC-5
info_count: 1        # SEC-6 backlog
```

**Итог**: фундамент fail-closed по построению (все новые поверхности deny-by-default), но **SEC-1 — единственная настоящая протечка**, и она лечится не кодом 001, а процедурой деплоя + bootstrap-токеном в 002. Компенсирующий контроль на сегодня: runbook-пункт «регистрация владельца до открытия ingress». Рекомендуется включить SEC-1..SEC-3 в спеку 002 (вместе с F-01 из code-review — одна и та же строка).

---

## Resolution round (2026-11-07, fix-review)

| ID | Статус | Где закрыто |
| --- | --- | --- |
| SEC-1 | MITIGATION IN PLACE / root fix → 002 | Runbook §4.1 (`architecture.md`): регистрация владельца до открытия ingress; setup-token bootstrap — backlog 002 |
| SEC-2 | **RESOLVED** | status field-access airtight (create+update false) |
| SEC-3 | **RESOLVED** | PAYLOAD_SECRET fail-throw |
| SEC-4 | Open (002-deps) | SBOM + ротация патча при апстрим-фиксе |
| SEC-5 | RESOLVED (частично) | guard-комментарий test.env; CI-греп — 002+ |
| SEC-6 | RESOLVED (частично) | PREVIEW_SECRET — timing-safe buffer-guard (canon 007); dangerouslySetInnerHTML/JWT TTL — 002+ |

Верификация: validate 0 / lint 0 / test:int 72/72 / build 0. Верdict MEDIUM подтверждён (SEC-1 mitigation, root fix 002); после setup-token bootstrap — пересмотр на PASS.

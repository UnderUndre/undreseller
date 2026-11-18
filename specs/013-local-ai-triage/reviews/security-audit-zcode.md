# SpecKit Security Audit Report: 013-local-ai-triage

**Auditor**: `zcode` (`UndeRoute/.claude/commands/speckit.security-auditor.md` — OWASP Top 10:2025, OWASP Top 10 for LLM Applications 2025, STRIDE, NIST SP 800-218 SSDF, ISO/IEC 27001:2022 8.25/8.28, GDPR / 152-ФЗ)
**Audited at**: 2026-11-18T13:00:00Z
**Scope**: Feature `013-local-ai-triage` (`fba3053..a2fd283`) + touchpoints in `undreseller`
**Pass Status**: `Critical: 0 | High: 1 | Medium: 2 | Low: 1`

---

## 1. Threat Model & Trust Boundaries (STRIDE + OWASP LLM Top 10:2025)

```text
[Untrusted Client Browser]
   │ POST /api/booking (customerNotes <= 2000 chars)
   ▼
[Next.js / Payload App Boundary (≤ 500 MB RAM)]
   │ 1. 007 Trust Gate: BookingIntents DB-only hydration on Phase 2 (anti-spoofing)
   │ 2. Async Queue: Payload Jobs (ai-triage, retries:0, deleteJobOnComplete:true)
   │ 3. PII Boundary: sanitizeForLlm (EMAIL → IBAN → PHONE → ID + XML < > escape)
   │ 4. Network Boundary: validateLocalLlmUrl + fetch(redirect:'error', timeout:60s)
   ▼
[Host GPU Runtime: LM Studio (127.0.0.1 / host.docker.internal)]
   │ Untrusted LLM Output (raw JSON / <think> / markdown)
   ▼
[Strict Parser & Deterministic Router (triagePolicy.ts)]
   │ Zero FSM / approveBooking access (LLM06 Excessive Agency = 0)
   ▼
[SlotReservations.aiTriageJson + AuditEvents (0 PII) + TelegramOutbox]
```

---

## 2. 🚨 High Findings

### [SEC-013-01] [High] (OWASP A04/LLM02 Sensitive Information Disclosure; STRIDE: I) Обход `sanitizeForLlm` через lowercase/spaced IBAN и буквенно-цифровые номера документов (cross-ref `[F-01]`)

- **Location:** `src/lib/ai/sanitizePii.ts:19-21`
- **Attack / Leak Vector:**
  1. Клиент указывает реквизиты в нижнем регистре (`ae070331234567890123456`), с пробелами (`AE07 0331 2345 6789 0123 456`) или номер паспорта/визы с буквенным префиксом без пробела (`N123456789`, `ID1234567890`).
  2. Из-за регистрозависимости `IBAN_RE` и использования `\b` в `LONG_DIGITS_RE = /\b\d{8,30}\b/g` (между ASCII-буквой и цифрой нет `\b`) идентификатор не редактируется и попадает в промпт модели и потенциально в `summary` → `telegram_outbox`.
- **Remediation:** Сделать `IBAN_RE` регистронезависимым с поддержкой одиночных пробелов/дефисов (`/\b[A-Za-z]{2}\d{2}(?:[ -]?[A-Za-z0-9]){11,30}\b/g`) и расширить `LONG_DIGITS_RE` до `/\b[A-Za-z]{0,3}\d{8,30}\b/g`.

---

## 3. ⚠️ Medium Findings

### [SEC-013-02] [Medium] (OWASP A01 SSRF / A10 Exceptional Conditions / LLM10 Unbounded Consumption; STRIDE: T/D) Path smuggling через `?`/`#` в `LOCAL_LLM_BASE_URL`, пропуск `[::]` при `allowRemote=true` и отсутствие лимита размера ответа LLM (cross-ref `[F-02]`)

- **Location:** `src/lib/ai/localLlmClient.ts:103-162, 187, 232-246`
- **Attack Vector:**
  1. При наличии `?query` или `#hash` в `LOCAL_LLM_BASE_URL` конкатенация `${baseUrl}/chat/completions` внедряет путь внутрь query/fragment.
  2. В `isUnconditionallyBlockedHost` заблокирован `0.0.0.0`, но не его IPv6-аналог `::` (`http://[::]:1234/v1`).
  3. Неограниченный `await res.json()` позволяет вредоносному/зависшему эндпоинту вызвать OOM контейнера `app` (`≤ 500 MB RAM`).
- **Remediation:** Запретить `parsed.search` и `parsed.hash` в `validateLocalLlmUrl`, добавить `normalizedHost === '::'` в безусловный блок-лист и ограничить длину тела ответа (`<= 64 KB`) перед `JSON.parse`.

### [SEC-013-03] [Medium] (OWASP LLM01 Prompt Injection / LLM02; STRIDE: I) Экранирование управляющих символов и маркеров ролей внутри `missingInfo` при выводе в Telegram

- **Location:** `src/jobs/aiTriage.ts:62-97` (`formatTriageFollowUp`)
- **Attack Vector:** В `formatTriageFollowUp` поле `record.summary` повторно прогоняется через `sanitizeForLlm(record.summary).sanitized`, однако элементы массива `record.missingInfo` вставляются напрямую (`record.missingInfo.join(', ')`). Если модель под влиянием косвенной инъекции скопирует фрагмент из заметки в `missingInfo`, он минует выходной фильтр `sanitizeForLlm`.
- **Remediation:** Прогонять каждый элемент `record.missingInfo` через `sanitizeForLlm(item).sanitized` в `formatTriageFollowUp`.

---

## 4. 📋 Low Findings

### [SEC-013-04] [Low] (OWASP A09 Logging & Alerting; STRIDE: R) Застревание `ai_triage_status` в `'pending'` / `'processing'` при сбое очереди или `SIGKILL` (cross-ref `[F-03]`)

- **Location:** `src/lib/booking/bookingService.ts:357-374`; `src/jobs/aiTriage.ts:108-120`
- **Remediation:** Сбрасывать статус при ошибке постановки задачи в очередь и разрешить перехват зависших `'processing'` строк старше 4 минут.

---

## 5. OWASP Top 10:2025 & OWASP LLM Top 10:2025 Compliance Matrix

| Category | Status | Verified Controls in `013-local-ai-triage` |
| --- | :---: | --- |
| **A01 Broken Access Control & SSRF** | **PASS (with SEC-013-02)** | `GET /api/approvals` строго `OPERATOR+`; `ownerChatIds` закрыт `adminOnlyFieldAccess`; `aiTriageStatus`/`aiTriageJson` закрыты `create/update: false`; `redirect: 'error'` + блок `169.254.0.0/16`, `fe80::/10`, `fd00:ec2::254`, `::ffff:*`. |
| **A03 Software Supply Chain** | **PASS** | `0` новых пакетов в `package.json#dependencies` и `devDependencies`; чистый `fetch`. |
| **A05 / LLM01 Prompt Injection** | **PASS** | Изоляция `<customer_note>`, экранирование `<`/`>` (`&lt;`/`&gt;`), строгая JSON Schema, `3/3` (100%) отражено на живом прогоне `gemma-4-e2b-uncensored-hauhaucs-aggressive`. |
| **LLM02 Sensitive Info Disclosure** | **HIGH (SEC-013-01)** | Телефоны, email, карты `4×4` и uppercase IBAN редактируются (`0` утечек на 26 кейсах), но lowercase/spaced IBAN и буквенно-цифровые ID требуют патча `SEC-013-01`. |
| **LLM05 Improper Output Handling** | **PASS (with SEC-013-03)** | Строгий `parseTriageExtraction` (никаких `eval`, отказ `null` при нарушении границ), параметризованный SQL. |
| **LLM06 Excessive Agency** | **PASS** | Модель физически не имеет инструментов/доступа к `approveBooking`, `bookingFsm` или платежам; маршрутизация 100% детерминирована в TypeScript. |
| **GDPR / 152-ФЗ Retention** | **PASS** | `gdprPurge.ts` обнуляет `customer_notes` и `ai_triage_json` в терминальных записях `> 90` дней; `audit_events` хранит только числа/коды без текста заметки. |

---

## VERDICT

```yaml
verdict: PASS
auditor: zcode
audited_at: 2026-11-18T13:15:00Z
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

### Remediation Verification (2026-11-18T13:15:00Z)
- `[SEC-013-01]` **RESOLVED** (`src/lib/ai/sanitizePii.ts:19-21` + тесты в `local-ai-triage.int.spec.ts`).
- `[SEC-013-02]` **RESOLVED** (`src/lib/ai/localLlmClient.ts`: запрет `?`/`#` и `::`, потоковый/буферный лимит `64 KB` + тест `>64KB`).
- `[SEC-013-03]` **RESOLVED** (`src/jobs/aiTriage.ts`: санитайз каждого элемента `missingInfo[]` в `formatTriageFollowUp` + тест).
- `[SEC-013-04]` **RESOLVED** (`bookingService.ts` + `aiTriage.ts` stale recovery + тест).

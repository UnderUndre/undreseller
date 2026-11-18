# SpecKit Code Review Report (Backend Specialist + Database Architect + Test Engineer)

**Reviewer**: `zcode` (`speckit.backend-specialist` + `speckit.database-architect` + `speckit.test-engineer` + `speckit.code-review` 6-pass pipeline)
**Reviewed at**: 2026-11-18T13:00:00Z
**Mode**: `Local Git Diff (e688c75...a2fd283)` — Feature `013-local-ai-triage`
**Inspected Files**: `24` (`src/lib/ai/*`, `src/jobs/{aiTriage,gdprPurge}.ts`, `src/lib/booking/{bookingService,intentService}.ts`, `src/app/api/{booking,approvals}/route.ts`, `src/collections/{SlotReservations,BookingIntents}.ts`, `src/globals/ShopSettings.ts`, `src/migrations/20261118_000001_local_ai_triage.ts`, `src/components/booking/SlotGrid.tsx`, `tests/int/local-ai-triage.int.spec.ts`, `scripts/eval-local-llm.ts`)
**Pass Status**: `BLOCKER: 0 | CRITICAL: 1 | WARNING: 3 | SUGGESTION: 1`

---

## 1. 🚨 Critical Findings ([BLOCKER] / [CRITICAL])

### [F-01] [CRITICAL] (Confidence: 95/100) `sanitizeForLlm` пропускает IBAN в нижнем регистре, IBAN с пробелами и номера паспортов/документов с буквенным префиксом (`ae07...`, `AE07 0331...`, `N123456789`)

- **Location:** `src/lib/ai/sanitizePii.ts:19-21, 47-68`
- **Lens:** Backend Specialist (Input Sanitization) / Security (NFR-1305 PII=0)
- **Failure Scenario:**
  1. `IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g` чувствительна к регистру и не допускает пробелов между группами по 4 символа (`AE07 0331 2345 6789 0123 456` — стандартное форматирование в банковских приложениях).
  2. Если клиент вводит IBAN строчными буквами (`"ae070331234567890123456"`) или номер паспорта/Emirates ID/визы со слитным префиксом (`"N123456789"`, `"ID1234567890"`, `"E12345678"`), не срабатывает ни `IBAN_RE`, ни `LONG_DIGITS_RE = /\b\d{8,30}\b/g`, так как в JS RegExp между ASCII-буквой (`\w`) и цифрой (`\w`) **нет границы слова `\b`**. В итоге номер документа/счёта утекает в локальную LLM без редактирования.
- **Proposed Fix:**

```diff
-const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g
+const IBAN_RE = /\b[A-Za-z]{2}\d{2}(?:[ -]?[A-Za-z0-9]){11,30}\b/g
 const CARD_4X4_RE = /\b(?:\d{4}[ -]){3}\d{4}\b/g
-const LONG_DIGITS_RE = /\b\d{8,30}\b/g
+const LONG_DIGITS_RE = /\b[A-Za-z]{0,3}\d{8,30}\b/g
```

---

## 2. ⚠️ Performance, Reliability, DB & Concurrency ([WARNING])

### [F-02] [WARNING] (Confidence: 90/100) Неограниченное чтение тела ответа `res.json()` в `localLlmClient.ts` и отсутствие очистки `search`/`hash` в `validateLocalLlmUrl`

- **Location:** `src/lib/ai/localLlmClient.ts:154-162, 187, 232-246`
- **Lens:** Backend Specialist (SRE / Resource Boundaries) & Security
- **Failure Scenario:**
  1. `validateLocalLlmUrl` возвращает `trimmed.replace(/\/+$/, '')`. Если в `LOCAL_LLM_BASE_URL` задан query или fragment (`http://127.0.0.1:1235/v1?foo=bar`), конкатенация `${baseUrl}/chat/completions` превращает путь `/chat/completions` в часть query-строки (`?foo=bar/chat/completions`).
  2. `await res.json()` читает ответ без верхнего лимита байт: если сбойный локальный сервер или неверно указанный порт стримит бесконечный вывод, буферизация в памяти нарушит инвариант `app ≤ 500 MB RAM` (`NFR-1304`).
- **Proposed Fix:**

```diff
+  if (parsed.search || parsed.hash) {
+    throw new LocalLlmError('INVALID_URL', 'Query strings and fragments are not allowed in LOCAL_LLM_BASE_URL')
+  }
```
И заменить `await res.json()` на чтение текста с проверкой размера (`MAX_RESPONSE_CHARS = 65_536`).

---

### [F-03] [WARNING] (Confidence: 88/100) Зависание `ai_triage_status` в `'pending'` при сбое `payload.jobs.queue` и отсутствие lease-recovery для `'processing'` при рестарте контейнера

- **Location:** `src/lib/booking/bookingService.ts:357-374`; `src/jobs/aiTriage.ts:108-120`
- **Lens:** Database Architect & Backend Specialist (State Hygiene / Crash Recovery)
- **Failure Scenario:**
  1. В `bookingService.ts` сначала выполняется `UPDATE slot_reservations SET ai_triage_status = 'pending'`, и только затем `await payload.jobs.queue(...)`. Если `payload.jobs.queue` бросит исключение, запись останется в `'pending'` навсегда без задачи в `payload_jobs`.
  2. В `runAiTriageJob` CAS-claim захватывает только `ai_triage_status = 'pending'`. Если процесс `app` получит `SIGTERM`/`SIGKILL` во время 60-секундного ожидания LM Studio, запись навсегда останется в `ai_triage_status = 'processing'`.
- **Proposed Fix:**
  1. В `bookingService.ts` при попадании в `catch (triageErr)` откатывать `ai_triage_status = 'failed'` (или `'skipped'`).
  2. В `aiTriage.ts` разрешить CAS-claim для `(ai_triage_status = 'pending' OR (ai_triage_status = 'processing' AND updated_at < now() - interval '4 minutes'))`.

---

### [F-04] [WARNING] (Confidence: 85/100) В `tests/int/local-ai-triage.int.spec.ts` (`TC-013-022`) отсутствует позитивный тест `200 OK` для `GET /api/approvals` от имени `OPERATOR`

- **Location:** `tests/int/local-ai-triage.int.spec.ts:442-466`
- **Lens:** Test Engineer (Contract Coverage)
- **Failure Scenario:** Тест проверяет только `403` без авторизации и приватность гостевого `GET /api/booking/[id]`, но не проверяет, что авторизованный `OPERATOR` реально получает `customerNotes`, `aiTriageStatus: 'done'` и объект `aiTriage` в массиве `approvals`.
- **Proposed Fix:** Добавить в `TC-013-022` вызов `GET /api/approvals` с JWT-cookie пользователя роли `OPERATOR` и проверить наличие `customerNotes`, `aiTriageStatus === 'done'` и `aiTriage.route === 'ESCALATE_OWNER'`.

---

## 3. 🧹 Architecture, DB & Anti-Slop ([SUGGESTION])

### [F-05] [SUGGESTION] (Confidence: 82/100) Повторное чтение `shop-settings` и `products` внутри `runAiTriageJob`

- **Location:** `src/jobs/aiTriage.ts:135-156`
- **Lens:** Database Architect (Query Efficiency)
- **Failure Scenario:** В `runAiTriageJob` сначала делается `UPDATE slot_reservations ... RETURNING id, customer_notes, item_id`, а затем отдельный `payload.findByID({ collection: 'products' })` для получения `title`. Поскольку `aiTriage` выполняется асинхронно и штучно на бронь, N+1 в горячем цикле нет, но `serviceName` можно получать одним SQL-запросом или оставить как есть с учётом низкой частоты вызовов.

---

## 4. Specialist Checklists Summary

| Specialist Lens | Verdict | Key Verification Notes |
| --- | :---: | --- |
| **Backend Specialist** (`speckit.backend-specialist`) | **MEDIUM** | Слои разделены (`route.ts` → `bookingService`/`intentService` → `aiTriage` job → pure `src/lib/ai/*`); `0` новых зависимостей; все SQL параметризованы; `F-01`..`F-03` требуют точечной правки. |
| **Database Architect** (`speckit.database-architect`) | **PASS** | Миграция `20261118_000001_local_ai_triage.ts` строго Expand-only (`ADD VALUE IF NOT EXISTS`, `DO $$ CREATE TYPE`, `ADD COLUMN IF NOT EXISTS`, 4-колоночная `shop_settings_owner_chat_ids` с FK и 2 B-tree индексами, полный `down()`); `gdprPurge.ts` объединён в один `UPDATE` без ловушки `updated_at = now()`. |
| **Test Engineer** (`speckit.test-engineer`) | **PASS (with F-04)** | `211/211` int-тестов зелёные + живой 26-кейсовый `pnpm eval:ai` на `gemma-4-e2b-uncensored-hauhaucs-aggressive` (`100%` schema/routing/injection, `0` PII leaks); рекомендуется дописать позитивный `OPERATOR` ассерт в `TC-013-022` (`F-04`). |

---

## VERDICT

```yaml
verdict: PASS
reviewer: zcode
reviewed_at: 2026-11-18T13:15:00Z
critical_count: 0
high_count: 0
warning_count: 0
suggestion_count: 1
```

### Remediation Verification (2026-11-18T13:15:00Z)
- `[F-01]` **RESOLVED**: `IBAN_RE` сделан регистронезависимым с поддержкой пробелов/дефисов, `LONG_DIGITS_RE` покрывает 0–3 ведущих буквенных префикса (`ae07...`, `AE07 0331...`, `N123456789`, `ID1234567890`) в `src/lib/ai/sanitizePii.ts:19-21`.
- `[F-02]` **RESOLVED**: `validateLocalLlmUrl` отклоняет `?query`/`#hash` и `::`, `callChatCompletion` ограничивает чтение тела 64 КБ в `src/lib/ai/localLlmClient.ts`.
- `[F-03]` **RESOLVED**: откат `ai_triage_status = 'failed'` при сбое `payload.jobs.queue` в `src/lib/booking/bookingService.ts`; 4-минутное восстановление зависших `'processing'` записей в `src/jobs/aiTriage.ts`.
- `[F-04]` **RESOLVED**: добавлен позитивный тест `200 OK` для `OPERATOR` в `tests/int/local-ai-triage.int.spec.ts` (`212/212` int-тестов PASS, `tsc` 0, `eslint` 0).

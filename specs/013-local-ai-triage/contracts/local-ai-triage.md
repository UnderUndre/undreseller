# Interface Contracts: 013-local-ai-triage

**Date**: 2026-11-18

---

## 1. Public HTTP API Delta: `POST /api/booking`

- **Request body (additive optional field)**:
  ```json
  {
    "productId": "1",
    "start": "2026-12-01T10:00:00.000Z",
    "customerName": "Ivan Petrov",
    "customerPhone": "+971501234567",
    "customerEmail": "ivan@example.com",
    "customerNotes": "Протекает сифон под раковиной, ориентир 600 AED"
  }
  ```
- **Validation**:
  - `customerNotes` optional (`undefined | null | string`); non-string (например, number/object) → `400 VALIDATION_FAILED`.
  - После `.trim()`: если пустая строка → нормализуется к `null`; если `length > 2000` → `400 VALIDATION_FAILED`.
  - В 2-фазном OTP-потоке `customerNotes` читается **только** на фазе 1 (сохраняется в `booking_intents`); на фазе 2 (`intentId + otp`) гидратируется из `booking_intents` (тело запроса игнорируется).
- **Response**: без изменений (`202` на OTP-инициализации / `201` на создании брони; не раскрывает `aiTriageJson`).

---

## 2. Staff HTTP API Delta: `GET /api/approvals` (`OPERATOR+`)

- **Auth**: `hasMinimumRole(user.roles, 'OPERATOR')`, иначе `403 FORBIDDEN`.
- **Response element delta**:
  ```json
  {
    "reservationId": 42,
    "order": 42,
    "start": "2026-12-01T10:00:00.000Z",
    "end": "2026-12-01T11:00:00.000Z",
    "customerName": "Ivan Petrov",
    "customerPhone": "+971501234567",
    "scheduleVersion": 1,
    "customerNotes": "Протекает сифон под раковиной, ориентир 600 AED",
    "aiTriageStatus": "done",
    "aiTriage": {
      "category": "maintenance",
      "estimatedAmount": 600,
      "currency": "AED",
      "urgency": "low",
      "missingInfo": ["photo_before"],
      "summary": "Замена сифона под раковиной, ориентир 600 AED",
      "confidence": 0.92,
      "route": "DELEGATE_OPERATOR",
      "targetRole": "OPERATOR",
      "reasons": ["within_delegation_limit"]
    }
  }
  ```

---

## 3. External Local Runtime Contract: LM Studio (`/v1/chat/completions`)

- **Endpoint**: `POST ${LOCAL_LLM_BASE_URL}/chat/completions` (`fetch` option `redirect: 'error'` — F2)
- **SSRF Validation (`validateLocalLlmUrl`)**:
  - Схемы: только `http:` или `https:`; наличие `url.username || url.password` → отказ `REMOTE_LLM_FORBIDDEN`.
  - Нормализация hostname: `url.hostname.replace(/^\[|\]$/g, '').toLowerCase()` (корректно обрабатывает IPv6 `[::1]` в Node.js WHATWG `URL`).
  - Безусловный deny-list (даже при `LOCAL_LLM_ALLOW_REMOTE=true`): `0.0.0.0`, `169.254.0.0/16` (cloud metadata), `fe80::/10` (IPv6 link-local), `fd00:ec2::254`, IPv4-mapped IPv6 `::ffff:...`.
  - По умолчанию (`LOCAL_LLM_ALLOW_REMOTE !== 'true'`): разрешены только `localhost`, `127.0.0.0/8`, `::1`, `host.docker.internal`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer ${LOCAL_LLM_API_KEY || 'lm-studio'}`
- **Prompt Delimiter Isolation (F6)**:
  - В `SANITIZED_TEXT` все угловые скобки `<` и `>` заменены на `&lt;` и `&gt;` внутри `sanitizeForLlm`, поэтому пользовательский ввод не может закрыть тег `</customer_note>`.
- **Persisted Record Type (`AiTriageRecord` — F7)**:
  - В `slot_reservations.ai_triage_json` сохраняется и в `GET /api/approvals` отдаётся единый слитый объект `AiTriageRecord = TriageExtraction & TriageRouteDecision` (`category`, `estimatedAmount`, `currency`, `urgency`, `missingInfo`, `summary`, `confidence`, `route`, `targetRole`, `reasons`).
  - Любое нарушение ограничений схемы в `parseTriageExtraction` (`missingInfo.length > 5`, длина элемента `> 120`, `summary.length > 240`, `estimatedAmount < 0`, `confidence` вне `[0, 1]`) строго возвращает `null` без обрезки (F8).
- **Request JSON**:
  ```json
  {
    "model": "${LOCAL_LLM_MODEL || 'local-model'}",
    "temperature": 0.1,
    "max_tokens": 350,
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "booking_triage",
        "strict": true,
        "schema": {
          "type": "object",
          "additionalProperties": false,
          "required": ["category", "estimatedAmount", "currency", "urgency", "missingInfo", "summary", "confidence"],
          "properties": {
            "category": { "type": "string", "enum": ["maintenance", "out_call", "handover", "billing", "general", "unknown"] },
            "estimatedAmount": { "type": ["number", "null"] },
            "currency": { "type": ["string", "null"], "enum": ["AED", "USD", "RUB", "EUR", null] },
            "urgency": { "type": "string", "enum": ["low", "medium", "high"] },
            "missingInfo": { "type": "array", "items": { "type": "string" }, "maxItems": 5 },
            "summary": { "type": "string", "maxLength": 240 },
            "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
          }
        }
      }
    },
    "messages": [
      { "role": "system", "content": "<SYSTEM_PROMPT_WITH_INJECTION_GUARD>" },
      { "role": "user", "content": "Service: ...\n<customer_note>\n{SANITIZED_TEXT}\n</customer_note>" }
    ]
  }
  ```
- **Failure modes**:
  - `REMOTE_LLM_FORBIDDEN`: публичный URL без `LOCAL_LLM_ALLOW_REMOTE=true` → 0 HTTP-запросов.
  - HTTP `4xx/5xx`, `AbortError`/`TimeoutError`, `ECONNREFUSED` → `ai_triage_status = 'failed'`, fallback message.
  - Невалидный JSON / схема → 1 retry с `temperature: 0.0` → иначе `ai_triage_status = 'failed'`.

---

## 4. Telegram Outbox Follow-up Contract (`telegram_outbox`)

- **Success (`DELEGATE_OPERATOR`)**:
  ```text
  🟢 AI Triage · OPERATOR (≤ 1500 AED) · Booking #42
  📂 maintenance · 💰 600 AED · 🎯 92%
  📝 Замена сифона под раковиной, ориентир 600 AED
  ❓ Missing: photo_before
  ```
- **Escalation (`ESCALATE_OWNER`)**:
  ```text
  🔴 AI Triage · OWNER ESCALATION · Booking #42
  📂 maintenance · 💰 2800 AED · ⚡ high · 🎯 88%
  📝 Прорвало трубу, требуется выезд аварийной бригады
  📌 Reasons: amount_exceeds_limit, urgency_high
  ```
- **Fallback (`failed`)**:
  ```text
  ⚠️ AI Triage unavailable for Booking #42 — manual review required
  ```

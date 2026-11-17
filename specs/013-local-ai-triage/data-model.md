# Data Model & Schema Evolution: 013-local-ai-triage

**Date**: 2026-11-18 · **Strategy**: Expand-only (Constitution Principle X)

---

## 1. Entities & Field Classification

### 1.1. `SlotReservations` (`slot_reservations`) — MOD

| Field (TS) | Column (SQL) | Type | Nullable / Default | Classification | Access / Write Guard |
| --- | --- | --- | --- | --- | --- |
| `customerNotes` | `customer_notes` | `text` (`varchar(2000)` / `text`) | `NULL` | **PII / Confidential** (client input) | Collection CRUD `adminOnly`; публичный write только через `POST /api/booking` (≤ 2000 chars); `GET /api/booking/[id]` не экспонирует |
| `aiTriageStatus` | `ai_triage_status` | `enum_slot_reservations_ai_triage_status` (`pending \| processing \| done \| skipped \| failed`) | `DEFAULT 'skipped'` | **Internal** | Field-level `create: false, update: false`; пишут только `bookingService` и `aiTriage` job |
| `aiTriageJson` | `ai_triage_json` | `jsonb` (`AiTriageRecord = TriageExtraction & TriageRouteDecision`) | `NULL` | **Internal** (structured summary без raw PII) | Field-level `create: false, update: false`, `admin.readOnly: true` |

### 1.2. `BookingIntents` (`booking_intents`) — MOD

| Field (TS) | Column (SQL) | Type | Nullable / Default | Classification | Access / Write Guard |
| --- | --- | --- | --- | --- | --- |
| `customerNotes` | `customer_notes` | `text` | `NULL` | **PII / Confidential** | Collection `create: false, update: false` (пишет только `intentService` raw SQL на фазе 1; фаза 2 гидратирует из БД) |

### 1.3. `ShopSettings` (`shop_settings` global + `shop_settings_owner_chat_ids`) — MOD

| Field (TS) | Column / Table | Type | Default | Classification | Access |
| --- | --- | --- | --- | --- | --- |
| `aiTriageEnabled` | `ai_triage_enabled` | `boolean` | `true` | Internal Config | `OWNER` update; read internal/global |
| `aiDelegationLimit` | `ai_delegation_limit` | `numeric` | `1500` | Internal Policy | `OWNER` update |
| `aiDelegationCurrency` | `ai_delegation_currency` | `enum_shop_settings_ai_delegation_currency` (`AED \| USD \| RUB \| EUR`) | `'AED'` | Internal Policy | `OWNER` update |
| `aiMinConfidence` | `ai_min_confidence` | `numeric` | `0.8` | Internal Policy | `OWNER` update |
| `ownerChatIds` | `shop_settings_owner_chat_ids` (`_order integer NOT NULL`, `_parent_id integer NOT NULL`, `id varchar PRIMARY KEY NOT NULL`, `chat_id varchar NOT NULL` + `_order_idx`, `_parent_id_idx`) | array | `[]` | **PII** (Telegram chat IDs) | `adminOnlyFieldAccess` (read & update строго `OWNER`) |

### 1.4. `AuditEvents` (`audit_events`) — REUSE (без DDL изменений)

Новые типы событий (`action`):
- `ai.triage.completed` — `actor_id = 'SYSTEM:ai-triage'`, `aggregate_type = 'BOOKING'`, `aggregate_id = String(reservationId)`, `metadata_json = { model, latencyMs, route, category, confidence, redactedPiiCount }` (**0 raw text, 0 PII**).
- `ai.triage.fallback` — `actor_id = 'SYSTEM:ai-triage'`, `aggregate_type = 'BOOKING'`, `aggregate_id = String(reservationId)`, `metadata_json = { errorCode, latencyMs, redactedPiiCount }`.
- `ai.triage.ssrf_blocked` — `actor_id = 'SYSTEM:ai-triage'`, `metadata_json = { errorCode: 'REMOTE_LLM_FORBIDDEN' }` (без утечки секретных токенов).

---

## 2. State Transitions (`ai_triage_status`)

```text
createBooking() (strictly AFTER PREPAID/DEPOSIT createPaymentIntent succeeds):
  ├─ [notes non-empty AND localLlmConfigured AND aiTriageEnabled] ──► 'pending' ──(enqueue ai-triage)
  └─ [otherwise] ───────────────────────────────────────────────────► 'skipped' (terminal)

aiTriage job (retries: 0, deleteJobOnComplete: true):
  'pending' ──[CAS UPDATE ... WHERE ai_triage_status = 'pending' AND status IN ('HELD','BOOKED','PENDING_APPROVAL')]──► 'processing'
     ├─ [if booking already 'RELEASED' at claim] ───► 'skipped' (no LLM call, no outbox)
     ├─ [LM Studio valid JSON + schema pass] ───────► 'done'   (writes AiTriageRecord to ai_triage_json + audit; enqueues outbox ONLY if status <> 'RELEASED')
     └─ [SSRF / network / timeout / 5xx / invalid JSON]► 'failed' (writes audit; enqueues outbox fallback ONLY if status <> 'RELEASED')
```

> **Инвариант**: `SlotReservations.status` (FSM `HELD | BOOKED | PENDING_APPROVAL | RELEASED`) **не имеет ни одного перехода** из контура `ai-triage`.

---

## 3. 4-Phase Expand/Contract Migration Strategy (Principle X)

1. **Phase 1 (Expand — реализуется в 013)**:
   - В существующие PG enum'ы `enum_payload_jobs_task_slug` и `enum_payload_jobs_log_task_slug` добавляется значение `'ai-triage'` через `ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'ai-triage'` и `ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'ai-triage'` (исключает ошибку `22P02` при `payload.jobs.queue({ task: 'ai-triage' })` — F1).
   - Создаются идемпотентные PG enum'ы `enum_slot_reservations_ai_triage_status` (`'pending', 'processing', 'done', 'skipped', 'failed'`) и `enum_shop_settings_ai_delegation_currency` (`'AED', 'USD', 'RUB', 'EUR'`) через `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` — 100% паритет с Payload `type: 'select'` и Drizzle schema-push (F1).
   - Все новые колонки добавляются с `ADD COLUMN IF NOT EXISTS`: `NULL` (или `DEFAULT 'skipped'` / `DEFAULT true` / `1500` / `'AED'` / `0.8` для конфигов).
   - Таблица `shop_settings_owner_chat_ids` создаётся с `CREATE TABLE IF NOT EXISTS` и точным набором системных колонок Payload array (`"_order" integer NOT NULL, "_parent_id" integer NOT NULL, "id" varchar PRIMARY KEY NOT NULL, "chat_id" varchar NOT NULL`), FK `shop_settings_owner_chat_ids_parent_id_fk` (`ON DELETE CASCADE`) и индексами `shop_settings_owner_chat_ids_order_idx`, `shop_settings_owner_chat_ids_parent_id_idx` (F1).
   - Обратная совместимость $N / N-1$: старый код игнорирует новые nullable колонки, новый код толерантен к `NULL` в старых строках.
2. **Phase 2 (Dual-Write)**: Не требуется (новых колонок раньше не существовало; старые строки остаются с `customer_notes = NULL`, `ai_triage_status = 'skipped'`).
3. **Phase 3 (Backfill / Retention)**: Не требуется исторический backfill; `gdprPurge` обнуляет `customer_notes = NULL` и `ai_triage_json = NULL` внутри **единого** `UPDATE slot_reservations` для терминальных (`status = 'RELEASED'`) записей `> 90` дней с условием `AND (customer_name <> 'Anonymized Client' OR customer_notes IS NOT NULL OR ai_triage_json IS NOT NULL)` (F5).
4. **Phase 4 (Contract)**: Не применимо (удаляемых старых колонок нет).
5. **Rollback (`down()`)**:
   - Идемпотентные `DROP TABLE IF EXISTS "shop_settings_owner_chat_ids" CASCADE;`, `ALTER TABLE ... DROP COLUMN IF EXISTS ...` и `DROP TYPE IF EXISTS "public"."enum_slot_reservations_ai_triage_status"; DROP TYPE IF EXISTS "public"."enum_shop_settings_ai_delegation_currency";` строго по новым объектам 013 (012 и более ранние таблицы не затрагиваются).

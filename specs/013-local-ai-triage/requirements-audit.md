# Requirements Audit Report: 013-local-ai-triage

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #1 + re-audit addendum rev 1.1 after antigravity F1–F8)
- **Audit Date**: 2026-11-18
- **Audited**: `specs/013-local-ai-triage/spec.md` rev 1.1 (`FR-1301..1308`, `NFR-1301..1306`, `SC-001..005`)

---

### 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- Обнаружено нарушений: **0**.
- Все требования квантованы детерминированными порогами и метриками:
  - `FR-1302`: длина `customerNotes` в `0..2000` символов после `trim()`; `> 2000` → `400 VALIDATION_FAILED`; постановка `ai-triage` строго после успешного `createPaymentIntent` (F3).
  - `FR-1303`: проходы `EMAIL` → `IBAN` (`[A-Z]{2}\d{2}[A-Z0-9]{11,30}`) → `PHONE` → `ID` (`8..30` цифр и `4×4` группы с защитой дат и диапазонов цен) + экранирование `<`/`>` (`&lt;`/`&gt;`); счётчик `redactedCount`; `PII Leak Count = 0` (`NFR-1305`, F4, F6).
  - `FR-1304`: таймаут `LOCAL_LLM_TIMEOUT_MS` default `8000 ms`, диапазон `1000..30000 ms`; `redirect: 'error'`; SSRF-разрешение строго loopback (`[::1]` нормализован) / `host.docker.internal` / RFC1918 + безусловный запрет `169.254.0.0/16`/link-local/credentials (F2).
  - `FR-1305`: `estimatedAmount` в `[0, 10_000_000]`, `confidence` в `[0, 1]`, `missingInfo` ≤ 5 элементов по ≤ 120 символов, `summary` ≤ 240 символов (строгий `return null` при выходе за границы — F8); детерминированное правило из 5 конъюнктивных условий для `DELEGATE_OPERATOR`; объединённый тип `AiTriageRecord` (F7).
  - `FR-1306`: `retries: 0`, `deleteJobOnComplete: true`; максимум `1` retry на невалидный JSON при `temperature: 0`; claim и финализация требуют `status IN ('HELD','BOOKED','PENDING_APPROVAL')`; `priority: 40` в `telegram_outbox` (F3, F7).
  - `FR-1307`: единый `UPDATE slot_reservations` для очистки `customer_notes` и `ai_triage_json` терминальных записей старше `90` дней (F5).
  - `FR-1308` / `SC-004`: `≥ 25` eval-кейсов; порог `Schema Compliance >= 90%`, `PII Leaks = 0`.
  - `NFR-1301..1304`: `0` новых runtime-зависимостей, `0` LLM-вызовов в `POST /api/booking` (`overhead < 5 ms`) и `GET /api/availability` (`p95 < 50 ms`), `app ≤ 500 MB RAM`, `0` контейнеров в `docker-compose.yml`.

### 2. Матрица конфликтов (Gate 2: Consistency Cross-Check)

| ID 1 | ID 2 | Суть потенциального конфликта | Вердикт |
| :--- | :--- | :--- | :--- |
| FR-1302 (`customerNotes` на фазе 1/2) | 007 F5 (игнор тела запроса на фазе 2 OTP) | Риск подмены заметок на шаге подтверждения OTP | ✅ Разрешено: заметка пишется в `booking_intents` на фазе 1 и гидратируется в `createBooking` строго из БД на фазе 2 |
| FR-1306 (`ai-triage` job) | `bookingFsm.ts` (единственный status-writer) | Риск самовольного перевода брони в `BOOKED`/`RELEASED` моделью | ✅ Изолировано: Via Negativa §1.3 запрещает вызов `approveBooking`; джоба пишет только `ai_triage_status` и `ai_triage_json` |
| FR-1307 (`gdprPurge` > 90 дней) | `AuditEvents` (append-only журнал) | Конфликт удаления PII и неизменяемости аудита | ✅ Согласовано: в `audit_events` пишутся только технические метаданные без текста заметки и PII; обнуляются поля в `slot_reservations` |
| FR-1304 (SSRF fail-closed) | FR-1308 (`pnpm eval:ai` против LM Studio) | Блокировка локального подключения | ✅ Согласовано: `127.0.0.1`, `localhost`, `::1`, `host.docker.internal` и RFC1918 разрешены при `allowRemote=false` |
| FR-1306 (Telegram follow-up) | 008 F-BE-13 (пустые chatId) | Мёртвые строки в `telegram_outbox` без настроенных чатов | ✅ Согласовано: при пустых `ownerChatIds`/`staffChatTargets` enqueue пропускается тихо |

### 3. Анализ полноты (Gate 3: Completeness & Boundary Coverage)

- **Edge-cases**: **ДА** (покрыты prompt injection, `<think>`/markdown в ответе модели, дубли джобы через `pending -> processing` CAS, таймаут `> 8000 ms`, пустой `customerNotes`, пустые чаты, отсутствие `LOCAL_LLM_BASE_URL`, приватность `/api/booking/[id]`).
- **Fallback-стратегии**: **ДА** (fail-open на человека при отсутствии URL, сетевом отказе, 5xx, таймауте и исчерпании retry).
- **Границы коллекций и строк**: `N=0` (пустая строка / нет `missingInfo`), `N=1`, `N=MAX` (`2000` символов, `5` элементов `missingInfo`, `1500` порог делегирования) зафиксированы явно.

### 4. Однозначность терминологии (Gate 4: Unambiguity)

- Единый словарь: `customerNotes` (API/UI/коллекция) ↔ `customer_notes` (SQL), `aiTriageStatus` (`pending | processing | done | skipped | failed`), `TriageRouteDecision` (`DELEGATE_OPERATOR | ESCALATE_OWNER`), роли (`OWNER`, `OPERATOR`, `PERFORMER`, `customer`).
- Нарушений: **0**.

### 5. Итоговый статус гейта

- **GATE VERDICT**: **PASS**
- **Business plan**: `Business plan: unchanged` (см. [`business-plan-waiver.md`](./business-plan-waiver.md)).
- **Next step**: `/speckit.plan` (генерация `plan.md`, `research.md`, `data-model.md`, `contracts/local-ai-triage.md`, `quickstart.md` и обновление `specs/main/architecture.md`).

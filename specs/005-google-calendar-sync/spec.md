# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `005-google-calendar-sync`
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001–004
**Статус:** **DRAFT — REVISION 1.0 (2026-11-07; sketch — port-map #10, единственная бизнес-интеграция плана v2.5.0 §2.3 — лимит «≤1» расходуется здесь)**
**Source of truth по бизнесу:** план v2.5.0 §2.3 · **легаси-канон:** 006-integrations (review zcode F1–F10 resolution round — самый вылизанный контур линии)

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Мастер живёт в Google Calendar; бронь, которой нет в GC, — это двойная бронь через внешний канал (телефон/личка). freeBusy-импорт внешней занятости + push наших броней = kill двойных броней с обеих сторон стояка (главная боль ICP по плану §1.1).

### 1.2. Решение

Двусторонняя sync per-resource: **push** наших броней в GC мастера (FSM→GC decision table, идемпотентный upsert) + **import** внешней занятости (freeBusy/syncToken → `ExternalBusyBlock` → вычитание в availability engine 002). OAuth-токены — AES-256-GCM vault.

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO SECOND INTEGRATION:** закон «≤1» — исчерпан GC (план v2.5.0).
* ❌ **NO CalDAV / ICS-only fallback:** отвергнуты брейнштормом (канон легаси Option 1).
* ❌ **NO BIDIRECTIONAL EDIT:** GC-правки мастером **не мутируют** наши брони (только import занятости); встречные правки — runbook-ограничение.
* ❌ **NO CRON-BY-HAND:** sweeps только через планировщик 003 (D-решение).

---

## 2. User Stories (Prioritized)

### US1 — OAuth connect + credential vault (P0)

OWNER подключает GC per-resource (`/admin` → connect → OAuth consent) → токены в `IntegrationCredential` (AES-256-GCM через secretVault-канон: `v1:<iv>:<tag>:<ct>`); `NEEDS_REAUTH`-статус + staff alert при invalid_grant; disconnect = wipe токена + sync-состояния.

**Acceptance**: plaintext-токенов в БД 0 (grep + тест vault roundtrip); reauth-флоу самовосстанавливается после повторного consent.

### US2 — Push: FSM→GC decision table (P0)

FSM-переходы брони (CONFIRMED/RELEASED/CANCELLED из 002/003) → `CREATE/PATCH/DELETE` через decision table (порт `gcalMapping.ts`); идемпотентный upsert с `extendedProperties.private.undresellerOrderId` (self-event filter — свой ивент не импортируем как busy); delete 404/410 = NOOP; async через outbox-канон (fail-open — GC-сбой не ломает бронь, SC-006 канон).

**Acceptance**: replay любого FSM-перехода → идемпотентный результат (0 дублей событий); PATCH на внешне удалённое → re-CREATE (легаси F3).

### US3 — Import: внешняя занятость (P0)

Initial full-sync (`timeMin + singleEvents + showDeleted` → `nextSyncToken`, канон легаси F1-фикса: рекуррентные события как expanded instances) → инкрементал чистым `syncToken`; busy-интервалы → `ExternalBusyBlock` → вычитание в `availability engine` (002 US4).

**Acceptance**: рекуррентное «каждый пн 10:00» даёт экземплярные блоки; слот внутри внешнего busy — недоступен; GC-side удаление снимает блок.

### US4 — Reconcile sweep + rate-limit гигиена (P1)

15-мин reconcile: re-push BOOKED в окне 7 дней (`updatedAt asc`, take 50 — канон 007 F-хвост); session-level `pg_advisory_lock` на sync-цикл (легаси F4); 429 → экспоненциальный бэкофф (RateLimitedError-таксономия).

**Acceptance**: 60 броней после простоя дренируются циклами по 50 без 429-шторма; сменившийся syncToken → автоматический full-sync re-bootstrap.

---

## 3. Edge Cases

- **Инвентарь owner'а в другом TZ**: GC-события UTC, слоты — TZ инстанса; конверсия на границе (тест DST-окна).
- **Несколько ресурсов = несколько календарей**: credential per-resource; instance-wide fallback для соло (`NULLS NOT DISTINCT` — канон zcode F2-rev).
- **GC 429/403 quota**: бэкофф + счётчик; не валяет бронь (fail-open канон).
- **Токен отозван владельцем Google**: NEEDS_REAUTH + alert, брони живут без push (degradation mode).
- **Удаление credential при живых событиях**: disconnect = wipe локально; GC-события — известное ограничение (runbook, легаси F10).

## 4. Requirements

### Functional Requirements
- **FR-501 (Vault)**: OAuth-токены per-resource AES-256-GCM; 0 plaintext; NEEDS_REAUTH-статус-машина.
- **FR-502 (Push)**: decision table FSM→GC, upsert-идемпотентность, self-filter, 404/410-NOOP, fail-open.
- **FR-503 (Import)**: full-sync bootstrap + syncToken инкрементал; ExternalBusyBlock → availability вычитание; recurrence → instances.
- **FR-504 (Reconcile)**: 15-min sweep, окно 7d asc take 50, session advisory lock, rate-limit бэкофф.
- **FR-505 (Multi-resource)**: credential per-resource + instance-wide solo fallback.

### Non-Functional Requirements
- **NFR-501**: регрессия 72+ зелёная; новые ≥20 (decision table матрица, vault roundtrip, syncToken bootstrap, NOOP-идемпотентность).
- **NFR-502**: googleapis-пакет — **единственный новый dep** спеки (обоснование в плане; альтернатива raw-REST — план решает).
- **NFR-503**: 0 plaintext-креденшелов (PCI DSS Req 10 / ISO 27001 канон); ≤500 MB.

## 5. Success Criteria

- **SC-001**: push-идемпотентность — 0 дублей GC-событий на 100 FSM-replay.
- **SC-002**: внешний busy-блок исключает слот в availability (end-to-end тест).
- **SC-003**: reauth-цикл (revoke → NEEDS_REAUTH → re-consent → восстановление push) зелёный.
- **SC-004**: reconcile-дренаж 60 броней без дублей/429-шторма.

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: googleapis SDK vs raw REST | **googleapis** (дефолт) vs raw — план решает по бандлу | Raw-REST = 0-dep, но ручной OAuth-танец |
| Q2: Meet-ссылки | `remoteMeetingEnabled` per-item (легаси-канон), meetLink хранится на Order | ICP-опция, не ядро |
| Q3: GC-правки мастера | Не мутируют брони (только busy-import) | Via Negativa; bidirectional — отвергнут |
| Q4: Offline-доступ токенов | refresh_token + авто-refresh, onTokensRefreshed → vault | Канон легаси F6 |

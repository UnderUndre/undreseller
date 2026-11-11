# Requirements Audit Report: 008-audit-hardening

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #1)
- **Audit Date**: 2026-11-12
- **Audited**: specs/008-audit-hardening/spec.md rev 1.0 (`405bfa3`)

### 1. Стоп-слова и неквантованные метрики (Гейт 1)

- Обнаружено нарушений: **0 блокирующих / 2 примечания**.
- «честный экран» (US6d) и «честное сообщение» (US5) — формулировка не числовая, но acceptance квантует поведение: «экран ошибки с кнопкой повтора отображается при любом не-2xx» (бинарный, детерминированный pass/fail). Принято как verifiable-behavioral, не stop-word.
- Все NFR квантованы: NFR-801 ≥25 тестов; NFR-803 ≤5 мин fresh-deploy + 0 ошибок повторного migrate; NFR-804 0 BLOCKER/CRITICAL/High в зонах; NFR-805 ноль читаемых PII >90д; контраст 4.5:1 (FR-806); кэш TTL 15–30с (FR-808); лимит OTP ≤5 → dead (унаследованный инвариант).

### 2. Consistency & Conflict Matrix (Гейт 2)

Проверенные пересечения:
- FR-804 (job input без секретов) × FR-807 (e2e доставает OTP-код): конфликт не обнаружен — e2e-хелпер читает код из БД через HMAC-подбор тест-хелпером, прод-контракт не меняется (решение §6-Q3).
- FR-809 (анонимизация PII >90д) × audit-история: конфликт не обнаружен — audit_events не хранят читаемых PII клиента (metadata: fulfillment/resourceId/ids), история операций сохраняется.
- FR-802 (серверный idempotencyKey) × повтор брони легитимным клиентом: ключ детерминирован от (email, услуга, слот) → повтор того же клиента возвращает его же бронь; edge case зафиксирован в §3.
- FR-808 (кэш availability 15–30с) × SLOT_TAKEN-контур: устаревший кэш деградирует в существующий честный 409 — не новый риск.
- Взаимоисключающих состояний FSM не добавляется (Via Negativa: no new FSM statuses). **FAIL не обнаружен.**

### 3. Completeness & Boundary Conditions (Гейт 3)

- Падение внешних зависимостей: описано для Stripe (US4 — re-read ветки), Resend (унаследованный resend-канон), сети в UI (US5/US6).
- Границы N=0/1/MAX: миграция на пустой БД (US1), кэш пустых дат (US8), капы live intents (унаследованы), 0 строк CAS (US4).
- Таймауты/гонки: webhook×cancel×sweep (§3), refund×refund (US4), двойной сабмит confirm (§3).
- Ошибочные/пустые состояния UI: US5 (catch), US6 (d/e/f), ConfirmOrder error-экран.
- **Пробел не обнаружен.**

### 4. Unambiguity (Гейт 4)

- Словарь един: «клиент» (гость без аккаунта) vs «staff/OPERATOR» vs «OWNER» — использованы консистентно; «интент» vs «бронь» не смешиваются.
- Двусмысленностей синтаксических не найдено.

### 5. Risk-Based Testing Scoring

| FR | Impact | Probability | Risk | Техники верификации |
|---|---|---|---|---|
| FR-802 (IDOR) | 5 | 3 | **15 High** | BVA (граница «чужой/свой email»), негативные, симуляция перебора |
| FR-803 (staff authz) | 5 | 3 | **15 High** | Decision Table (chat×карточка×роль), негативные |
| FR-804 (money path) | 5 | 3 | **15 High** | **STM** (webhook×cancel×sweep), симуляция сбоев, BVA refund |
| FR-801 (schema) | 5 | 2 | 10 Medium | EP + smoke fresh-deploy |
| FR-808 (infra) | 4 | 3 | 12 Medium | EP + конфиг-проверки |
| FR-806 (funnel UX) | 3 | 3 | 9 Medium | EP + a11y-контраст чеклист |
| FR-805 (trust route) | 4 | 2 | 8 Medium | EP + негативные |
| FR-807 (gates) | 4 | 2 | 8 Medium | контрактные route/e2e тесты |
| FR-809 (compliance) | 3 | 2 | 6 Medium | EP + grep-проверки |

Risk ≥15 → обязательные STM/Decision Table/DI — отражено в US4 (STM-тесты) и US3 (матрица). Plan/tasks обязаны включить эти техники.

### Verdict

**PASS** — спека допускается к `/speckit.plan`. Два примечания Гейта 1 не блокируют (behavioral-verifiable). Обязательство plan-стадии: STM-техники для FR-802/803/804, BVA для 15-риск веток.

# Requirements Audit Report: 005-google-calendar-sync (re-scope: Calendar Feed)

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #1 на rev 2.0; легаси-run'ы rev 1.0 sketch — вне контура, re-scope по решению владельца + план v2.6.0)
- **Audit Date**: 2026-11-09
- **Audited**: `specs/005-google-calendar-sync/spec.md` rev 2.0 (8 reqs: 4 FR + 4 NFR)
- **Grounding (001–004 as-built)**: B-tree `(resource_id, start_time)` есть; rate limiter с доверенным IP-парсером есть; HMAC-токен-канон (`tokens.ts`, timing-safe) есть; AuditEvents есть; adminOnly-канон есть.

---

## Run #1 (spec rev 2.0) — PASS

### 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- Нарушений: **0**. Все FR детерминированы: 403-матрица (FR-501), RFC 5545-структура + окно now−7d…now+90d + STATUS/SEQUENCE (FR-502), PII-grep (FR-503), мгновенная инвалидация ротацией + audit (FR-504). «Свежесть ≤ 60 c» — серверная, латентность подписчика вынесена за границу системы (документировано) — не стоп-слово.
- Perf-квант p95 < 50 ms (NFR-503) — тот же контур, что проверенный FR-205.

### 2. Матрица конфликтов (Gate 2: Consistency)

| ID 1 | ID 2 | Суть | Вердикт |
| :--- | :--- | :--- | :--- |
| FR-502 (TENTATIVE для холдов) | FR-503 (PII-граница) | Холд-карточка тоже содержит имя | ✅ имя разрешено Q4, телефон запрещён — непротиворечиво |
| FR-504 (ротация) | US2 (стабильный UID) | Ротация меняет URL, но UID событий стабилен → в новом фиде события не дублируются | ✅ UID не зависит от токена |
| FR-501 (rate limit 10/60s per IP) | Реальный паттерн календарей | Google/Apple поллят с фиксированных IP редко — 10/60s достаточно | ✅ |
| FR-503 (PII) | Табу «NO PHONE IN FEED» | Дублируют друг друга | ✅ defense in depth, не конфликт |

### 3. Полнота (Gate 3: Completeness)

- Edge-cases: покрыты (латентность подписчика, пустой ресурс, холды, утечка токена → ротация, TZ, мультиресурс).
- **Note (LOW→plan)**: SEQUENCE-семантика — «инкремент при изменениях» требует проверки: изменения времени брони (reschedule 003) тоже должны поднимать SEQUENCE и обновлять DTSTART/DTEND; зафиксировать в плане (D-решение) и тесте.
- **Note (LOW→plan)**: `DTSTAMP` детерминизм для байт-идентичности тела — в RFC DTSTAMP обязателен; генерить из `updated_at` брони, а не `now()` — зафиксировать в плане.
- Fallback-стратегии: ресурс удалён → фид отдаёт пустой VCALENDAR (не 404) — зафиксировано в US2/Edge.

### 4. Однозначность (Gate 4)

- Словарь един: feed/token/rotation/VEVENT. «Активная бронь» определена перечнем статусов (BOOKED/HELD/PENDING_APPROVAL/PAYMENT_PENDING). Ambiguity 0.

### 5. Risk-Based Testing Scoring (rev 2.0)

| Req | Impact | Prob | Risk | Техники |
| :--- | :--- | :--- | :--- | :--- |
| FR-501 | 4 | 3 | 12 (Medium) | Security DT (403-матрица), BVA rate limit |
| FR-502 | 3 | 3 | 9 (Medium) | EP + RFC-структурные тесты + EP отмены |
| FR-503 | 4 | 2 | 8 (Medium) | PII-grep тест |
| FR-504 | 3 | 2 | 6 (Medium) | EP ротации |
| NFR-501..504 | — | — | — | Регрессия/замеры |

Risk ≥20 отсутствует; money-path не затронут (фид read-only, вне FSM-писателей).

### 6. Верdict

**PASS** — 0 блокеров. Два LOW-note уезжают в plan-фазу (SEQUENCE-семантика на reschedule; DTSTAMP из updated_at).

```yaml
verdict: PASS
audit: requirements-audit
run: 1
audited_at: 2026-11-09T05:10:00Z
spec_revision: "2.0"
critical_count: 0
high_count: 0
medium_count: 0
low_count: 2
```

Business plan: **v2.6.0 (UPDATED — VII-B.2)**: §2.3 форма интеграции = Calendar Feed; commit `2f7fcf4` (undreplans). Waiver не требуется — план синхронизирован со спекой (VII-B.4 PASS).

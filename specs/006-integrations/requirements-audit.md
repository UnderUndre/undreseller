# Requirements Audit Report: 006-integrations (006-google-calendar-and-integrations)

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (после clarify-раунда; исходный вердикт rev 1.0 — REJECTED, см. §8)
- **Audit Date**: 2026-10-26
- **Audited**: `specs/006-integrations/spec.md` rev 1.0 (REJECTED) → rev 1.1 (re-audit PASS)

---

### 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- Обнаружено нарушений: **0**.
- Все FR/NFR квантованы: push ≤60с (p95), sync-цикл 15 мин, кэш занятости ≤15 мин, webhook-ретраи ≤5, подпись HMAC-SHA256 + timestamp ±5 мин, API 30 req/min / пагинация ≤100 / до 5 эндпоинтов, шифрование AES-256-GCM, слот-расчёт p95 ≤50 мс (локальная часть), ≤500 MB RSS, `npm audit` 0 H/C. Стоп-слов без цифр не найдено.

### 2. Матрица конфликтов (Gate 2: Consistency Cross-Check)

| ID 1 | ID 2 | Суть конфликта | Вердикт |
| :--- | :--- | :--- | :--- |
| FR-601 (кто подключает) | STRIDE-Elevation (строго OWNER) | ❌→✅ **RESOLVED в rev 1.1** (BLOCKER-1): rev 1.0 допускала «OWNER/OPERATOR» — противоречие со STRIDE. Rev 1.1: строго OWNER, OPERATOR/PERFORMER → 403 | OK |
| FR-601 (один GC на инстанс) | Бизнес-план v18.9 (multi-staff ICP 3–25 сотрудников) | ❌→✅ **RESOLVED в rev 1.1** (BLOCKER-3): гранулярность переехала на per-resource (`IntegrationCredential.resourceId`, null = `default_master`); busy-импорт изолирован по ресурсу | OK |
| FR-602 (FSM→GC push) | 004 FSM (полный набор состояний) | ❌→✅ **RESOLVED в rev 1.1** (BLOCKER-2): rev 1.0 покрывала только BOOKED/CANCELLED/перенос — дыра на пути `PAID_REQUIRES_RESOLUTION` (коллизия после BOOKED). Rev 1.1: полная матрица, `RELEASED` при живом событии → delete + audit | OK |
| FR-603 (busy-импорт) | 004 GiST hold-барьер (FR-105) | ✅ Совместимо: внешний busy — SQL-вычитание в `listAvailableSlots`; GiST остаётся финальным барьером в транзакции холда (race-safe) | OK |
| FR-602 (push через outbox, сбой не срывает бронь) | FR-604 (fail-open для броней) | ✅ Согласовано: сбой GC не блокирует приём броней; деградация только витрины занятости в границах известного | OK |
| FR-606/607 (webhook payload с контактом при `pii=full`) | GDPR purge (edge cases) | ✅ Purge удаляет событие GC + ПДн из логов доставки; retention Google-стороны — зона процессора (compliance §Regulatory, ответственность инстанса по DPA — зафиксировано) | OK |
| FR-608 (PUBLIC_API_KEY через env) | NFR-03 (секреты только через environment) | ✅ Согласовано; прецедент `PAYMENT_PROVIDERS`/`STRIPE_*` 005 | OK |
| FR-603 (окно чистки busy 30 дней) | NFR-001 (горизонт слотов 7 дней) | ✅ Окно покрытия избыточно-достаточно | OK |

### 3. Анализ полноты (Gate 3: Boundary & Failure Coverage)

- Edge-cases: **ДА** (после clarify).
  - ✅ Отказ внешней зависимости: `invalid_grant` → `NEEDS_REAUTH` + алерт; 429/403 → бэкофф (outbox-шейпинг 004); сбой GC не срывает бронь (fail-open, SC-006).
  - ✅ N=0/N=1/MAX: 0 эндпоинтов (webhooks просто не доставляются), 1 эндпоинт, MAX=5; пагинация ≤100; sync-пачки ≤50; 0 подключённых календарей у ресурса (работа как 004).
  - ✅ Гонки: advisory lock `gcal_sync` (канон knowledge-reindex), идемпотентный push по `extendedProperties`, timestamp ±5 мин против replay, GiST как финальный арбитр слота.
  - ✅ Таймзоны: UTC-нормализация busy перед сравнением; `DTSTART;TZID` из `ShopSettings.timeZone`; запрет сравнения наивных дат.
  - ✅ UI-состояния: баннер `NEEDS_REAUTH` в `/admin/settings`, test-ping кнопка, статус интеграции.
- Fallback-стратегии: **ДА** — kill-criteria (fallback на ICS-only), полная FSM→GC-матрица, SSRF-гейт при регистрации и вызове.

### 4. Однозначность (Gate 4: Unambiguity)

- ✅ Роли — канон 003/004 (`OWNER`/`OPERATOR`/`PERFORMER`); «мастер» — только в нарративных сценариях, права везде по каноническим ролям.
- ✅ Статусы FSM — DB-термины 004 (`BOOKED`, `CANCELLED`, `RELEASED`, `PAID_REQUIRES_RESOLUTION`) без спек-уровневых синонимов.
- ✅ Терминология едина: «busy-интервал/занятость» = `ExternalBusyBlock`; «событие GC» ≠ «бронь»; провайдер календаря всегда «Google Calendar/GC».
- ✅ Payload webhook'а зафиксирован поэлементно (FR-607), события — закрытый список.

### 5. Итоговый статус гейта

- **GATE VERDICT**: **PASS** (rev 1.1; блокеров не осталось — история в §8)
- Блокеры round 1 (все закрыты clarify-раундом):
  1. **BLOCKER-1 (Consistency)**: FR-601 «OWNER/OPERATOR» противоречил STRIDE-Elevation «строго OWNER» → ревизия: OWNER-only.
  2. **BLOCKER-2 (Completeness)**: FSM→GC-маппинг неполон — не было действия для `RELEASED` при живом событии (коллизия `PAID_REQUIRES_RESOLUTION`) → ревизия: полная матрица в FR-602.
  3. **BLOCKER-3 (Consistency с бизнес-контекстом)**: «один GC на инстанс» ломал multi-staff ICP v18.9 (занятость мастера A блокировала бы мастера B) → ревизия: per-resource календарь.
- Рекомендации (не блокируют): R1 — в plan.md зафиксировать decision-таблицу FSM→GC как контракт `lib/integrations/gcalMapping.ts`; R2 — evidence-замер sync-цикла на пилоте (2% ложных блокировок = kill criteria).

### 6. Business plan hook

Спека потребляет лимит «≤1 бизнес-интеграция» (Google Calendar) — Principle VII-B.2 delta уже проведён: бизнес-план **updated v18.9 → v19.0** (2026-10-26, `bizplan/006-integrations/v1`). Противоречий в монетизации/ICP/юнит-экономике аудит не вскрыл.

### 7. Snapshot

`requirements-audit/006-integrations/v1` — см. шаг Snapshot ниже.

### 8. Re-audit (rev 1.1, тот же день)

Clarify-раунд закрыл BLOCKER-1..3 (см. §2/§5; правки: FR-601 OWNER-only + per-resource, FR-602 полная FSM-матрица, FR-603 per-resource изоляция busy, Key Entities + Clarifications Matrix Q7–Q9). Повторный прогон 4 гейтов: Verifiability 0 нарушений; Consistency 0 неразрешённых конфликтов; Completeness — внешние отказы/гонки/N-границы покрыты; Unambiguity — словарь един. **VERDICT: PASS.**

## Metrics

- Total Requirements: 17 (11 FR + 6 NFR)
- Critical (Risk ≥20): 2 (FR-602, FR-603 — money-path календаря)
- Ambiguity count: 0 · Duplication count: 0
- BLOCKER count (round 1): 3 → закрыты 3/3

```yaml
verdict: PASS
override_reason:
audit: requirements-audit
audited_at: 2026-10-26T00:00:00Z
spec_revision: 1.1
round_1_verdict: REJECTED
critical_count: 0
high_count: 0
medium_count: 0
low_count: 2   # R1 (FSM-mapping контракт), R2 (пилотный замер) — не блокируют
```

**Next step**: PASS → `/speckit.plan` (или `/speckit.full-plan`).

# SpecKit Analyze: 001-modular-commerce-template

**Reviewer**: analyze (ZCode self-consistency)  
**Reviewed at**: 2026-10-13T16:25:00Z  
**Commit**: ac69003698681e4186851a0112af1231d8d7920e (`undreseller`, branch `spec/001-modular-commerce-template`)  
**Artifacts**: `spec.md`, `plan.md`, `tasks.md`  

---

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| — | — | — | — | Замечания отсутствуют. Все внутренние требования согласованы, граф зависимостей нормализован до элементарных пар. Все замечания внешнего ревью Copilot (F1–F6: устранение отката 23P01 при late payment коллизиях, честная at-least-once семантика, attemptCount и lastErrorAt в InboxEvent, сканирование просроченных PROCESSING в скан-свипере, строгий REPLICA_COUNT assertion, statutory retention для PaymentEvent и подтверждение конституции) полностью устранены в spec.md, plan.md и tasks.md. | — |

---

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| :--- | :--- | :--- | :--- |
| `FR-01` Admin CRUD | Yes | `T-006`, `T-007`, `T-008` | Полное покрытие (Zod-валидация, проверка нахлеста смен) |
| `FR-02` Windows | Yes | `T-010` | Учтен `minNoticeMin` в `shopTimezone` |
| `FR-03` Hold + exclusion | Yes | `T-003`, `T-011` | Postgres GiST exclusion constraint (`slot_no_overlap`) |
| `FR-04` Telegram webhook | Yes | `T-018`, `T-019`, `T-028` | Синхронный Stars + асинхронный Inngest Inbox |
| `FR-05` initData | Yes | `T-011`, `T-014`, `T-030` | HMAC-SHA256, проверка `auth_date <= 3600s` |
| `FR-06` WhatsApp | Yes | `T-020`, `T-021` | Валидация `X-Hub-Signature-256`, только утвержденный шаблон |
| `FR-07` Cooldown | Yes | `T-021` | 24-часовой анти-спам кулдаун на номер |
| `FR-08` Ingest | Yes | `T-003`, `T-022`, `T-023` | Лимиты 10 MB / 50 стр, нарезка 500/50 через `js-tiktoken` |
| `FR-09` FTS answer | Yes | `T-024` | `plainto_tsquery`, топ-5 чанков, жесткий лимит ≤ 8,000 токенов |
| `FR-10` Escalation | Yes | `T-009`, `T-024` | Создание тикета + усеченный алерт (200 симв) без PII |
| `FR-11` Stars | Yes | `T-019`, `T-028`, `T-030` | `XTR` integer, синхронный `pre_checkout_query` |
| `FR-12` NOWPayments | Yes | `T-029` | `x-nowpayments-sig` HMAC + строгое правило 99% суммы |
| `FR-13` PAID + stock | Yes | `T-026` | Единая транзакция: `PaymentEvent`, статус `PAID`, списание склада |
| `FR-14` Durable jobs | Yes | `T-015`, `T-027`, `T-031` | Inngest cron 1 мин, ретрай `PENDING` инбокса, purge PII через 30 дней |
| `FR-15` Health | Yes | `T-032` | `SELECT 1` через `DATABASE_URL`, без раскрытия секретов |
| `FR-16` Log denylist | Yes | `T-016` | Фильтрация токенов/PII + счетчики `inbox_send_fail`, `hold_expired` |
| `NFR-01` 500 MB RAM | Yes | `T-033` | Бенчмарк RSS контейнера приложения |
| `NFR-02` Webhook SLA | Yes | `T-015`, `T-019`, `T-021` | Немедленный ack после постановки в durable inbox |
| `NFR-03` Perimeter | Yes | `T-007`, `T-017` | In-memory limiter (10 req / 60s), admin token fail-closed |
| `NFR-04` Whitelabel split | Yes | `T-005`, `T-008`, `T-035` | Разделение git-конфига и настроек в базе |
| `NFR-05` RPO stated | Yes | `T-035` | Честное документирование дампа хоста (Restic), отказ от ложного PITR |
| `US1` (Catalog & Hold) | Yes | `T-006`, `T-008`, `T-010`, `T-011`, `T-012`, `T-034`, `T-036` | Полное покрытие + SEO/JSON-LD |
| `US2` (Telegram TMA) | Yes | `T-013`, `T-014`, `T-018`, `T-019` | Полное покрытие |
| `US3` (WhatsApp Template) | Yes | `T-020`, `T-021` | Полное покрытие |
| `US4` (FTS AI Answer) | Yes | `T-022`, `T-023`, `T-024`, `T-025` | Полное покрытие, 5 юнит-фикстур |
| `US5` (Pay & Finalize) | Yes | `T-026`, `T-027`, `T-028`, `T-029`, `T-030` | Полное покрытие |
| Day-14 / Demand Gate | Yes | `T-035` | Чек-лист онбординга $1 и требование 10 трипвайров |

---

## Constitution Alignment Issues

- **Principle VI (Cross-AI Review Gate)**: Первый этап валидации (`analyze.md`) завершен с вердиктом **PASS**.
- **Principle VII (Artifact Versioning)**: Артефакты согласованы, версионирование готово к снимку этапа.
- **Principle IX (Two-Phase Review Flow)**: Работа ведется на planning-ветке `spec/001-modular-commerce-template`.

---

## Commercial / Business Plan Alignment

- **Загруженные бизнес-планы**: 
  - `undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v18.3)
  - `undreplans/ROADMAP.md` (v2.4)
  - `undrllanding/specs/001-init-separate-landings/spec.md` (мультипроектный изолированный лендинг)
- **Проверка жестких правил и фокуса**:
  - Полное соответствие предложению **Sprint B ($4,900 flat / 14 дней)**.
  - Топология сервисов: маркетинговый лендинг размещается в `repos/undrllanding` (`projects/undreseller/` по спецификации `001-init-separate-landings`), а `undreseller` является транзакционным ядром (каталог, бронирование слотов, чекаут, Telegram Mini App). Дублирование исключено.
  - Scope knife: ровно 1 бизнес-процесс (каталог → холд → оплата).
  - Day 14 онбординг: тестовая транзакция на $1 перед высвобождением эскроу.
  - Demand Gate (10 оплаченных трипвайров) зафиксирован в quickstart.
  - Устаревший бизнес-план v16.0 явно объявлен невалидным в `spec.md` и `tasks.md`.
  - Двухуровневая стратегия: Track 2 Medusa (`undrecommerce`) заморожен в Phase A.
  - Отсутствуют задачи на платный холодный трафик/рекламу.
- **Дрифт не обнаружен**: No commercial drift detected.

---

## Unmapped Tasks

Все задачи `T-001`–`T-035` сопоставлены с требованиями и структурированы по параллельным дорожкам и фазам.

---

## Metrics

- **Total Requirements**: 26 (16 FR + 5 NFR + 5 US)
- **Total Tasks**: 36
- **Coverage %**: 100.0% (26/26)
- **Ambiguity count**: 0
- **Duplication count**: 0
- **CRITICAL count**: 0
- **HIGH count**: 0
- **MEDIUM count**: 0
- **LOW count**: 0

---

## VERDICT

```yaml
verdict: PASS
reviewer: analyze
reviewed_at: 2026-10-13T16:25:00Z
commit: ac69003698681e4186851a0112af1231d8d7920e
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

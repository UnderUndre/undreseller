# SpecKit Analyze: 006-waitlist-autofill

**Reviewer**: analyze (same-tool self-consistency)
**Reviewed at**: 2026-11-10T20:55:00Z (run #2, post-antigravity review fixes F1–F13)
**Artifacts**: spec rev 1.2, requirements-audit (PASS run #3), plan.md, research.md (D1–D8), tasks.md (8 задач), qa/ (preliminary-rtm, rtm-matrix 10/10, test-cases 16 TC, uat-scenarios 3, regression-suite), план v2.7.0 (`cad0f22`, undreplans)

## Findings & Resolutions (Rev 1.2)

| ID | Area | Resolution | Status |
| --- | --- | --- | --- |
| F1 | Architecture / Security | `notifiedSlotStart/End` добавлены в коллекцию `WaitlistEntries`; `slotStartIso` включён в HMAC; `claim` читает время строго из БД | RESOLVED |
| F2 | Next.js Route Shadowing | Слаг коллекции изменён на `waitlist-entries` (таблица `waitlist_entries`), исключая конфликт с кастомными роутами `/api/waitlist/*` | RESOLVED |
| F3 | Domain Logic / Email | `email` зафиксирован как обязательное поле в `POST /api/waitlist` и `WaitlistJoinForm` (0 мёртвых душ, 0 сбоев при `FULL_PREPAYMENT`) | RESOLVED |
| F4 | FSM / Concurrency | При `409 SLOT_TAKEN` auto-advance НЕ вызывается (слот занят); auto-advance срабатывает только на свободный слот при sweep 30m или unsubscribe | RESOLVED |
| F5 | Consistency | В `spec.md` вычищены артефакты rev 1.0 (§1.2 заполнено, убраны «10m HOLD» и Telegram из MVP) | RESOLVED |
| F6 | Integration | Все 6 точек `RELEASED` зафиксированы в `plan.md`/`T620` с `RETURNING resource_id, item_id, start_time, end_time` | RESOLVED |
| F7 | Cron / Operational | `waitlist-sweep` переведён на крон каждые 5 минут (`*/5 * * * *`) и зарегистрирован в `payload.config.ts` | RESOLVED |
| F8 | Edge Cases | Валидация горизонта `now < expiresAt <= now + 60d`; матчинг проверяет `expiresAt >= slotStart` и игнорирует прошедшие слоты (`slotStart <= now`) | RESOLVED |
| F9 | UX / Concurrency | Устранено смешение с `AcknowledgeClient`: для проигравших 409 — честный отказ; победитель шлёт детерминированный `idempotencyKey` | RESOLVED |
| F10 | Token Security | Разделены `claimToken` (TTL 30m с привязкой слота) и `unsubscribeToken` (на весь жизненный цикл записи) | RESOLVED |
| F11 | Security & Compliance | Проверка по `Blacklist` при `join` (403); системные поля `readOnly`/no client access; GDPR purge терминальных записей > 90 дней | RESOLVED |
| F12 | Commercial Sync | Синхронизирована нумерация: 006 = waitlist-autofill, 007 = ЮKassa | RESOLVED |
| F13 | Indexes & Typing | Композитные индексы `(resource_id, service_id, status)` и `(phone, status)`; типизация `logDelivery(kind='waitlist')` | RESOLVED |

## Coverage Summary

| Requirement | Task(s) | TC |
| --- | --- | --- |
| FR-601 | T610 | 001–003 |
| FR-602 | T620 | 004–006 |
| FR-603 | T621, T622 | 007–010 |
| FR-604 | T630 | 011, 014, 015 |
| FR-605 | T630 | 012–013 |
| NFR-601..604 | T640 | 016 |

**Coverage: 10/10 = 100%** · RTM 10/10 (16 TC + чартер E-03 + UAT-02 на Risk 20) · Tasks: 8, граф валиден (0 циклов/орфанов), критический путь T610 → T611 → T620 → T621 → T622 → T640.

## Constitution Alignment

- VI: ON TRACK — артефакты вычищены, внешнее ревью antigravity интегрировано.
- VII-B: план v2.7.0 синхронизирован (006 waitlist, 007 ЮKassa).
- X: additions-only (новая коллекция `WaitlistEntries` + enum-значение).
- XII: Risk 20 (FR-603) → STM+DT+EG+UAT покрыты.
- XIII: WIP=1.
- Остальные: PASS/N/A.

## VERDICT

```yaml
verdict: PASS
reviewer: analyze
reviewed_at: 2026-11-10T20:55:00Z
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```


---

## Run #3 (re-check, 2026-11-10) — PASS

**Вход**: verify резолюций F1–F13 по рабочему дереву + собственный adversarial проход.

| ID | Severity | Summary | Resolution |
| --- | --- | --- | --- |
| R1 | MEDIUM | F12 полечен наполовину: спека говорит «006=waitlist, 007=ЮKassa», но bizplan v2.7.0 §2.4 по-прежнему маркировал ЮKassa как «(006)» | Bizplan поправлен (undreplans, отдельный коммит) — «ЮKassa (007)» |
| R2 | MEDIUM | T610 advisory lock `waitlist_join_${phone}` — строковый литерал без hashtext = ровно класс бага 004 F6 (`function pg_advisory_xact_lock(unknown) does not exist`) | T610 дополнен каноном `hashtext('waitlist_join_' \|\| phone)` |
| R3 | LOW | Verify HMAC-токена: `campaignCount` не растёт на re-arm → одинаковый slotStart в разных кампаниях даёт одинаковый токен — принято (свой токен/свой entry, claim легитимен; статус-машина + activeCampaignAt guard держат корректность) | Зафиксировано как accepted trade-off |
| R4 | LOW | `notifiedSlotStart.toISOString()` — timestamptz из PG (микросекунды) сериализуется драйвером в Date (ms) детерминированно с обеих сторон; token-строка стабильна | Подтверждено, правок не требует |

**Verify резолюций F1–F13**: все подтверждены по диффам (spec rev 1.2 §1.2/US1–US4/FR/SC/Q1–Q6, tasks T610–T640 с 6 точками RELEASED и RETURNING, research D1–D8, test-cases 16 TC, rtm-matrix 10/10, plan Structure/Threat/Risks).

Coverage: 10/10, 16 TC, граф валиден.

```yaml
verdict: PASS
reviewer: analyze
run: 3
reviewed_at: 2026-11-10T23:59:00Z
spec_revision: "1.2"
critical_count: 0
high_count: 0
medium_count: 2
low_count: 2
```

Гейт VI: antigravity PASS (rev 1.2) — 1 внешний PASS; до implement нужна ещё ≥1 внешний PASS или logged override.

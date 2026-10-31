# SpecKit Review: 006-integrations (006-google-calendar-and-integrations)

**Reviewer**: zcode
**Reviewed at**: 2026-10-31T00:00:00Z
**Commit**: f8ea697c907116ae6714bebec2be2041174b8abc
**Artifacts reviewed**: spec.md (rev 1.2), plan.md, tasks.md, data-model.md, contracts/gcal-adapter.md, contracts/outbound-webhooks.md, quickstart.md, research.md, requirements-audit.md, reviews/analyze.md (re-run #3 PASS), reviews/antigravity.md (PASS), `undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v20.1)

**Provider note**: ZCode не входит в таблицу тегов команды (`claude/codex/antigravity/gemini/copilot`). Использую честный тег `zcode` (инструмент уже фигурирует как внешняя ревью-платформа в business plan v20.1, запись о ревью лендинга). Ревью — независимое, автор спеки мне не я.

## Summary

Спека зрелая: два раунда внешней ремедиации (antigravity F1–F10, analyze X1–X8) реально закрыты — секреты вольта, SSRF, идемпотентность, breaker-семантика и фильтрация своих событий верифицированы по всем артефактам. Но я нашёл два класса проблем, которые прошли мимо всех предыдущих ревью: **(1)** механика sync-канала специфицирована с невалидным для Google API сочетанием `syncToken + timeMin`, и рекуррентные события (еженедельные клиенты — ядро ICP) не покрыты вовсе; **(2)** `UNIQUE (provider, resourceId)` с nullable `resourceId` не держит заявленный инвариант одной строки в соло-режиме — Postgres считает NULL'ы различными. Плюс россыпь MEDIUM: гонка email-подтверждения против async Meet-push, PATCH на внешне удалённое событие, xact-семантика advisory lock, противоречие таймзон ICS, спецификация HMAC-timestamp против ретраев, устаревшие ссылки на бизнес-план.

## Findings

| ID | Severity | Area | Finding | Recommendation |
| --- | --- | --- | --- | --- |
| F1 | HIGH | Sync mechanics / Edge cases | `contracts/gcal-adapter.md §4` специфицирует `events.list({ syncToken, timeMin: now })` — **невалидное сочетание**: при инкрементальном sync Google запрещает фильтр-параметры (`timeMin`/`timeMax`/`q` и др.), API вернёт 400 ([events.list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [sync guide](https://developers.google.com/workspace/calendar/api/guides/sync)). Кроме того, рекуррентные события не специфицированы нигде: расширение серий (`singleEvents=true`) несовместимо с инкрементальным syncToken, а без него дельта возвращает мастера серии, а не экземпляры. Еженедельныеbusy-слоты (клиника, еженедельный приём) — ядро ICP v18.9, а в контрактных тестах §5 нет ни одной строки про recurrence. | Переспецифицировать: initial full-sync с `timeMin + singleEvents=true + showDeleted` → фиксация `nextSyncToken` с исходными параметрами; инкрементал — чистый `syncToken` без фильтров; для серий — либо расширение экземпляров на full-sync + обработка `recurringEventId`/`cancelled`-экземпляров в дельте, либо явное решение «серии не импортируются» с фиксацией в табу. Добавить 2–3 строки в контрактные тесты gcal-adapter §5. |
| F2 | HIGH | Data integrity / Schema | `data-model.md §1.1`: инвариант «до одной активной строки на (provider, resourceId)» через `UNIQUE (provider, resourceId)` **не держится при `resourceId = NULL`** (соло-режим): Postgres трактует NULL как отличный от любого NULL — можно завести несколько instance-wide credential'ов. Последствия: двойной push в календарь, двойной sync (advisory lock per-credential не спасает — это две разные строки), разъезд syncToken. | В миграции T010: `UNIQUE (provider, resourceId) NULLS NOT DISTINCT` (PG 16 поддерживает) либо partial unique index `WHERE "resourceId" IS NULL`. Зафиксировать в data-model §1.1 и в guard-тесте lineage. |
| F3 | MEDIUM | Edge cases (GC-side mutation) | Табу «GC-side правки не мутируют БД» корректно, но push-сторона не покрыта: мастер удалил событие в GC вручную → FSM-перенос брони → `PATCH` → Google 404. Контракт §2 определяет upsert только для реплеев `BOOKED` и идемпотентный NOOP только для `DELETE` 404/410. Поведение PATCH-on-missing не определено — воркер уйдёт в ретраи 5xx-ветки или упадёт. | Зафиксировать в `gcal-adapter.md §2`: `PATCH` → 404 → re-`CREATE` (upsert-семантика) либо NOOP + audit `status=external_deleted`. Добавить строку в контрактные тесты. |
| F4 | MEDIUM | Concurrency / DB resources | `pg_try_advisory_xact_lock` — **транзакционно-скоупед**: лок живёт до конца транзакции. Sync делает сетевые вызовы к Google на протяжении минут (пачки ≤50 + бэкофф на 429). Варианты: (а) лок взят в одной короткой транзакции — снимается сразу и не защищает цикл; (б) весь sync в одной транзакции — держит connection из пула минуты, при ≤20 календарях и 15-мин цикле возможен голод пула. | Специфицировать механику явно: session-level `pg_try_advisory_lock` + `pg_advisory_unlock` в `finally` (REPLICA_COUNT=1 делает это безопасным), либо xact-lock per-батч с upsert внутри транзакции батча. Указать выбранный вариант в контракте §4 и T022. |
| F5 | MEDIUM | Consistency (cross-doc) | Противоречие таймзон ICS: US2 acceptance (spec.md:65) требует «DTSTART в **таймзоне брони**», а FR-605 (spec.md:111) и edge-case (spec.md:102) — «TZID из **ShopSettings.timeZone**». При брони `Asia/Yerevan` в шопе с другим поясом — разные письма. | Один источник истины. Если таймзона брони всегда наследуется от `ShopSettings.timeZone` — выписать это явно; если услуга может иметь свою таймзону — править FR-605. |
| F6 | MEDIUM | Hidden assumption / Lifecycle | Meet-ссылка нигде не живёт: push — async через outbox (≤60 с), а email-подтверждение уходит сразу после FSM-перехода. `meetLink` из ответа `pushEvent` (gcal-adapter §1) не хранится ни в одном поле data-model — компонент «Meet-ссылка в подтверждении» (plan Project Structure, T025) берёт её неизвестно откуда. Гонка: письмо уйдёт раньше, чем GC вернёт conferencing. | Специфицировать: поле хранения `meetLink` (напр., в fulfillment-данных Order) с записью из push-воркера + правило для письма (отправка после push, или Meet-ссылка в follow-up письме, или confirm-письмо без Meet если push не завершился). |
| F7 | MEDIUM | Failure modes (webhook) | Семантика `X-Undreseller-Timestamp` не определена относительно ретраев: если timestamp = время события (`occurredAt`), то поздние Inngest-ретраи (backoff 4-й/5-й попытки) выйдут за ±5 мин и приёмник отвергнет валидную доставку как replay — «навечный» FAIL ретрая. Если timestamp = момент попытки — приёмник защищён, но это надо написать. | В `outbound-webhooks.md §2`: явно «timestamp генерируется в момент каждой попытки доставки», приёмник сверяет с моментом получения, не с occurredAt. Тест-строка: ретрай через 6 мин после события → принят. |
| F8 | MEDIUM | Commercial/GTM drift | Ссылки устарели: spec/plan ссылаются на business plan **v19.0** (2026-10-26), актуальный — **v20.1** (2026-10-31). v20.0 вычистил «ИП и самозанятых» из позиционирования Sprint B (Primary ICP = сервисный бизнес 3–25 сотрудников), а spec §1.1 до сих пор открывает «ICP Sprint B — частные специалисты и ИП». Нарратив спеки противоречит действующему канону. | Обновить §1.1 и ссылки на v20.1; нарратив ICP привести к v20.0 (сервисный бизнес со штатом). Дельта законов не нарушена (лимит «≤1» расходуется, floor $4,900 не тронут) — это artifact drift, не money-path breach. |
| F9 | LOW | Edge cases (OAuth) | `state` хранится в памяти процесса с TTL 10 мин (research D5): рестарт процесса между `/connect` и callback → владелец получает неочевидный отказ без диагностики. Приемлемо при single-instance, но стоит зафикировать в runbook T061 («повторить connect»). | Одно предложение в runbook: restart в окне consent → безвозвратный отказ state, OWNER повторяет connect. |
| F10 | LOW | Operational readiness | Disconnect календаря (FR-601 «полный wipe токена и sync-состояния») не решает судьбу уже запушенных событий в GC мастера — они остаются висеть (после reconnect их подхватит delete-путь по FSM, но при отмене брони в период отключения событие-сирота останется). | Документировать в runbook T061 (известное ограничение + ручная чистка) или специфицировать best-effort cleanup при disconnect. |

## Commercial / business plan notes

- Plans loaded: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v20.1 от 2026-10-31; спека ссылается на v19.0 — см. F8).
- Focus laws / SKU floors checked: лимит «≤1 бизнес-интеграция» расходуется на GC (v19.0 entry, не изменён в v20.0/20.1) — корректно; floor Sprint B $4,900 и Ladder Protection не задеты; riders (zod/ICS/webhooks/API) — инфраструктурный контур, классификация последователна по всем артефактам; Demand Gate соблюдён (US3 пост-гейт, feature-флаг `NEXT_PUBLIC_FEATURE_WEBHOOKS`); бренд-изоляция соблюдена.
- Drift: **F8** (ICP-нарратив спеки отстаёт от v20.0; ссылки на ревизию плана) — artifact-level, money-path не задет.

## Alternative approaches considered

- **Google Calendar push-уведомления (watch channels) вместо 15-мин поллинга** — уже отвергнуты antigravity; соглашаюсь, для MVP поллинг достаточен. Отмечаю: если F1 (рекуррентность) приведёт к дорогому full-sync, `watch` станет осмысленной оптимизацией кумулятивной latency — не для 006.
- **freeBusy.query вместо events.list** — отвергнуто research D3 корректно (нет event-id для дедупа); усиливается F1: при невозможности валидного инкрементального syncToken-запроса freeBusy-поллинг — рабочая альтернатива-фоллбэк, если рекуррентность окажется глубже ожидаемой.

## Resolution round (2026-10-31, после remediation автором)

Все 10 находок закрыты и верифицированы по файлам:

| ID | Статус | Где закрыто |
| --- | --- | --- |
| F1 (HIGH) | RESOLVED | `contracts/gcal-adapter.md §4` переработан: initial full-sync `timeMin + singleEvents + showDeleted` → фиксация `nextSyncToken` с параметрами; инкрементал — чистый `syncToken` без фильтров; рекуррентные серии как расширенные экземпляры. Spec FR-603, edge cases, T022, 3 новых строки в §5 + TC-GCAL-045/046 |
| F2 (HIGH) | RESOLVED | `data-model.md §1.1` + манифест §3 + T010: `UNIQUE (provider, resourceId) NULLS NOT DISTINCT` (PG16) + guard-тест инварианта + TC-GCAL-048 |
| F3 (MEDIUM) | RESOLVED | `gcal-adapter.md §2` (PATCH 404 → re-CREATE), spec FR-602, T021, TC-GCAL-047 |
| F4 (MEDIUM) | RESOLVED | session-level `pg_try_advisory_lock` + unlock в `finally` — spec edge case, contract §4, T022 |
| F5 (MEDIUM) | RESOLVED | US2 acceptance синхронизирован с FR-605 (`ShopSettings.timeZone`, наследуется таймзоной брони) |
| F6 (MEDIUM) | RESOLVED | `Order.meetLink` (nullable, Expand) в data-model §1.4a + манифест §3; spec FR-602/edge cases; T010/T021/T025 |
| F7 (MEDIUM) | RESOLVED | `outbound-webhooks.md §2`: timestamp — момент каждой попытки доставки; тест-строка в §6 + T041 + TC-WHK-035 |
| F8 (MEDIUM) | RESOLVED | spec §1.1 ICP-нарратив → v20.0 (сервисный бизнес 3–25), ссылки → v20.1; plan VII-B row обновлён |
| F9 (LOW) | RESOLVED | T061 runbook: рестарт в окне consent → state теряется, OWNER повторяет connect |
| F10 (LOW) | RESOLVED | Spec edge case (GC-сироты: delete-задача исполнится при reconnect, идемпотентный NOOP) + T061 runbook known limitation |

Вердикт обновлён по результатам верификации. Консистентность: grep-свип по `xact_lock`/`v19.0`/`частные специалисты`/`rev 1.1/1.2` — 0 вхождений вне исторических артефактов (requirements-audit, старые ревью — легитимная история). TC-каунт обновлён: 46 → 51 (+2 charter), RTM-строки FR-601/602/603/606 дополнены.

## VERDICT

```yaml
verdict: PASS
reviewer: zcode
reviewed_at: 2026-10-31T12:00:00Z  # re-run после remediation F1–F10
commit: f8ea697c907116ae6714bebec2be2041174b8abc
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

Гейт Principle VI: analyze PASS + antigravity PASS + zcode PASS (re-run после ремедиации F1–F10; исходный раунд — MEDIUM: 2 HIGH / 6 MEDIUM / 2 LOW, все закрыты). Спека rev 1.3 готова к `/speckit.implement`.

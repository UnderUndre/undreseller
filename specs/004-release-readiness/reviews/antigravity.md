# SpecKit Review: 004-release-readiness (re-review post-remediation)

**Reviewer**: antigravity
**Reviewed at**: 2026-10-24T20:08:41Z
**Commit**: cd8f1b74dea0a5f540a02911c809f0fd672746ec
**Artifacts reviewed**: spec.md (v7), plan.md (v2), tasks.md (v2), data-model.md, contracts/* (4 files), quickstart.md, research.md, undreplans/docs/projects/undreseller/undreseller-business-plan.md (v18.5), docs/business-plan.md, .specify/memory/constitution.md (v1.7.2)
**Previous run**: a2670ef — verdict CRITICAL (2 CRITICAL / 2 HIGH / 3 MEDIUM / 2 LOW)

## Summary

Повторный независимый аудит после внесения исправлений коммитами `3ef1e4d` и `cd8f1b7` подтверждает, что все ранее выявленные критические засоры и архитектурные протечки полностью устранены. Имя enum в DDL исправлено на `"ReservationStatus"` с явным добавлением всех необходимых статусов и сопоставлением `CONFIRMED ≡ BOOKED`; задача на веб-аутентификацию персонала (T017/T018) заложена в фундамент с блокировкой задач UI админки; введен 24-часовой потолок заморозки слотов от зависших криптотранзакций; регламентировано атомарное подтверждение позднего платежа на свободный слот (FR-444); выравнивание по бизнес-плану v18.5 и лимиту памяти 500 МБ соблюдено. Пакет готов к реализации.

## Findings

| ID  | Severity | Area | Finding | Recommendation |
| --- | -------- | ---- | ------- | -------------- |
| L1  | LOW      | Tasks Summary | В `tasks.md` количество фактических задач в списке составляет 71 (чекбоксы T001–T116), в то время как в итоговой таблице `Agent Summary` и строке 313 указано 63 задачи (арифметический остаток от промежуточного обновления). На исполнение и зависимости в графе это не влияет. | Обновить суммарную строку и счетчик в `tasks.md` при следующем редактировании (31 [BE], 14 [FE], 10 [SETUP], 10 [E2E], 4 [OPS], 2 [DB], 2 [SEC]). |
| L2  | LOW      | Informational / UX | По FR-409 и T032 при отсутствии email у клиента корректно пишется статус `NO_EMAIL_CHANNEL` с алертом персоналу. Клиенты из Telegram Mini App по умолчанию email не вводят, поэтому фоллбек по почте сработает только для тех, кто указал её добровольно. | Зафиксировать в подсказках чекаута Mini App рекомендацию указать email для получения подтверждения визита. |
| L3  | LOW      | Governance | Карв-аут ветвления `NNN-slug` в Принципе IX Конституции зафиксирован как локальная поправка репозитория (v1.7.2); апстрим-продвижение в `UnderUndre/ai` запланировано отдельным PR. | Отслеживать в следующем DevX спринте; не блокирует запуск фичи 004. |

### Verification of Prior Findings (All 9 Resolved)

- **F1 (CRITICAL) → RESOLVED**: Имя типа enum в миграции T010 и `data-model.md` исправлено на `"ReservationStatus"`; в DDL добавляются все недостающие статусы (`PENDING_APPROVAL`, `PAYMENT_PENDING`, `UNDERPAID`, `CANCELLED`, `STAFF_REJECTED`); в `data-model.md` §1.1 и `plan.md` зафиксирован чистый маппинг `CONFIRMED ≡ BOOKED` на границе сервисов без дублирования значений enum.
- **F2 (CRITICAL) → RESOLVED**: В Phase 2 добавлены базовые задачи: T017 (бэкенд `POST /api/auth/sign-in` со сверкой пароля scrypt по `Account`, созданием сессии в `prisma.session`, установкой HttpOnly куки и ротацией) и T018 (мобильная страница входа `/admin/login` с поддержкой magic-link из бота персонала). Задачи админки T061/T063/T064 заблокированы на T018.
- **F3 (HIGH) → RESOLVED**: В FR-404, `data-model.md` и `contracts/payment-provider.md` установлен жесткий потолок `MAX_CONFIRMING_FREEZE = 24 h`. По истечении 24 часов холд освобождается, заказ переводится в `EXPIRED_DURING_CONFIRMATION` с алертом персоналу.
- **F4 (HIGH) → RESOLVED**: В спецификацию добавлено требование FR-444, а в контракт шлюза — ветка: если поздний платёж поступает по просроченному холду, но слот свободен, бронь атомарно переходит в `CONFIRMED` без принудительного рефанда.
- **F5 (MEDIUM) → RESOLVED**: В FR-433 и `data-model.md` §2.2 зафиксировано, что `WaitlistEntry` переходит в `FULFILLED` только после `CONFIRMED` оплаты. При сгорании неоплаченного холда запускается повторный fan-out офферов с исключением бросившего клиента.
- **F6 (MEDIUM) → RESOLVED**: В T060 и контракте пресайна зафиксировано криптографическое подписание заголовков `Content-Length` и `Content-Type`, а также 48-часовая lifecycle-политика бакета R2 для очистки непривязанных медиафайлов.
- **F7 (MEDIUM) → RESOLVED**: Библиотека `date-fns-tz` (MIT) официально добавлена в `plan.md` §Technical Context, задачи T003 и T030, исключая ошибки ручного расчета переходов DST.
- **F8 (LOW) → RESOLVED**: Формулировка FR-442 уточнена: валидация требует кратности 15 минутам (`durationMin % 15 === 0`), а шаг сетки 15/30 минут задает начальные интервалы (услуга 45 мин на сетке 30 мин валидна).
- **F9 (LOW) → RESOLVED**: В FR-430 внесено явное правило вычета сетевой комиссии блокчейна (gas) из фиатного эквивалента при возвратах в криптовалюте.

## Commercial / business plan notes

- Plans loaded: `docs/business-plan.md` и канонический `undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v18.5, 2026-10-24).
- Focus laws / SKU floors checked: В версии 18.5 бизнес-плана релиз 004 официально зафиксирован как расширение шаблона Sprint B онлайн-платежами и готовностью к запуску без открытия новых SKU или изменения цены ($4,900); лимит памяти приложения $\le 500\text{ MB RAM}$ соблюден; запрет на self-hosted почту выдержан.
- Drift: Коммерческий дрейф отсутствует.

## Alternative approaches considered

- **Staff Telegram Magic Link Login**: В задаче T018 успешно зафиксирована как опциональное мобильное улучшение (вход через команду `/login` в боте персонала в один тап без ввода пароля).
- **Waitlist Inngest vs DB Outbox**: Принято решение остаться на проверенной связке Inngest + `deadlineSweeper` fallback (D6) во избежание усложнения монолита.

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-10-24T20:08:41Z
commit: cd8f1b74dea0a5f540a02911c809f0fd672746ec
critical_count: 0
high_count: 0
medium_count: 0
low_count: 3
```

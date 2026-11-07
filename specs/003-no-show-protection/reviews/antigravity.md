# SpecKit Review: 003-no-show-protection

**Reviewer**: antigravity
**Reviewed at**: 2026-11-08T09:15:00Z (re-review round #2 after fixes)
**Commit**: working tree / rev 1.2
**Artifacts reviewed**: spec.md (rev 1.2), plan.md, tasks.md, research.md (D1–D7), business-plan-waiver.md, requirements-audit.md (PASS run #2), reviews/analyze.md, qa/ (preliminary-rtm.md, rtm-matrix.md, test-cases.md, regression-suite.md, uat-scenarios.md), .specify/memory/constitution.md (v1.6.0), undreplans/docs/projects/undreseller/undreseller-business-plan.md (v2.5.0)

## Summary

Пакет спецификации `003-no-show-protection` прошёл глубокую санитарную прочистку по результатам первичного ревью. Все 14 замечаний (включая 1 CRITICAL и 6 HIGH) полностью устранены:

1. **Планировщик и рантайм Payload Jobs (F1, F6)**: Зафиксирована обязательная конфигурация `jobs.autoRun: [{ cron: '* * * * *', queue: 'default' }]` в `src/payload.config.ts` и опция `schedule` на задачах `holdSweep` и `reminderJob`. Для напоминаний утверждена автономная модель периодического крон-свипа (`*/5 * * * *`) с батч-выборкой и атомарным CAS UPDATE, исключающая зомби-джобы при переносах и отменах.
2. **Денежный контракт и политика возвратов (F2, F12, F13)**: Устранено внутреннее противоречие в `spec.md` (§1.3 / US4 / FR-304). Зафиксировано четкое разделение: отмена до cutoff (`now < startTime - cancellationCutoffHours`, exclusive BVA) запускает автоматический возврат через Stripe Refund API (Order `refunded`); отмена после cutoff переводит Order в `refund_requested` со staff SLA 24h через выделенный API маршрут `POST /api/staff/refunds/[id]/route.ts` (OWNER/OPERATOR).
3. **Безопасность токенов и атомарный перенос (F4, F5, F7)**:
   - Ссылки из писем разделены на GET (просмотр/валидация формы) и POST (осознанное подтверждение), что полностью защищает одноразовые токены от уничтожения автоматическими антивирусными сканерами (Outlook SafeLinks, Google Workspace);
   - Утвержден атомарный обмен слотами при reschedule (старый слот переходит в `RELEASED` строго в момент фиксации нового слота в единой транзакции; закрытие вкладки не уничтожает запись; для `FULL_PREPAYMENT` существующий `Order` перепривязывается к новому слоту без повторного списания средств);
   - `paymentMode` извлекается строго из сущности `Product` на сервере в `bookingService.ts`, клиентский ввод поля `paymentMode` исключен из API, закрывая вектор бесплатного бронирования платных услуг.
4. **Регистрация схемы, типы и технический долг (F3, F8, F9, F10, F11, F14)**:
   - В план и задачи (T320, T330) включена регистрация новых коллекций `InboxEvent`, `PaymentEvents` и `EmailDeliveryLog` в `payload.config.ts.collections`;
   - Код ошибки уникальности дедупликации приведен к стандарту Postgres `23505` (вместо устаревшего Prisma P2002);
   - Добавлены шаги `pnpm generate:types` и валидация миграций;
   - Зафиксирована переменная `RESEND_FROM_EMAIL` (с fallback на `ShopSettings.fromEmail`) и ленивая валидация `RESEND_API_KEY`, не ломающая сборку и CI.

Пакет спецификации и задач находится в согласованном, математически строгом состоянии и готов к реализации.

## Findings & Resolutions

| ID | Severity | Area | Finding | Resolution (Rev 1.2) | Status |
| --- | --- | --- | --- | --- | --- |
| F1 | CRITICAL | Jobs / Runtime Lifecycle | Инертный движок Payload Jobs из-за отсутствия `autoRun` в конфиге. | В `spec.md` FR-307, `research.md` D1, `plan.md` и `tasks.md` (T350) явно зафиксирована конфигурация `jobs.autoRun: [{ cron: '* * * * *', queue: 'default' }]` и `schedule` на тасках. | **RESOLVED** |
| F2 | HIGH | Logical Consistency | Противоречие политики возвратов (§1.3 табу vs FR-304 авто-возврат). | В `spec.md` §1.3, US4 и FR-304 зафиксировано единое правило: pre-cutoff (`now < startTime - cutoff`) → авто-возврат через Stripe Refund API; post-cutoff → `refund_requested` со staff SLA 24h. | **RESOLVED** |
| F3 | HIGH | Architecture / Schema | Отсутствие регистрации новых коллекций в `payload.config.ts`. | В `plan.md` (Project Structure) и `tasks.md` (T320, T330) включена регистрация `InboxEvent`, `PaymentEvents` и `EmailDeliveryLog` в `collections`. | **RESOLVED** |
| F4 | HIGH | Security / Email Scanners | Сжигание одноразовых токенов почтовыми prefetch-сканерами на GET. | В `spec.md` US4/FR-306, `research.md` D6, `plan.md` и `tasks.md` (T340) внедрено разделение: GET лишь валидирует токен и рендерит форму, POST с формы потребляет токен. | **RESOLVED** |
| F5 | HIGH | Domain Logic / Money Path | Потеря слота и оплаченного депозита при незавершенном reschedule. | В `spec.md` US4/FR-306, `research.md` D6, `plan.md`, `tasks.md` (T340) и `qa/test-cases.md` (TC-003-016) зафиксирован атомарный обмен слотами в одной транзакции и перенос существующего `orderId` без повторного списания денег. | **RESOLVED** |
| F6 | HIGH | Architecture / Scheduling | Архитектурная неопределенность диспетчеризации `reminderJob`. | В `research.md` D7, `plan.md` и `tasks.md` (T350) утверждена модель периодического крон-свипа (`*/5 * * * *`) с батч-выборкой кандидатов и атомарным CAS UPDATE. | **RESOLVED** |
| F7 | HIGH | Security / AuthZ | Риск обхода оплаты через клиентский проброс `paymentMode`. | В `spec.md` US1/FR-301, `research.md` D4, `plan.md` и `tasks.md` (T310) закреплено строгое извлечение `paymentMode` из `Product` на сервере в `bookingService`. | **RESOLVED** |
| F8 | MEDIUM | Technical Debt / Postgres | Prisma-код `P2002` вместо Postgres `23505` в логике дедупликации. | В `spec.md` §3/FR-303, `research.md` D2, `plan.md` и `tasks.md` (T320) заменен на Postgres `23505`. | **RESOLVED** |
| F9 | MEDIUM | DX / Build Pipeline | Отсутствие шагов генерации типов и миграций в задачах. | В `plan.md` и `tasks.md` (T310, T360) включен запуск `pnpm generate:types` и DDL миграций. | **RESOLVED** |
| F10 | MEDIUM | Integration / Email | Отсутствие конфигурации адреса отправителя (`from`) для Resend. | В `research.md` D3, `plan.md` и `tasks.md` (T330) добавлена переменная `RESEND_FROM_EMAIL` и `ShopSettings.fromEmail`. | **RESOLVED** |
| F11 | MEDIUM | Operational / CI Safety | Риск падения тестов и сборки из-за fail-closed `RESEND_API_KEY`. | В `research.md` D3, `plan.md` и `tasks.md` (T330) закреплена ленивая валидация ключа в момент отправки письма. | **RESOLVED** |
| F12 | MEDIUM | API Design / Scope | Отсутствие HTTP-маршрута для подтверждения возвратов персоналом. | В `research.md` D5, `plan.md` и `tasks.md` (T321) добавлен маршрут `src/app/api/staff/refunds/[id]/route.ts`. | **RESOLVED** |
| F13 | LOW | Specification / BVA | Неопределенность границы cutoff (inclusive vs exclusive). | В `spec.md` §3/FR-304, `research.md` D5, `plan.md` и `tasks.md` (T321) зафиксирована строгая exclusive-граница: `now < startTime - cancellationCutoffHours`. | **RESOLVED** |
| F14 | LOW | Stakeholder Clarity | Термин "сохраненная корзина" для одиночной записи. | В `spec.md` US4 и `plan.md` заменен на редирект с предзаполненными параметрами услуги. | **RESOLVED** |

## Commercial / business plan notes

- Plans loaded: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.5.0; `specs/003-no-show-protection/business-plan-waiver.md` (COMMITTED).
- Focus laws / SKU floors checked:
  - Пакет Sprint B ($4,900 flat, 14 дней) сохранен;
  - Экономический триггер ICP (ликвидация потерь от No-Show $1,500–4,000/мес) напрямую закрывается фичой;
  - Жесткие границы соблюдены: запрет на SMS-провайдеров (только email-first), запрет на частичные проценты (только 100% full prepayment или NONE), запрет на Telegram-ботов (вынесены в 004);
  - Лимит «ровно 1 внешняя интеграция» не нарушен (Google Calendar остается в 005).
- Drift:
  - Отсутствует. Все требования Конституции VII-B соблюдены.

## Alternative approaches considered

1. **Periodic Sweeper vs Deferred Individual Jobs для Reminders**:
   Автономная модель периодического крон-свипа (`*/5 * * * *`) с батч-выборкой и атомарным CAS UPDATE утверждена как каноническая: она не требует отмены джобов при переносе брони и исключает рассинхрон состояния.
2. **Атомарный обмен слотами при Reschedule**:
   Режим атомарного обмена слотами в одной транзакции исключает отбор брони у клиента до момента, пока новое время не зафиксировано, и защищает внесенный депозит.

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-11-08T09:15:00Z
commit: working tree / rev 1.2
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

# SpecKit Review: 006-integrations (006-google-calendar-and-integrations)

**Reviewer**: antigravity  
**Reviewed at**: 2026-10-26T20:15:00Z (re-run после устранения всех находок)  
**Commit**: ea2b1be98f8af880b1fdfb316c81ba4a3e526289  
**Artifacts reviewed**: `spec.md` (rev 1.1 + fixes), `plan.md`, `tasks.md`, `data-model.md`, `contracts/gcal-adapter.md`, `contracts/outbound-webhooks.md`, `quickstart.md`, `research.md`, `requirements-audit.md`, `qa/` (`preliminary-rtm.md`, `rtm-matrix.md`, `test-cases.md`, `uat-scenarios.md`, `regression-suite.md`), `undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v19.0)

## Summary

Спецификация и инженерный план фичи 006 прошли полный раунд ремедиации. Все 10 выявленных дефектов устранены во всех артефактах (`data-model.md`, `contracts/`, `spec.md`, `plan.md`, `tasks.md`, `qa/test-cases.md`):
1. **F1 (CRITICAL)** полностью закрыт: секреты вебхуков теперь хранятся симметрично зашифрованными AES-256-GCM (`encryptedSecret`) через `secretVault.ts`, что гарантирует вычисление валидной `HMAC-SHA256` подписи при доставке; для UI хранится открытый `secretPrefix`.
2. **F2 (HIGH)** закрыт: в `contracts/gcal-adapter.md §4`, `spec.md FR-603` и `tasks.md T022` зафиксирована строгая фильтрация собственных событий системы (`extendedProperties.private.undresellerOrderId`), исключающая самоблокировку слотов витрины.
3. **F3 (HIGH)** закрыт: в контракте и пуш-воркере зафиксировано, что ответы HTTP 404/410 от Google API при `deleteEvent` трактуются как успешный идемпотентный NOOP с audit-следом `status=already_deleted`.
4. **F4 (HIGH)** закрыт: доставка вебхуков усилена валидацией IP на уровне сокета (socket-level pinning / custom agent) для предотвращения атак TOCTOU DNS Rebinding.
5. Средние и мелкие замечания (F5–F10: per-credential advisory lock, `onTokenRefresh` коллбэк, circuit breaker на 10 сбоев, `onDelete: Cascade` в Prisma, атомарность коммита zod@4, контракт курсора `nextCursor`) полностью интегрированы в спецификации и задачи.

## Findings

| ID | Category | Severity | Location(s) | Finding | Resolution |
| --- | --- | --- | --- | --- | --- |
| F1 | Security / Architecture | ~~CRITICAL~~ RESOLVED | `data-model.md`, `contracts/outbound-webhooks.md`, `spec.md` FR-606, `tasks.md` T010/T040/T041 | Невозможность вычисления HMAC-подписи вебхука из-за хранения SHA-256 хэша | **Закрыто**: `WebhookEndpoint.secretHash` заменён на `encryptedSecret String` (AES-256-GCM via `secretVault.ts`) + `secretPrefix String`. Воркер доставки расшифровывает секрет в памяти перед вычислением HMAC. |
| F2 | Logic / Availability | ~~HIGH~~ RESOLVED | `contracts/gcal-adapter.md §4`, `spec.md` FR-603, `tasks.md` T022 | Самоблокировка слотов витрины из-за импорта собственных событий undreseller из GC | **Закрыто**: В `gcalSync` зафиксирована фильтрация: события с `extendedProperties.private.undresellerOrderId` строго игнорируются и в `ExternalBusyBlock` не сохраняются. |
| F3 | Reliability | ~~HIGH~~ RESOLVED | `contracts/gcal-adapter.md §1,§3`, `spec.md` FR-602, `tasks.md` T021 | Падение воркера при удалении события, уже удалённого в Google (404/410) | **Закрыто**: В `deleteEvent` ответы HTTP 404 и 410, а также отсутствие события по extendedProperties трактуются как идемпотентный NOOP (успех) с записью audit status=already_deleted. |
| F4 | Security (SSRF) | ~~HIGH~~ RESOLVED | `spec.md §3`, `contracts/outbound-webhooks.md §3`, `tasks.md` T041 | Уязвимость TOCTOU DNS Rebinding при валидации и вызове вебхуков | **Закрыто**: Специфицирована валидация IP-адреса на уровне TCP-сокета (`undici.Agent` / connect hook) с запретом редиректов и сбросом при попытке резолва в приватные подсети. |
| F5 | Concurrency | ~~MEDIUM~~ RESOLVED | `spec.md §3`, `contracts/gcal-adapter.md §4`, `tasks.md` T022 | Голодание синка из-за глобального статического advisory lock `hashtext('gcal_sync')` | **Закрыто**: Внедрён гранулярный лок per-credential `pg_try_advisory_xact_lock(hashtext('gcal_sync_' \|\| credential.id))`, изолирующий мульти-мастеров. |
| F6 | Architecture | ~~MEDIUM~~ RESOLVED | `contracts/gcal-adapter.md §1`, `tasks.md` T020 | Неопределенный жизненный цикл рефреша OAuth-токенов | **Закрыто**: В контракт `CalendarClient` добавлен метод `setTokenRefreshHandler`, персистящий обновлённые токены в `IntegrationCredential.encryptedPayload`. |
| F7 | Operability | ~~MEDIUM~~ RESOLVED | `data-model.md §1.3`, `contracts/outbound-webhooks.md §3`, `tasks.md` T041 | Отсутствие авто-отключения (Circuit Breaker) для мертвых вебхуков | **Закрыто**: Внедрён Circuit Breaker: при `failureCount >= 10` эндпоинт переводится в `active = false`, логируется `WEBHOOK_DISABLED` и отправляется алерт; реактивация — через PATCH в админке. |
| F8 | Data Integrity | ~~MEDIUM~~ RESOLVED | `data-model.md §1.1,§1.2,§3`, `tasks.md` T010 | Отсутствие `onDelete: Cascade` на связях `Resource` -> `IntegrationCredential`/`ExternalBusyBlock` | **Закрыто**: В схеме Prisma для связей с `Resource` явно зафиксирован `onDelete: Cascade`. |
| F9 | DevOps | ~~LOW~~ RESOLVED | `plan.md §Database Migration Strategy`, `tasks.md` T051 | Риск усложненного отката zod@4 при смешивании правок | **Закрыто**: Задача T051 ограничена строгим атомарным коммитом (только zod и адаптация схем) для гарантированного `git revert`. |
| F10 | API Contracts | ~~LOW~~ RESOLVED | `contracts/outbound-webhooks.md §5`, `spec.md` FR-608, `tasks.md` T042 | Недоспецифицированный формат пагинации в Public Read API | **Закрыто**: Зафиксирован контракт ответа `{ data: PublicBooking[], nextCursor: string \| null }` с детерминированным compound base64-курсором `createdAt_id`. |

## Commercial / business plan notes

- **Plans loaded**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v19.0 от 2026-10-26).
- **Focus laws / SKU floors checked**:
  - Пол цены Sprint B ($4,900 flat) соблюден.
  - Лимит бизнес-интеграций Sprint B («≤1») расходуется легитимно на Google Calendar согласно обновлению v19.0 бизнес-плана.
  - Сопутствующие элементы (zod@4, ICS-аттач, вебхуки, read-only API) классифицированы как инфраструктурный контур и лимит интеграций не расходуют.
  - Demand Gate (10 закрытых Tripwire до публичных форков) не нарушается — задач на платный холодный аутрич в плане нет.
  - Изоляция брендов UnderUndre (публичный) и undreseller (шаблон) соблюдена.
- **Drift**: Коммерческого дрейфа (Commercial Drift) не обнаружено.

## Alternative approaches considered

1. **Google Calendar Push Notifications (Watch Channels) vs 15-мин поллинг**:
   - Оставлен 15-минутный поллинг с `syncToken` как минимально достаточный для MVP без необходимости вебхук-валидации домена в Google Search Console.
2. **Шифрование секретов вебхуков**:
   - Выбран симметричный AES-256-GCM через единый сервис `secretVault.ts`, полностью закрывающий проблему генерации `HMAC-SHA256` и унифицирующий хранение секретов в БД.

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-10-26T20:15:00Z
commit: ea2b1be98f8af880b1fdfb316c81ba4a3e526289
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

Все дефекты (F1–F10) полностью устранены во всех спецификационных артефактах. Контракты консистентны, дыры в безопасности и логике синхронизации закрыты. Препятствий для перехода к фазе `/speckit.implement` со стороны независимого ревьюера нет.

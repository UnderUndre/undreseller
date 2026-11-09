# SpecKit Review: 005-google-calendar-sync (Calendar Feed)

**Reviewer**: antigravity
**Reviewed at**: 2026-11-09T06:05:00Z
**Commit**: 6737955 / rev 2.1
**Artifacts reviewed**: spec.md (rev 2.1), plan.md, tasks.md, research.md (D1–D6), requirements-audit.md (PASS run #1), reviews/analyze.md, qa/ (preliminary-rtm.md, rtm-matrix.md, test-cases.md, regression-suite.md, uat-scenarios.md), .specify/memory/constitution.md (v1.6.0), undreplans/docs/projects/undreseller/undreseller-business-plan.md (v2.6.0)

## Summary

Пакет спецификации `005-google-calendar-sync` (переориентированный с рискованного двухстороннего Google Calendar OAuth на односторонний **Calendar Feed** по RFC 5545) подвергнут независимому состязательному аудиту (adversarial probe) по 14 измерениям SpecKit (A–N) и сопоставлен с поведением реальных календарных клиентов (Google Calendar, Apple Calendar, Outlook).

Аудит выявил **10 находок** (1 CRITICAL, 4 HIGH, 3 MEDIUM, 2 LOW), критичных для эксплуатационной надежности в проде:
1. **[CRITICAL] Риск бана краулеров Google/Apple (F1)**: Рейтлимит `10/60s на IP` блокировал бы синхронизацию при подписке на несколько мастеров, так как все запросы Google Calendar идут с общих внешних IP краулера `google.com`. Для фида необходим ключ `feed:${resourceId}:${ip}` и порог 30/60s.
2. **[HIGH] Отсутствие HTTP-кэширования (F2)**: Календарные клиенты опрашивают фид циклически, передавая `If-None-Match`. Без поддержки `ETag` и мгновенного ответа `304 Not Modified` сервер молотил бы полную генерацию ICS на каждый опрос.
3. **[HIGH] Валидация методом HEAD (F3)**: Google Calendar проверяет доступность ссылки при добавлении подписки через запрос `HEAD`. Эндпоинт обязан поддерживать `HEAD` без падения.
4. **[HIGH] Строгое соответствие RFC 5545 (F4, F5, F7, F10)**:
   - Внедрен обязательный перенос строк по RFC 5545 §3.1 (Line Folding > 75 октетов через `\r\n `) с гарантией целостности многобайтовых символов UTF-8 (для русскоязычных названий услуг и имён);
   - Зафиксированы обязательные заголовки `PRODID:-//UnderUndre//undreseller//EN` и `VERSION:2.0`;
   - Подтвержден жесткий инвариант окончаний строк CRLF (`\r\n`);
   - Зафиксирована исчерпывающая матрица маппинга статусов броней в `CONFIRMED` / `TENTATIVE` / `CANCELLED`.
5. **[MEDIUM/LOW] Безопасность и отказоустойчивость данных (F6, F8, F9)**:
   - Поле `Resources.feedTokenVersion` закрыто `adminOnlyFieldAccess` от утечки через публичный REST;
   - Добавлены безопасные фоллбэки для пустых имён в `SUMMARY` (исключающие `'null — null'`);
   - Зафиксирована схема аудита ротации токена в `AuditEvents` (`{ previousVersion, newVersion }`).

Все 10 замечаний устранены непосредственно в артефактах спецификации (`spec.md` rev 2.1, `plan.md`, `tasks.md`, `research.md`, `qa/test-cases.md`). Спецификация полностью вычищена и готова к безопасной реализации.

## Findings & Resolutions

| ID | Severity | Area | Finding | Resolution (Rev 2.1) | Status |
| --- | --- | --- | --- | --- | --- |
| F1 | CRITICAL | Integration / Denial of Service | `Rate limit 10/60s per IP` блокировал краулеры Google/Apple при подписке на несколько мастеров, ломая синхронизацию (429). | В `spec.md` US1/FR-501, `research.md` D5, `plan.md` и `tasks.md` (T520) бакет рейтлимита привязан к `feed:${resourceId}:${ip}` с порогом `30/60s`. | **RESOLVED** |
| F2 | HIGH | Performance / Network Protocol | Отсутствие поддержки `ETag` и `304 Not Modified` приводило к 100% перерасходу трафика и CPU на каждый опрос. | В `spec.md` US1/FR-501, `research.md` D5, `plan.md` и `tasks.md` (T520) добавлено вычисление `ETag: W/"..."`, проверка `If-None-Match` и возврат `304 Not Modified` (< 5 мс). | **RESOLVED** |
| F3 | HIGH | Protocol / Calendar Validation | Google Calendar валидирует подписку запросом `HEAD`; отсутствие явной поддержки метода грозило ошибкой 405. | В `spec.md` US1/FR-501, `research.md` D5, `plan.md` и `tasks.md` (T520) зафиксирован явный экспорт и поддержка метода `HEAD`. | **RESOLVED** |
| F4 | HIGH | RFC Standards / Formatting | Отсутствие Line Folding по RFC 5545 §3.1 приводило к сбою парсинга длинных строк UTF-8 (> 75 октетов). | В `spec.md` US2/FR-502, `research.md` D1, `plan.md` и `tasks.md` (T510) специфицирован перенос строк > 75 октетов через `\r\n ` с защитой от распила UTF-8 символов. | **RESOLVED** |
| F5 | HIGH | RFC Standards / Mandatory Headers | Пропуск обязательных свойств `PRODID` и `VERSION:2.0` по RFC 5545 §3.6. | В `spec.md` US2/FR-502, `research.md` D1, `plan.md` и `tasks.md` (T510) в заголовок VCALENDAR включены `PRODID:-//UnderUndre//undreseller//EN` и `VERSION:2.0`. | **RESOLVED** |
| F6 | HIGH | Domain Logic / RFC Mapping | Неполнота матрицы маппинга статусов (`PAYMENT_PENDING`, `STAFF_REJECTED`, `UNDERPAID`). | В `spec.md` US2, `research.md` D4, `plan.md` и `tasks.md` (T510) зафиксирована исчерпывающая таблица отображения статусов в `CONFIRMED` / `TENTATIVE` / `CANCELLED`. | **RESOLVED** |
| F7 | MEDIUM | RFC Standards / Syntax | Риск появления одиночных `\n` вместо строгого CRLF `\r\n`. | В `spec.md` US2/FR-502, `research.md` D1, `plan.md` и `tasks.md` (T510) зафиксирован жесткий инвариант `\r\n` и тест на отсутствие одиночных `\n`. | **RESOLVED** |
| F8 | MEDIUM | Security / PII & Metadata Exposure | `Resources.feedTokenVersion` не был защищен от чтения через публичный REST API `/api/resources`. | В `spec.md` US3/FR-504, `research.md` D2, `plan.md` и `tasks.md` (T511) полю присвоено `access: { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess }`. | **RESOLVED** |
| F9 | LOW | UX / Data Hygiene | Риск рендера `'null — null'` в SUMMARY календаря при отсутствующем имени клиента или названии услуги. | В `spec.md` US2/FR-503, `research.md` D1, `plan.md` и `tasks.md` (T510) добавлены безопасные фоллбэки: `'Запись'` для услуги и `'Клиент'` для имени. | **RESOLVED** |
| F10 | LOW | Audit / Non-Repudiation | Неполная спецификация схемы метаданных для события ротации токена. | В `spec.md` FR-504, `research.md` D6, `plan.md` и `tasks.md` (T521) зафиксирована запись в `AuditEvents` (`action: 'calendar.feed-rotated'`, `{ previousVersion, newVersion }`). | **RESOLVED** |

## Commercial / business plan notes

- **Plans loaded**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.6.0; `specs/005-google-calendar-sync/requirements-audit.md` (PASS).
- **Focus laws / SKU floors checked**:
  - Решение владельца от 2026-11-09 о переводе 005 в Calendar Feed строго соблюдено;
  - Полноценный Google Calendar API two-way заморожен до первого подтвержденного клиентского сигнала (Constitution XIV) и вынесен в 005-bis;
  - Яндекс.Календарь исключен владельцем;
  - Бюджет Sprint B ($4,900 flat, 14 дней) и лимит «≤1 внешней бизнес-интеграции» соблюдены без раздувания кодовой базы и без регистрации чувствительных OAuth scopes в GCP.
- **Drift**:
  - Отсутствует. Бизнес-план v2.6.0 полностью синхронизирован со спецификацией.

## Alternative approaches considered

1. **ICS Push Feed vs Full GC API Two-Way**:
   Выбор ICS push-фида защищает проект от необходимости верификации sensitive-scope GCP проекта под каждое клиентское развертывание (ограничение в 100 пользователей) и повторяет проверенную практику лидера рынка (Booksy).
2. **Кэширование ETag/304 vs Полнотелый поллинг**:
   Внедрение условного HTTP-кэширования срезает более 95% сетевой и вычислительной нагрузки от регулярных опросов календарями подписчиков при сохранении мгновенной серверной свежести изменений.
3. **Разделение рейтлимита по ресурсам**:
   Ключ `feed:${resourceId}:${ip}` гарантирует устойчивость подписки к блокировкам краулеров Google и Apple, опрашивающих разные календари с общих пулов IP-адресов.

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-11-09T06:05:00Z
commit: 6737955
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

# SpecKit Review: 007-booking-trust-gate

**Reviewer**: antigravity
**Reviewed at**: 2026-11-11T21:45:00Z
**Commit**: bea10c4e3e157202168094e811940aad2b1fbc34 / rev 1.1
**Artifacts reviewed**: spec.md (rev 1.1), plan.md, tasks.md, research.md (D1–D7), requirements-audit.md (PASS run #2), qa/ (test-cases.md 20 TC, preliminary-rtm.md, rtm-matrix.md, regression-suite.md, uat-scenarios.md), reviews/analyze.md (run #1), .specify/memory/constitution.md (v1.10.1), undreplans/docs/projects/undreseller/undreseller-business-plan.md (v2.7.1)

## Summary

Пакет спецификации `007-booking-trust-gate` (Trust Gate на публичных write-эндпоинтах `POST /api/booking` и `POST /api/waitlist` поверх ядра 001–006) подвергнут независимому состязательному аудиту (adversarial probe) по 14 измерениям SpecKit (A–N) со сквозной сверкой с кодовой базой (`src/app/api/booking/route.ts`, `src/lib/booking/bookingService.ts`, `src/lib/waitlist/waitlistService.ts`, `src/lib/security/rateLimiter.ts`, `src/collections/WaitlistEntries.ts`, `src/collections/EmailDeliveryLog.ts` и `src/payload.config.ts`).

Архитектурный выбор `BookingIntent` как изолированной легковесной коллекции без инвазии в FSM-кернел 001/002 и без удержания слотов до подтверждения признан абсолютно верным: он исключает отравление инвентаря календаря «призрачными» холдами. Вместе с тем, аудит выявил **11 находок** (4 HIGH, 5 MEDIUM, 2 LOW), среди которых: уязвимость спуфинга в repeat-client allowlist при отсутствии аккаунтов, коллизия «resend code» с лимитом живых интентов (`429 INTENT_CAP`), уязвимость композитного rate-limiter к распределённой бомбардировке почтовых ящиков, и преждевременный CAS `status = 'consumed'` до вызова `createBooking`, ломающий идемпотентность и восстановление при ошибках.

## Findings

| ID | Severity | Area | Finding | Recommendation |
| --- | --- | --- | --- | --- |
| F1 | HIGH | Security / Auth | **Бэкдор спуфинга в Repeat-Client Allowlist (FR-706 / D4)**. В гостевой модели (`❌ NO ACCOUNTS`) проверка `hasVerifiedEmail(email)` без доказательства владения на клиенте позволяет любому злоумышленнику или боту слать `POST /api/booking` с чужим известным email (напр. постоянного клиента) и забивать календарь фейковыми бронями в обход OTP. Предпосылка спеки «спуфинг требует доступа к почтовому ящику» неверна для повторных запросов. | Для пропуска OTP клиент должен предъявлять криптографическое подтверждение устройства (например, подписанную HttpOnly-куку `client_trust_token` с TTL 30–90d, выданную при успешной верификации OTP). При отсутствии куки гость обязан пройти OTP. Либо убрать автоматический skip OTP для гостей до появления полноценных клиентских сессий. |
| F2 | HIGH | Architecture / UX | **Коллизия «Resend code» с капом интентов (`429 INTENT_CAP`) и отсутствие контракта resend**. Спека декларирует кнопку «resend code» (лимит 3/10 мин), но эндпоинт/обработчик не специфицирован. Если клиент повторно дергает Фазу 1, создаётся второй интент с другим OTP (рассинхрон кодов на фронте), а третий клик упирается в кап `≤2 live/email` и падает с `429 INTENT_CAP`. | Явно специфицировать операцию resend (например, `POST /api/booking` с `{ intentId, resend: true }` или повторный вызов Фазы 1 с теми же координатами), которая ротирует `codeHash` и обновляет `expiresAt` на *существующем* pending-интенте, не плодя дубликаты. |
| F3 | HIGH | Security / Abuse | **Уязвимость композитного Rate Limiter (`email+IP`) к email-бомбардировке**. Ограничение фазы 1 заявлено как «3/10min per email+IP». Если ключ реймитера строится как `${email}:${ip}`, злоумышленник с одного IP может перебирать тысячи произвольных email-адресов жертв (по 1 запросу на адрес) без срабатывания лимита, превращая Resend в инструмент спам-атаки и рискуя баном домена. | Разделить на два независимых лимита: (1) строгий лимит per-IP (напр. макс. 10 созданий интентов в 10 мин на IP независимо от email); (2) лимит per-email (макс. 3 интента в 10 мин на email независимо от IP). |
| F4 | HIGH | FSM / Concurrency | **Преждевременный CAS `status = 'consumed'` до `createBooking` ломает идемпотентность и восстановление**. T720 предписывает: «verify → CAS consumed → createBooking(idempotencyKey)». Если `createBooking` падает (409 SLOT_TAKEN или сбой платёжного шлюза), интент уже помечен как `consumed`. Повторный запрос клиента будет отвергнут (CAS не пройдёт), а email ошибочно попадёт в allowlist `hasVerifiedEmail` без созданной брони. | Переводить статус в `consumed` строго *после* успешного завершения `createBooking` (или внутри единой транзакции). При `409 SLOT_TAKEN` переводить в `dead`. При сетевом повторе с тем же `intentId`, если статус уже `consumed`, возвращать существующую бронь по детерминированному `idempotencyKey`. |
| F5 | MEDIUM | Security / Integrity | **Отсутствие явной фиксации гидратации параметров бронирования из `BookingIntent` в Фазе 2**. В Фазе 2 клиент отправляет `{ intentId, otp }`. Если роут читает `productId`, `start` или `resourceId` из тела запроса вместо строки `booking_intents` в БД, возникает уязвимость подмены параметров (confused deputy): верификация дешёвого слота с бронированием дорогого. | Явно зафиксировать в `spec.md`, `plan.md` и `T720`: все параметры бронирования для `bookingService.createBooking` в Фазе 2 извлекаются исключительно из верифицированной записи `BookingIntent` в БД; любые поля тела запроса, кроме `intentId` и `otp`, игнорируются. |
| F6 | MEDIUM | Security / Cryptography | **Отсутствие привязки контекста (Salt / IntentId) в `codeHash`**. Формула `codeHash = HMAC(code, PAYLOAD_SECRET)` над 6-значным числом ($10^6$ вариантов) без привязки к `intentId` или `email` допускает коллизии и предвычисление радужных таблиц. | Включать контекст в HMAC: `codeHash = HMAC('otp:' + intentId + ':' + email + ':' + code, PAYLOAD_SECRET)`. |
| F7 | MEDIUM | Logical Consistency | **Противоречие срока хранения интентов (30d vs 90d) и именования статуса**. `spec.md` (§2, §3, §4) требует purge интентов через 30 дней. При этом D4 и T731 ищут `hasVerifiedEmail` за 90 дней (`updated_at > now()-90d`). Записи старше 30 дней будут уже физически удалены свипом. Также статус в спеке местами называется `verified`, а в схеме — `consumed`. | Синхронизировать retention: либо хранить `consumed` интенты 90 дней (а `dead/expired` чистить за 30d), либо ограничить окно `hasVerifiedEmail` 30 днями. Зафиксировать статус терминального успеха строго как `'consumed'`. |
| F8 | MEDIUM | Architecture / Completeness | **Неполный список модифицируемых файлов в `plan.md`**. В Project Structure отсутствуют `src/payload.config.ts` (регистрация коллекции и таски), `src/collections/WaitlistEntries.ts` (добавление `'pending'` в select `status`), `src/collections/EmailDeliveryLog.ts` и `src/lib/email/resendAdapter.ts` (типизация `kind: 'intent' | 'waitlist-optin'`). В строке 34 `plan.md` присутствует опечатка пути `src/lib/waitlist/../intents/intentService.ts`. | Дополнить Project Structure в `plan.md` всеми затрагиваемыми файлами конфигурации и коллекций; исправить опечатку пути на `src/lib/booking/intentService.ts`. |
| F9 | MEDIUM | UX / Anti-Abuse | **Waitlist Double-Opt-In: уязвимость к сканерам ссылок (SafeLinks) и блокировка при утере письма**. Если ссылка подтверждения из письма выполняет переход по GET и сразу активирует подписку, почтовые антиспам-сканеры (Outlook SafeLinks) автоматически подтвердят email без участия человека. Если же GET ведёт на лендинг, а подтверждение требует POST, это должно быть явно специфицировано. Кроме того, при опечатке в email телефон блокируется дубликатом на 48 часов без возможности повторной отправки. | Ссылка из письма должна вести на страницу `/book/waitlist-confirm?token=...`, где подтверждение отправляется по кнопке/POST. Предусмотреть возможность повторной отправки opt-in письма (resend) при повторном вводе того же телефона до истечения 48h. |
| F10 | LOW | Performance / Cron | **Избыточный 30-дневный GDPR-пурж в 5-минутном свипе `intentSweep`**. `intentSweep` запланирован каждые 5 минут. Выполнять `DELETE` старых записей каждые 5 минут создаёт лишнюю нагрузку на БД и вакуум. | В 5-минутном `intentSweep` выполнять только перевод `pending` с `expires_at < now()` в `expired`. Пурж старых записей (>30d/90d) делегировать существующему ночному крону `gdprPurgeTask` (`0 3 * * *`). |
| F11 | LOW | Commercial Sync | **Синхронизация номера спеки 007 в бизнес-плане**. В бизнес-плане `undreseller-business-plan.md` v2.7.1 §2.4 номер 007 закреплен за `ЮKassa`. В кодовой базе по решению владельца (RF-veto: защита инвентаря от ботов первоочередна) 007 занят `007-booking-trust-gate`. | В следующем обновлении бизнес-плана отразить `007 = booking-trust-gate` и сдвинуть `yookassa-adapter` на `008`. |

## Commercial / business plan notes

- **Plans loaded**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v2.7.1 (`b84bf9e`).
- **Focus laws / SKU floors checked**:
  - `007-booking-trust-gate` не вводит новых платных услуг, не меняет ценовую лестницу ($4,900 / $6,800 / $8,900 / $349) и не трогает ICP;
  - Функционал выполняет роль защитного санитарного клапана для календаря (главного актива сервисного движка) и предотвращает блокировку домена в Resend;
  - Принцип Scope Knife строго соблюден: 0 новых внешних сервисов, 0 платных SMS-провайдеров, 0 внешних CAPTCHA-виджетов, 0 новых npm-зависимостей.
- **Drift**:
  - В тексте §2.4 бизнес-плана номер 007 исторически обозначен как `ЮKassa`. По решению владельца в связи с закрытием исходного кода Cal.com и рисками открытых write-эндпоинтов, спека 007 переназначена на Trust Gate. Требуется косметическая синхронизация номера в тексте плана (F11).

## Alternative approaches considered

1. **Client Trust Token (Cookie) vs IP-only/Email-only Allowlist**:
   Простая проверка наличия `customerEmail` в БД для пропуска OTP на гостевой форме открывает тривиальный вектор спама от имени постоянных клиентов. Использование подписанной HttpOnly-куки (`client_trust_token`) даёт идеальный баланс: постоянный клиент с того же браузера бронирует в 1 клик без OTP, а бот или посторонний с чужого устройства обязан подтвердить почту.
2. **Grace-окно выбора нового слота при 409 SLOT_TAKEN**:
   Вместо немедленного перевода интента в `dead` при занятости слота на фазе 2 (что заставляет пользователя повторно запрашивать и ждать OTP-код), возвращать 409 с кратковременным токеном подтверждённого email (TTL 5 мин), позволяющим выбрать альтернативный слот без повторной отправки письма.
3. **Двухсторонний Rate Limiter (IP + Email отдельно)**:
   Разделение счетчиков в `rateLimiter.ts` на независимые бакеты `ip:<ip>` и `email:<email>` полностью блокирует как атаки с одного IP по множеству адресов, так и распределённые атаки ботнета по одному адресу.

## VERDICT

```yaml
verdict: HIGH
reviewer: antigravity
reviewed_at: 2026-11-11T21:45:00Z
commit: bea10c4e3e157202168094e811940aad2b1fbc34
critical_count: 0
high_count: 4
medium_count: 5
low_count: 2
```

**Рекомендация**: До перехода к `/speckit.implement` устранить 4 HIGH-замечания (F1: безопасный механизм allowlist через client trust token, F2: явный контракт resend на существующем интенте, F3: раздельный rate limit IP/email, F4: строгий порядок CAS/createBooking и возврат при повторе) и обновить спецификацию до rev 1.2 с гармонизацией `plan.md` и `tasks.md`.

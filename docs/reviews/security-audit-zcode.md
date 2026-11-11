# SpecKit Security Audit Report (whole-repo)

**Auditor**: `zcode` (2 параллельных STRIDE-агента: authn/authz+money, config/injection/DoS/GDPR; ground-truth spot-check главных клеймов выполнен главной сессией)
**Audited at**: 2026-11-12T01:10:00+02:00
**Canon**: `UndeRoute/.claude/commands/speckit.security-auditor.md` — OWASP Top 10:2025, STRIDE, NIST SP 800-218, PCI DSS v4.0.1 scope, ISO 27001 (8.25/8.28), GDPR/152-ФЗ + скиллы vulnerability-scanner (checklists, llm-security-shield), red-team-tactics, api-patterns
**Scope**: весь src + next.config + docker-compose + lockfile + git-история (.env)
**Pass Status**: `Critical: 0 (новых) | High: 3 | Medium: 17 | Low: 13` + 1 зарегистрированный в code-review BLOCKER (A01), входящий в общий риск-профиль

---

## 0. Cross-reference (уже зарегистрировано в code-review)

- **[F-BE-02] [BLOCKER→A01 Broken Access Control]** IDOR: клиентский `idempotencyKey` → accessToken чужой брони. В терминах OWASP — верхняя находка этого аудита.
- **[F-BE-04]** staff-auth тавтология → A01/A07 Privilege Escalation; **[F-BE-05]** raw-токены в job input → A04/A08; **[F-BE-03]** webhook CAS → A10.
- Здесь не дублируются, но входят в fix-очередь.

## 1. 🚨 High

### [SEC-B-01] [High] (A02; STRIDE:T) Postgres опубликован на 0.0.0.0:5432 с fallback-паролем `postgres/postgres` — подтверждено
- **Location:** `docker-compose.yml:28,31`
- **Attack:** Docker публикует порты через iptables DNAT **в обход UFW INPUT** (правило нужно в DOCKER-USER). Сканер на VPS находит Postgres 16 → `postgres:postgres` (если .env без POSTGRES_PASSWORD) → полный дамп PII (intents, брони, orders, waitlist) или `COPY ... FROM PROGRAM` → RCE контейнера.
- **Fix:** убрать `ports` (app ходит по service-name) или биндить `127.0.0.1:5432:5432`; правило DOCKER-USER; `${POSTGRES_PASSWORD:?err}` fail-closed.

### [SEC-A-02] [High] (A09/A02; STRIDE:I/S) accessToken заказа логируется в stdout — эскалация до удалённого refund
- **Location:** `src/components/forms/FindOrderForm/sendOrderAccessEmail.ts:51` — `console.log('[sendOrderAccessEmail] Email body:', emailBody)` (подтверждено)
- **Attack:** `docker logs`/log-агрегатор → grep `accessToken=` → `POST /api/telegram/client/webhook` `/start <accessToken>` привязывает чат атакующего к заказу → cancel через клиентский callback → **slot release + auto-refund**. Утечка токена = удалённый триггер возврата денег.
- **Fix:** удалить console.log; логировать только order.id; асимметрично — перейти на короткоживущие ссылки.

### [SEC-A-01] [High] (A07/A02; STRIDE:S/D) (Confidence 70) Весь per-IP rate limiting держится на подделываемой XFF-эвристике
- **Location:** `src/lib/security/rateLimiter.ts:56-73`; все публичные роуты
- **Attack:** (1) прямой доступ к origin (мимо Cloudflare) → свой `X-Forwarded-For` на каждый запрос → все IP-лимиты мёртвые; (2) запрос без XFF → ключ `'unknown'` → один bucket на весь мир → глобальный 429-лок легитимных клиентов.
- **Fix:** fail-closed при исчерпании цепочки + платформенный `CF-Connecting-IP` только при фактическом Cloudflare; см. SEC-B-18 (bind 127.0.0.1 при dockerизации app).

---

## 2. ⚠️ Medium (17)

| ID | OWASP/STRIDE | Location | Суть / Fix (кратко) |
|---|---|---|---|
| **SEC-B-02** | A02/T | `next.config.ts` (проверено: 0 headers) | Нет CSP/HSTS/XFO/XCTO/Referrer-Policy, `X-Powered-By` светится; clickjacking админки и booking-форм; токены в Referer. → `headers()` + `poweredByHeader:false` |
| **SEC-B-03** | A02/D | `src/app/(payload)/api/graphql/**` | Публичный GraphQL с introspection, playground и без depth-лимитов → карта схемы + дешёвый DoS. → `graphQL.disable()` в prod |
| **SEC-B-04** | A02/D | Payload REST на публичных read-коллекциях | `?limit=10000&depth=10` не капается → DB-exhaustion. → `maxLimit` в коллекциях |
| **SEC-B-05** | A02/D | `src/app/api/availability/route.ts` | Единственный мутирующе-тяжёлый GET без rate limit: computeSlots + SQL на запрос. → `checkRateLimit` + LRU-кэш (serviceId+date → slots, 15-30s) |
| **SEC-B-06** | A02/D | `GET /api/booking/[id]/reschedule|cancel` | GET-валидация токенов без лимита, id-оракул (404 vs 403). → лимит + generic 403 |
| **SEC-B-07** | A09/I | `sendOrderAccessEmail.ts:51`, `bookingService.ts:302`, telegram webhook routes:37/29 | Секреты и PII в stdout: accessToken, полный Stripe-объект, сырые TG-апдейты. → логировать `{ message, code }` |
| **SEC-B-08** | A06/GDPR/I | `src/jobs/gdprPurge.ts` (проверено: orders/slot_reservations НЕ purge'ятся) | PII клиентов (email/имя/телефон) в терминальных orders живёт вечно — 152-ФЗ ст.5 ч.5, GDPR 5(1)(e). Право на удаление отсутствует. → анонимизация терминальных записей >90д + self-service erase |
| **SEC-B-09** | A05/T | `products/[slug]/page.tsx:115-116` (подтверждено) | JSON-LD: `JSON.stringify` без escape `</script>` в dangerouslySetInnerHTML → stored XSS из admin-полей товара. → `.replace(/</g,'\\u003c')` |
| **SEC-A-03** | A02/A10/E | `rateLimiter.ts:44-48` | `assertSingleInstance` — мёртвый код (0 вызовов): N реплик = лимиты ×N. → вызвать на boot или Redis-лимитер |
| **SEC-A-04** | A01/A07/D/I | `intentService.ts` капы + resend | Email-флуд на жертву: 2 live intent → 3 письма/10мин бесконечно; intentId последовательные + различение 404/403 = enumeration oracle. → единый ответ, rotate вместо отказа |
| **SEC-A-05** | A08/T | `refundService.ts:24-79` | TOCTOU без FOR UPDATE/CAS: проигравший гонку пишет `refund_failed` поверх `refunded` → ложный ledger → ручной double-refund из Stripe dashboard. → транзакция + CAS + сверка с webhook |
| **SEC-A-06** | A01/E/S | `staffBot.ts:59` + `staffBot.ts:89-118` (новый угол к F-BE-04) | Отозванный staff и любые участники group-чата сохраняют права; `complete` идёт мимо FSM прямым CAS на orders. → серверный allow-list чатов на callback, инвалидация кнопок |
| **SEC-A-07** | A01/S | `clientBot.ts:112-124` | acknowledgeByOrder БЕЗ TgLink-проверки (dormant — кнопки не рассылаются, но код живой). → добавить tg_links-гейт до включения |
| **SEC-A-08** | A06/A04/T | `booking/route.ts:109-131` trust-cookie путь | Прямой createBooking минует grid-валидацию: несуществующий resourceId → 500; вне-сеточные старты дробят расписание. → тот же grid-валидатор |
| **SEC-A-09** | A07/S | `Users/index.ts:47-114` | Password policy отсутствует ("1" проходит); смена email без re-auth. → minLength 12 + re-auth |
| **SEC-A-10** | A02/A01/I | `feedToken.ts:12-18` + feed route:63-85 | Вечный URL-bearer токен календаря (HMAC без TTL, ротация только ручная) + имена клиентов в ICS. → авто-ротация, убрать имена |
| **SEC-A-12** | A02/T | `next.config.ts` (дубль SEC-B-02 по T-углу) | Без Referrer-Policy токены в URL утекают через Referer со страниц брони. → см. SEC-B-02 |

## 3. 📋 Low (13)

**SEC-A-11** (A01/I) последовательные ID — existence/status oracle → единый 404. **SEC-A-13/B-16** (A07) JWT 14д без revocation, login без per-IP RL (lockout 5/аккаунт есть) → 7д + `removeTokenFromSessions`, CF WAF-правило на login. **SEC-A-14** (A10/D) `/api/availability` + GET booking/[id] без лимита → см. SEC-B-05. **SEC-A-15** (A10/T) `charge.refunded` без сверки суммы → partial refund помечает ордер полностью refunded. **SEC-B-10** (A03/A05) patch drizzle-kit заменяет параметризацию строковой интерполяцией (dev-only). **SEC-B-11** (A02/D) server action find-order без RL + гостевой запрос всегда пуст (dead-end фича). **SEC-B-12** (A05/D) нет капа длины email/body на booking/waitlist. **SEC-B-13** (A01/I) enumeration waitlist по дифференцированным ошибкам. **SEC-B-14** (A04/I) токены в URL — известный trade-off email-ссылок, компенсируется Referrer-Policy. **SEC-B-15** (A02) Media upload без mimeTypes/maxFileSize (SVG-вектор из админки). **SEC-B-17** (A02) payload.config без явных serverURL/cors/csrf — харденинг на умолчаниях. **SEC-B-18** (A02/D) clientIpFrom: при dockerизации app публиковать только 127.0.0.1.

## 4. Supply Chain (A03)

- `pnpm audit --prod`: **0 critical / 0 high / 1 moderate (esbuild ≤0.24.2, dev-only) / 1 low (deepmerge через payload)** — канон «0 high/critical» выполнен. Оба транзитивные — апдейт с релизом payload.
- Lockfile pinned, версии захардкожены, `overrides: next 16.4.1`, postinstall/curl|bash нет, SBOM не генерируется (низкий приоритет для одиночного сервиса).

## 5. Defense strengths (калибровка вердикта)

1. **Double-booking закрыт на уровне БД**: advisory locks + CAS по schedule_version + GiST exclusion как бэкстоп — не на честном слове кода.
2. **Stripe webhook честно верифицирован**: SDK constructEvent с секретом (400 on tamper), dedupe в одной транзакции с доменными записями, amount/currency инвариант fail-closed.
3. **Токенный канон**: только дайджесты, timing-safe с length-guard, HMAC-биндинг OTP (intentId+email), 122-бит UUID-нонсы, версии feed-токенов.
4. **Fail-closed boot**: PAYLOAD_SECRET обязателен, bootstrap OWNER закрыт двойным замком (X-Bootstrap-Token + field-hook), deny-by-default системные коллекции.
5. **SQL-инъекций нет**: ~50 sql``-блоков параметризованы; единственный sql.raw — на константе; eval/exec/spawn отсутствуют.
6. Scanner-safe GET-cancel, OTP-письмо без PII, double-opt-in waitlist, salted recipient-hash.

## Attack surface summary

Самая лакомая поверхность — **гостевой контур токенов**: accessToken/cancelToken/rescheduleToken раздаются в REST-ответах и письмах, уже засветились в логах (SEC-A-02) и живут в query-параметрах; accessToken через Telegram deep-link эскалируется до удалённого refund-триггера. Вся защита публичных write-поверхностей упирается в одну XFF-эвристику и один process-local Map — подделка заголовка или N реплик снимает единственный барьер (компенсация: 5-попыточный OTP-dead-гейт). **Инфраструктурный хвост** — docker-порт Postgres и отсутствие security headers. Деньги-на-выход (refunds) защищены архитектурно хорошо: остаточный риск — лживый ledger, а не кража.

---

## VERDICT

```yaml
verdict: HIGH
auditor: zcode
audited_at: 2026-11-12T01:10:00+02:00
critical_count: 0   # новых; F-BE-02 (A01) из code-review остаётся общим BLOCKER
high_count: 3
medium_count: 17
low_count: 13
compliance:
  pci_dss_scope: PASS (CDE изолирован — card data только в Stripe, нигде не хранится)
  iso_27001_8_28: WARN (security headers / логи-секреты / erase-воркфлоу)
  gdpr_152fz: WARN (retention gap orders/slot_reservations, нет self-service erasure)
  supply_chain: PASS (0 high/critical, lockfile pinned)
```

**REWORK REQUIRED (High-секция)** — fix-очередь: SEC-B-01 (порт Postgres) → SEC-A-02/B-07 (секреты в логах) → SEC-B-02 (headers) → SEC-A-01 (IP-доверие) → SEC-B-08 (GDPR retention) → SEC-B-09 (JSON-LD XSS).

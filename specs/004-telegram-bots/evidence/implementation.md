# Implementation Evidence: 004-telegram-bots

**Implemented**: 2026-11-09 · **Tasks**: T410–T460 (9/9) · **Gate override**: `reviews/_gate-override.md` (owner approval, 1/2 external)

## Gate 0 (exit) — all green

| Gate | Result |
| --- | --- |
| `npm run validate` (tsc --noEmit) | **0 errors** |
| `npm run lint` | **0 errors** (196 warnings — pre-existing `no-explicit-any`-профиль; см. открытие №6 ниже про playwright-report) |
| `npm run test:int` | **142/142 passed** (129 legacy + 13 new), несколько прогонов подряд зелёные |
| `npm run build` | **0 exit** |
| `pnpm audit --prod` | **0 H/C** (1 low + 1 moderate, pre-existing; grammy чист) |
| `pnpm generate:types` | regenerated (TypedJobs + TelegramOutbox/TgLink/Blacklist/ShopSettings) |
| **New dep** | `grammy 1.46.0` — ровно один (NFR-402) |

## What shipped (per task)

- **T410**: `botManager` (ленивая инициализация по `STAFF_BOT_TOKEN`/`CLIENT_BOT_TOKEN`, healthcheck `waitForBots`, no-op деградация — боты опциональны); `security.ts` timing-safe secret, **fail-closed** при отсутствующем секрете; webhook-роуты `/api/telegram/{staff,client}/webhook` с 200-деградацией (canon 007 F-06).
- **T420**: `TelegramOutbox` — полные примитивы ревью F1 (`bot`, `actionType`, `messageId`, `replyMarkupJson`, `sentMessageId`, `aggregateType/Id`); `outbox.ts` — enqueue (best-effort, не роняет домен), classifyError (PERMANENT_NO_OP/RATE_LIMIT_429/TRANSIENT), **CTE SKIP LOCKED claim** (канон F5), starvation-boost; **JS-ре-сортировка батча** (UPDATE…RETURNING не сохраняет ORDER BY — открытие №2); dispatch job `*/30s`, батч ≤25; `jobs.autoRun: [{ cron: '*/30 * * * * *', limit: 25 }]` (F6, тип `AutorunCronConfig.limit` подтверждён по dist).
- **T430**: 3-уровневая staff-авторизация (L1 ShopSettings.staffChatIds **под adminOnlyFieldAccess** — F4; L2 env; L3 чат карточки); **2-шаговый confirm-barrier** (F7: REQUIRES_CONFIRMATION → CONFIRMED, re-arm после); карточка с маскированным телефоном и 5 кнопками (callback_data несёт reservationId+scheduleVersion); **D9**: createBooking автоматически ставит карточку пейджера (`bot:'staff'`, priority 50, best-effort); complete — order-level с предусловием `processing` + активная BOOKED (F11).
- **T431**: `issueRescheduleToken` (новый nonce, CAS bump + advisory lock + audit `booking.reschedule-token-issued`); staff reschedule → deep-link клиенту через outbox, **fallback** при отсутствии TgLink (F12).
- **T440**: `TgLink` — составной UNIQUE (chat_id, order_id) (F8, повторные брони не затираются); `/start <accessToken>` идемпотентный; callbacks несут orderId (`c:ack:`/`c:dec:`); **`cancelBookingByClientChat`** — доменный шов (F3): авторизация по TgLink → FSM CUSTOMER_CANCEL → политика возвратов 003 (auto-refund до cutoff / refund_requested после) → audit `booking.cancel-by-telegram` → staff alert (HIGH); 24h cooldown.
- **T441**: `Blacklist` (chatId?/phone? — валидатор «хотя бы один» + per-channel дедуп, F9); enforcement — callbacks blacklisted + 0 мутаций, клавиатура очищается через outbox.
- **T450**: `redaction.ts` — адресная редакция ДОСТАВЛЕННЫХ карточек по `sentMessageId` (editMessageText CRITICAL=100, `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ]`, клавиатура снимается); `gdpr-purge` nightly — TgLink 90d после терминала (BVA), outbox text/meta 30d.

## Race / security proofs (test artifacts, 13 новых тестов)

- **CTE claim-race**: два claimBatch не делят строки; **kill-worker** — expired-lease 'sending' строка возвращается в пул и доставляется ровно один раз (0 потерь/дублей) — TC-004-001/002.
- **429-cooldown**: retry_after парсится (unit-контракт classifyError) — TC-004-003.
- **Приоритеты**: CRITICAL > HIGH; starvation-boost ключ подтверждён relative-order тестом — TC-004-004.
- **Auth-matrix**: fail-closed secret ×3 ветки; 2-шаговый barrier (1 клик ≠ мутация) — TC-004-009/020.
- **Linking**: идемпотентный /start; повторные брони одного chatId — обе связи живы — TC-004-010.
- **Decline через seam**: RELEASED + audit `booking.cancel-by-telegram`; несвязанный чат → LINK_NOT_FOUND 403 — TC-004-012.
- **Blacklist**: по chatId/phone, дуп-валидатор, enforcement 0 мутаций — TC-004-013/014.
- **Purge BVA**: 89 жив / 90+91 удалены — TC-004-018.
- **Redaction**: адресная правка по sentMessageId, CRITICAL обгон — TC-004-017.

## Implementation discoveries (не выводимы из спек)

1. **Payload не плюрализует имена таблиц**: slug `blacklist` → таблица `blacklist` (а не `blacklists`) — канон: имя = slug в snake_case.
2. **UPDATE…RETURNING не сохраняет ORDER BY** CTE — батч клейма пересортирован в JS по starvation-ключу; иначе пейджер шлёт карточки в физическом порядке heap'а.
3. **`AutorunCronConfig.limit`** существует (default 10) — без `limit: 25` дефолт ломал батч-семантику (подтверждено по `queues/config/types/index.d.ts`).
4. **Payload CompoundIndex не умеет WHERE** — партиальные уникальные индексы Blacklist реализованы beforeValidate-дедупом (равномерно для push/migration).
5. **Числовые колонки NUMERIC/счётчики** возвращаются из pg строками — коэрс `Number()` обязателен и в тестах, и в продукте (уже канон 003).
6. **`playwright-report/trace/*.js`** (минифицированные бандлы trace-viewer) ломали lint-гейт 259 фейковыми ошибками — добавлены в eslint ignores.

## Residual risks / deferred

- **NFR-404 (≤500 MB)** и **live Telegram e2e** (реальный Bot API, webhook handshake, 429 в бою) — на qa-signoff staging (канон 003).
- **confirm-barrier in-memory**: рестарт обнуляет барьеры — принят (CAS — единственный инвариант корректности, analyze A4).
- **grammY Bot.init/getMe** не вызывается в тестах (только api-методы через seam) — live-проверка на staging.

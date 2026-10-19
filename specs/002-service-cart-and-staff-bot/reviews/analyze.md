# SpecKit Analyze: 002-service-cart-and-staff-bot

**Reviewer**: analyze (ZCode self-consistency)  
**Reviewed at**: 2026-10-19T11:45:00Z  
**Commit**: 15109ff94c3642799357ce55878ec711c38d120e (`undreseller`, branch `002-service-cart-and-staff-bot`)  
**Artifacts**: `spec.md`, `plan.md`, `tasks.md`

---

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| — | — | — | — | Замечания отсутствуют. Спецификация, архитектурный план и задачи согласованы на 100%. Конфликтов зависимостей, неопределённых требований или коммерческого дрейфа не обнаружено. | — |

---

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| :--- | :--- | :--- | :--- |
| `FR-001` Multi-Service Basket | Yes | `T-103`, `T-104`, `T-105`, `T-111` | Приём массива `itemIds: string[]` на бэкенде и в UI |
| `FR-002` Cumulative Duration & Price | Yes | `T-103`, `T-111` | Суммирование длительности и стоимости корзины |
| `FR-002a` Authoritative Cart Snapshot | Yes | `T-103`, `T-114` | Серверная валидация корзины, отсечение дубликатов, неизменяемый `OrderItem` |
| `FR-003` 30-Minute Grid Intervals | Yes | `T-104`, `T-112` | Сетка генерации стартовых окон с шагом 30 минут |
| `FR-004` Contiguous Window Validation | Yes | `T-104`, `T-114` | Проверка сплошного окна длины `totalDurationMin` |
| `FR-005` Global Calendar Exclusion Constraint | Yes | `T-101`, `T-102` | PostgreSQL GiST exclusion constraint по диапазону `tstzrange` |
| `FR-006` Customer Notes & Fixed-Price Policy | Yes | `T-101`, `T-105`, `T-112` | Поле заметок до 1000 знаков с обязательным UI-дисклеймером |
| `FR-007` Dedicated Staff Bot | Yes | `T-106`, `T-107` | Независимый бот мастера `STAFF_BOT_TOKEN` и защищенный вебхук |
| `FR-008` Staff Order Pager Card | Yes | `T-106`, `T-107` | Карточка заказа со всеми деталями и 4 кнопками действий |
| `FR-009` One-Click Staff Approval | Yes | `T-106`, `T-107` | Подтверждение брони мастером и пуш клиенту |
| `FR-010` One-Click Staff Rejection | Yes | `T-106`, `T-107` | Отклонение заявки, освобождение слота в календаре |
| `FR-011` Magic Reschedule Link | Yes | `T-106`, `T-107` | HMAC-подписанная ссылка для переноса с сохранением корзины |
| `FR-012` Omnichannel Client Reminder Dispatch | Yes | `T-108` | Inngest-напоминание за N часов (Telegram TMA / WhatsApp API) |
| `FR-013` Client Positive Confirmation | Yes | `T-109` | Подтверждение визита клиентом в 1 клик и алерт мастеру |
| `FR-014` Smart Auto-Cancellation | Yes | `T-110`, `T-114` | Автоотмена неподтверждённых записей новичков за M часов |
| `FR-015` New vs Regular Client Segmentation | Yes | `T-105`, `T-110`, `T-114` | Сегментация по истории визитов (новичкам — автоотмена, постоянным — сохранение) |
| `FR-016` Pay-On-Site Support | Yes | `T-101`, `T-112`, `T-113` | Выбор оплаты при визите без обязательного перехода к шлюзам |
| `FR-017` Blacklist & Anti-Begging Enforcement | Yes | `T-105`, `T-106`, `T-107`, `T-114` | Блокировка выпрашивающих скидки клиентов с возвратом HTTP 403 |
| `FR-018` Configurable Prepayment Timing | Yes | `T-101`, `T-113` | Настройка момента предоплаты: `IMMEDIATE` vs `AFTER_STAFF_APPROVAL` |
| `FR-019` Authoritative State Machine & Delayed Invoicing | Yes | `T-101`, `T-110b`, `T-117` | Жизненный цикл `AWAITING_PAYMENT`, 15-мин таймер и `PAYMENT_EXPIRED` |
| `FR-020` Telegram GDPR Redaction & PII Minimisation | Yes | `T-101`, `T-106`, `T-107`, `T-117` | Маскирование телефона, `editMessageText` при закрытии/purge |
| `FR-021` Staff One-Click Fulfillment | Yes | `T-106`, `T-107` | Кнопка `[Заказ выполнен / Оплачен]` переводит в `FULFILLED` |
| `FR-022` Refund State Machine & Resolution SLA | Yes | `T-107b`, `T-117` | Жизненный цикл возвратов (`NONE` -> `REFUND_REQUESTED` -> `REFUNDED`) |
| `NFR-001` Slot Query Latency | Yes | `T-104`, `T-114`, `T-119` | Время расчета слотов < 50 мс (p95) |
| `NFR-002` Staff Notification Delivery SLA | Yes | `T-106`, `T-107` | Доставка алерта в Staff-бот < 1.5 секунды |
| `NFR-003` Memory Ceiling | Yes | `T-115`, `T-119` | Потребление памяти контейнера <= 500 MB RAM |
| `NFR-004` GDPR Data Hygiene | Yes | `T-101`, `T-115`, `T-117` | Автоматическая зачистка `customerNotes` и Telegram-сообщений |
| `US1` Multi-Service Cart & 30-Min Hold | Yes | `T-101`, `T-102`, `T-103`, `T-104`, `T-105`, `T-111`, `T-112`, `T-114`, `T-116` | Полное покрытие |
| `US2` Staff Bot Pager & One-Click Actions | Yes | `T-106`, `T-107`, `T-114`, `T-118` | Полное покрытие |
| `US3` Confirmation Reminder & Smart No-Show | Yes | `T-108`, `T-109`, `T-110`, `T-114`, `T-117` | Полное покрытие |
| `US4` Pay-On-Site vs Online Prepayment | Yes | `T-101`, `T-107b`, `T-110b`, `T-112`, `T-113`, `T-113b`, `T-114`, `T-117` | Полное покрытие |

---

## Constitution Alignment Issues

- **Principle VI (Cross-AI Review Gate)**: Первый этап валидации (`analyze.md`) завершен со статусом **PASS**. Спецификация полностью устранила замечания Copilot F1–F18 и готова к повторному независимому ревью.
- **Principle VII (Artifact Versioning)**: Артефакты снабжены версионными снапшот-тегами (`spec/002-service-cart-and-staff-bot/v1`, `clarify/002-service-cart-and-staff-bot/v8`).
- **Principle IX (Two-Phase Review Flow)**: Работа ведется на изолированной planning-ветке `002-service-cart-and-staff-bot`.
- **Principle X (Zero-Downtime Data Architecture)**: Миграция спроектирована по стандарту 4-фазного Expand/Contract с ресурсом `resourceId`, бэкфиллом `totalDurationMin`, защитой через `SET lock_timeout = '2s'`, префлайт-проверкой коллизий (`r1.id < r2.id`) и безопасным `down.sql`.
- **Principle XI (Spike Governance)**: Исследовательские прототипы не требуются, архитектура монолита проверена.

---

## Commercial / Business Plan Alignment

- **Загруженные бизнес-планы**: 
  - `undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v18.3)
  - `undreplans/ROADMAP.md` (v2.6)
- **Проверка жестких законов и фокуса**:
  - Полное соответствие предложению **Sprint B ($4,900 flat / 14 дней)** и Продукту 0 (**Tripwire $350**).
  - Scope knife: корзина услуг расширяет существующий бизнес-процесс (каталог $\to$ холд $\to$ оплата/визит), не создавая второй параллельный продукт. Зафиксировано в `T-113b`.
  - Сохранён лимит памяти контейнера приложения $\le 500\text{ MB RAM}$.
  - Фоновые пайплайны строятся исключительно на коде **Inngest** (запрет n8n в клиентском приложении соблюдён, соблюден лимит Inngest $\le 4$ событий в `cancelOn`).
  - Управление заказами вынесено в служебный Telegram Staff-бот мастера с разграничением `staffDestinationChatId` и `authorizedStaffUserIds`.
  - **Дрифт не обнаружен**: No commercial drift detected.

---

## Unmapped Tasks

Все задачи `T-101`–`T-122` (включая `T-107b`, `T-110b`, `T-113b`, `T-116`–`T-119` и гейты `T-120`–`T-122`) однозначно сопоставлены с функциональными требованиями, разбиты по фазам и параллельным дорожкам без висячих элементов.

---

## Metrics

- **Total Requirements**: 27 (23 FR + 4 NFR)
- **Total Tasks**: 24
- **Coverage %**: 100.0% (27/27)
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
reviewed_at: 2026-10-19T16:15:00Z
commit: 9c142fd4e164ae7ee35d033fa0f9d9cf98bb6bf4
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

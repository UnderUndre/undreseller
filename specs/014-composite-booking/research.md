# Research & Decisions: 014-composite-booking

**Date**: 2026-11-18 · **Feature**: `014-composite-booking` (Option 0 — Composite Booking / слот-контейнер)

---

## 1. Market Verification: делают ли конкуренты эту фичу и как

Все источники — официальная vendor-документация (не маркетинговые презентации, а операционные мануалы продуктов), используются как приоры дизайна, не как доказательства спроса. Спрос подтверждён L1-запросом реального клиента.

### BP-1: YClients — «несколько услуг в одной записи» (canon суммирования)

- **Source**: [Работа с журналом записи — YCLIENTS](https://partners.yclients.com/self-employed/calendar) (vendor docs); вебинар «Индивидуальные услуги и комплексы» ([VK Video playlist](https://m.vkvideo.ru/playlist/-24281380_8)).
- **Mechanism (verbatim из доки):** в одну запись на клиента можно добавить несколько услуг; **общая длительность визита = сумма длительностей выбранных услуг**, это время блокируется в журнале одним окном; стоимость суммируется.
- **Decision → Adopted (FR-1402/1403):** слот-контейнер с `Σ durationMin` — ровно Option 0. Никаких N броней на один визит.

### BP-2: YClients — «комплекс как отдельная услуга»

- **Source:** та же дока настроек услуг (Настройки → Настройки записи → Услуги).
- **Mechanism:** повторяющийся набор можно оформить **одной услугой-комплексом** со своей (произвольной, например скидочной) ценой и длительностью, не обязанной равняться сумме частей.
- **Decision → Adopted без кода (SC-003):** наша модель `Product` уже это умеет — создать продукт «Смеситель + фильтр 60 мин / $X» есть чисто админская операция. Выбор «30 мин vs час» = два продукта. Ноль строк кода в 014.

### BP-3: Fresha — itemized состав внутри визита + extra time

- **Source:** [Fresha — управление записями](https://www.fresha.com) (Add service в записи; extra time на услугах/комплексах).
- **Mechanism:** услуги добавляются в запись по одной («Add service»), состав остаётся **позицированным** (не схлопывается в псевдо-услугу), длительность регулируется «extra time» паддингом.
- **Decision → Adopted (FR-1401 snapshot / FR-1405 itemized surfaces):** `items_json` хранит позиции раздельно (title/duration/price per позиция); buffers контейнера = max по позициям — аналог extra time.

### BP-4: Setmore — «Provide Multiple Services», bundles, booking sequence

- **Source:** [Setmore — booking multiple services in one appointment](https://support.setmore.com/en/articles/490980-how-to-let-customers-book-multiple-services-in-one-appointment); [Service & Class Settings](https://support.setmore.com/en/collections/11662311-service-class-settings).
- **Mechanism:** (a) единый booking flow с несколькими услугами в одной брони; (b) бандлы с «Add extra time»; (c) **«Set booking sequence»** — цепочка услуг в заданном порядке (drag-and-drop reorder).
- **Decision:** (a) и (b) приняты (FR-1402/1403/1405); **(c) sequence-chaining = Option 1, REJECTED для этого скоупа** (Via Negativa §1.3: нет multi-order, нет авторазмещения «следующего слота» — отдельная спека по L1-сигналу).

### BP-5: Резюме best-practice-правил индустрии (дистиллировано из BP-1..BP-4)

1. Длительность визита = сумма длительностей позиций (+buffers), один блок в расписании — не N записей.
2. Состав держится itemized (цены/отчёты по позициям живы), не схлопывается в merged-продукт.
3. Повторяющиеся комбинации — отдельным продуктом-комплексом (создаётся админом, ноль кода).
4. Extra time / включённые работы = паддинг/нулевой длительностью, не отдельной бронью.
5. Цепочки и авторазмещение «следующего слота» — отдельная продвинутая фича (sequence), не base-case.
6. Кэпы на количество позиций и общую длительность обязательны (защита грида от абсурдных корзин).

---

## 2. L1 Code-Grounding (проверено по репо, 2026-11-18)

| Артефакт | Факт | Следствие для дизайна |
| :--- | :--- | :--- |
| `src/lib/availability/computeSlots.ts` (PURE) | `computeSlots` принимает `service: { durationMin, bufferBeforeMin, bufferAfterMin }` параметром — **уже полностью параметризован** | Composite = подмена параметров; ядро не трогается (NFR-1403) |
| `src/lib/availability/resolver.ts:126-134` | resolver читает один `product` и подаёт его duration/buffers в computeSlots | Точка расширения: опциональный `composite` override в `ResolveAvailabilityInput` |
| GiST EXCLUDE `(resource_id, tstzrange) WHERE active` | Режет только **пересечение**; стык вплотную легален | Контейнер + смежные брони уживаются без миграций индекса |
| `bookingService.createBooking` | Один `productId` → одна пара `SlotReservation + Order` | `items[]` = надстройка над тем же INSERT; FSM не трогается |
| `intentService` (007) | Фаза 2 гидратирует всё из `booking_intents` | Состав корзины тоже через intent (`items_json`), подмена в теле фазы 2 невозможна |
| ecommerce-плагин carts | Корзины существуют для магазинных товаров, booking их игнорирует | Свою корзину не строим: `items[]` передаётся прямо в бронь; goods остаются в `/shop` |
| `undreseller-legacy/specs/002-service-cart-and-staff-bot/spec.md` | **L1:** легаси проектировало ровно этот контур («непрерывный интервал суммарной длины, сетка 30 минут», GiST на resourceId) | Дизайн-референс портируется; Prisma/Next-15 код — dead weight, не портируется |

---

## 3. Decisions (D1–D8)

| # | Decision | Rationale | Alternative rejected |
| :--- | :--- | :--- | :--- |
| **D1** | Слот-контейнер (одна бронь, Σ длительность) vs N броней под Order | Канон YClients BP-1 + легаси-002 + ноль миграций FSM | Multi-booking Order (Option 1) — money-path взрыв, по L1-сигналу позже |
| **D2** | `items_json` snapshot на брони (title/duration/price на момент) | BP-3 itemized + письма/карточки показывают состав, даже если продукт позже отредактирован | FK-таблица `booking_items` — усложнение без per-item операций в Option 0 |
| **D3** | «Включено в час» = `Product.addOn` + `durationMin: 0`; «30/60 мин» = отдельные продукты | BP-2 (комплекс как услуга) уже поддержан моделью; addOn закрывает нулевой вклад времени | `durationVariants` массив на продукте — схема ради сценария, который решают два продукта |
| **D4** | Однородный `paymentMode` корзины, иначе 422 | Один PaymentIntent на Order — денежный канон 003/012 не ломается | Split-платежи per item — отдельные PaymentIntent'ы, отдельные вебхуки, отдельные refunds: Option 1-территория |
| **D5** | cutoff контейнера = cutoff **primary** (первой не-addOn) позиции | Детерминированно и объяснимо клиенту («правило основной работы») | min/max по позициям — сюрприз для владельца |
| **D6** | Отмена/возврат контейнера целиком | FSM one-order-one-track; per-item refund = пересчёт Order вне канона | Частичная отмена — Option 1 |
| **D7** | OUT_CALL контейнера, если хоть одна позиция выездная | Безопасный дефолт (оператор видит состав до подтверждения) | Декомпозиция по позициям — усложнение approval-поверхности |
| **D8** | `MAX_ITEMS = 6`, `MAX_COMPOSITE_MIN = 480` — константы кода | Защита грида и письма от абсурдных корзин; в `ShopSettings` уводить по L1-сигналу | Конфиг-поля — YAGNI сейчас |

---

## 4. Spike Governance (Constitution XI / ISO 12207)

- **Timebox:** 0 дней — отдельный spike не требуется: `computeSlots` уже параметризован, легаси-002 даёт дизайн-контур, конкурентный паттерн верифицирован vendor-доками.
- **Quantitative Verification Metrics:** `GET /api/availability p95 < 50 ms` (без дополнительных SQL); `212+` int-тестов зелёные; composite-гонка → ровно один 201 / один 409.
- **Spike Disposal Path:** прототипного кода нет; реализация clean-room по контрактам спеки в ветке/на main по конституции.

## 5. Sources

- [YCLIENTS — Работа с журналом записи (официальная документация)](https://partners.yclients.com/self-employed/calendar)
- [YCLIENTS — вебинар «Индивидуальные услуги и комплексы» (VK Video)](https://m.vkvideo.ru/playlist/-24281380_8)
- [Setmore — How to let customers book multiple services in one appointment](https://support.setmore.com/en/articles/490980-how-to-let-customers-book-multiple-services-in-one-appointment)
- [Setmore — Service & Class Settings](https://support.setmore.com/en/collections/11662311-service-class-settings)
- [Fresha — управление записями и услугами](https://www.fresha.com)
- L1: `undreseller-legacy/specs/002-service-cart-and-staff-bot/spec.md`

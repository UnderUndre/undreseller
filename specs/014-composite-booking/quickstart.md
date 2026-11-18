# Tracer Bullet Quickstart: 014-composite-booking

**Purpose**: сквозной сценарий «корзина услуг в одном слоте» от грида до Telegram-карточки.

---

## 1. Fixture (Payload `/admin`, OWNER)

1. Создать продукт **«Замена смесителя»**: `bookable=true`, `durationMin=60`, `priceInUSD=100`, `paymentMode=NONE`.
2. Создать продукт **«Установка фильтра»**: `bookable=true`, `addOn=true`, `durationMin=0`, `priceInUSD=0`.
3. Создать продукт **«Починка туалета»**: `bookable=true`, `durationMin=45`, `priceInUSD=80` (для второго слота = отдельная бронь).

## 2. Offline Verification

```bash
pnpm validate && pnpm lint && pnpm test:int
```
Все существующие 212 тестов зелёные + новый `composite-booking.int.spec.ts`.

## 3. End-to-End Tracer Bullet

1. `/ru/book/zamena-smesitelya` → выбрать слот → чекбокс «Установка фильтра» (итог: 60 мин / $100) → отправить.
2. `POST /api/booking { items: ["12","15"], ... }` → `201`, ответ содержит `items` (2 позиции) + `totalDurationMin: 60`.
3. Telegram staff-карточка: primary строка + addOn строка, длительность 60 мин; confirmation email — itemized список.
4. Отдельно забронировать «Починку туалета» на другой слот — вторая независимая бронь того же клиента.
5. Отмена контейнера по ссылке из письма → refund по правилу primary cutoff.

## 4. Live GPU (013) не задействован

`pnpm eval:ai` и AI-triage контур работают без изменений (US6 — верификационные тесты).

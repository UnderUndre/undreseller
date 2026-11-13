# Спецификация: 010-i18n

**Input**: F-UX-07 (deferred из 008 — нужна i18n-система), 68 лидов пайплайна (RU: ARM/GE, EN: CY/UAE), бизнес-план v20.3 (Multi-Staff ICP, международный контур)
**Scope**: next-intl + URL-prefix locale routing для booking flow. Payload admin остаётся EN (можно включить admin i18n отдельно).

## Решения

| Вопрос | Решение | Обоснование |
|---|---|---|
| Библиотека | `next-intl` | Стандарт Next.js 15/16 App Router, Server Components support, middleware канон |
| URL-структура | `/[locale]/...` prefix | SEO для клиентских booking-страниц (клиент видит `/ru/book/` или `/en/book/`) |
| Локали | `ru` (default) + `en` | 68 лидов: ARM/GE = RU, CY/UAE = EN |
| Scope | Booking flow только (P0) | Checkout/account/admin — отдельная фаза |
| Admin panel | Не трогаем (EN) | Payload built-in i18n — отдельная задача |

## Архитектура

```
middleware.ts            → locale detect (cookie > Accept-Language > default ru) → redirect
src/i18n/locales/ru.json → все RU строки booking flow
src/i18n/locales/en.json → все EN строки booking flow
src/i18n/request.ts      → next-intl request config
src/app/[locale]/(app)/  → все booking страницы под locale-префиксом
src/app/(payload)/       → остаётся на root (admin без i18n)
src/app/api/             → остаётся на root (API без i18n)
```

## Переводимые поверхности (P0)

1. SlotGrid: Date, Name, Phone, Email, Confirm booking, Booking…, conflict message
2. BookingFormOTP: все RU тексты (уже RU, добавить EN)
3. WaitlistJoinForm: все RU тексты (уже RU, добавить EN)
4. Booking confirmation: Booking confirmed, Appointment, Cancel this appointment
5. LocalTime: locale-aware date formatting
6. Error catalog: INTENT_CAP, INTENT_DEAD, OTP_INVALID, SLOT_TAKEN, SLOT_NOT_AVAILABLE

## Out of scope
- Checkout/account/orders (P1)
- Telegram bot messages (P2)
- Payload admin translations (built-in, отдельная задача)
- Multi-tenant mode (отдельный дизайн-документ)

## Clarifications

### Session 2026-11-13
- Q: Каскад определения локали → A: Cookie `NEXT_LOCALE` > заголовок `Accept-Language` > дефолт `ru`. Префикс URL обязателен (`localePrefix: 'always'`).
- Q: Границы локализации маршрутов → A: Изоляция на клиенте; админка `/(payload)` и `/api/` не локализуются и не имеют префикса `[locale]`.
- Q: Форматирование дат и времени на клиенте → A: Компонент `LocalTime` принимает проп `locale` из роута и форматирует через нативный `Intl.DateTimeFormat`.
- Q: Область действия P0 → A: Только booking flow; переводы checkout/account/orders, сообщений Telegram-ботов и email-шаблонов отложены в P1/P2.


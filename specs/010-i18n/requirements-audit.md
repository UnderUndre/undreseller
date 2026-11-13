# Requirements Audit Report: 010-i18n

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #1)
- **Audit Date**: 2026-11-13
- **Audited**: `specs/010-i18n/spec.md` (Scope, Решения, Архитектура, Переводимые поверхности)
- **Grounding (001–009 as-built)**: Инфраструктура `next-intl` App Router, дефолтная локаль `ru`, 6 ключевых поверхностей.

---

## 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- Нарушений: **0**.
- Требования к маршрутизации бинарно проверяемы:
  - Редирект на `/[locale]/...` при отсутствии префикса (HTTP 307).
  - Исключение путей `/(payload)` и `/api/` из матчера middleware.
  - Каскад детекции: cookie `NEXT_LOCALE` > `Accept-Language` > `ru`.
- Поверхности перевода квантованы: ровно 6 компонентов/экранов (SlotGrid, BookingFormOTP, WaitlistJoinForm, Booking confirmation, LocalTime, Error catalog).

## 2. Матрица конфликтов (Gate 2: Consistency)

| ID 1 | ID 2 | Суть | Вердикт |
| :--- | :--- | :--- | :--- |
| `[locale]` префикс | Админка Payload `/admin` | Риск поломки админ-панели при перехвате middleware | ✅ Изолировано: матчер middleware явно исключает `/admin` и `(payload)` |
| `[locale]` префикс | REST API `/api/...` | Риск поломки эндпоинтов бронирования и вебхуков Stripe | ✅ Изолировано: матчер middleware исключает `/api` |
| Cookie `NEXT_LOCALE` | Accept-Language браузера | Конфликт сохранённого выбора пользователя и языка системы | ✅ Разрешено: приоритет у cookie (явный выбор клиента) |
| LocalTime | Таймзоны слотов | Форматирование дат не должно сдвигать UTC-время слота | ✅ Разрешено: LocalTime форматирует локально, сохраняя ISO-момент |

## 3. Анализ полноты (Gate 3: Completeness & Boundary Conditions)

- **Отсутствующие переводы**: fallback на ключ перевода или базовый словарь (`ru.json`).
- **Неподдерживаемая локаль**: автоматический fallback на default `ru`.
- **Пустые/невалидные cookie**: fallback на `Accept-Language`.
- **Границы скоупа**: Checkout, Telegram-боты и email-шаблоны явно исключены из P0 и задокументированы в Out of scope.

## 4. Однозначность терминологии (Gate 4: Unambiguity)

- Локали стандартизированы: ISO 639-1 (`ru`, `en`).
- Терминология `localePrefix: 'always'` соответствует канону `next-intl`.

## 5. Risk-Based Testing Scoring

| Требование / Область | Impact (1–5) | Prob (1–5) | Risk Score | Обязательные техники |
| :--- | :--- | :--- | :--- | :--- |
| Middleware locale redirect & matcher | 4 | 3 | **12 Medium** | Route matrix tests (/ru, /en, /admin, /api) |
| SlotGrid & BookingFormOTP i18n keys | 3 | 3 | **9 Medium** | UI snapshot / visual inspection |
| Error catalog translations | 4 | 2 | **8 Medium** | Negative API tests с проверкой вывода текста |
| LocalTime locale-aware rendering | 3 | 2 | **6 Medium** | Unit test форматирования дат |

## Verdict

**PASS** — требования к локализации booking flow согласованы, архитектурно изолированы от админки и API, готовы к следующему шагу пайплайна.

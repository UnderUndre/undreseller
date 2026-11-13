# Requirements Audit Report: 009-ux-hygiene

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #1)
- **Audit Date**: 2026-11-13
- **Audited**: `specs/009-ux-hygiene/spec.md` (15 fixes: F-UX-07..20, F-BE-11, 13, 14)
- **Grounding (001–008 as-built)**: 197/197 интеграционных тестов зелёные, все находки верифицированы по итогам code review 008.

---

## 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- Нарушений: **0**.
- Все 15 требований сформулированы в бинарно-проверяемом виде:
  - F-UX-07: EN-тексты в SlotGrid, lang-атрибут.
  - F-UX-08: наличие `htmlFor`, классов и `autoComplete` в полях формы.
  - F-UX-09: рендер кнопки retry на ошибках сети (детерминированный DOM-элемент).
  - F-UX-10: атрибут `min={today}` и условный рендер no-slots.
  - F-UX-12: контраст `text-muted-foreground` против WCAG 4.5:1.
  - F-UX-13..15: CSS-токены, noscript fallback.
  - F-UX-16: hit-zone расширена до минимального тач-размера 44x44px (`p-2`).
  - F-UX-18..20: медиазапрос `prefers-reduced-motion`, `aria-label`, удаление шаблонных строк.
  - F-BE-11..14: замена вызовов логгера, валидация `resolveAvailability` с мягким фоллбэком, пропуск алерта при пустом `chatId`.

## 2. Матрица конфликтов (Gate 2: Consistency)

| ID 1 | ID 2 | Суть | Вердикт |
| :--- | :--- | :--- | :--- |
| F-BE-14 (сетка reschedule) | Легаси-брони без `item_id` | Старые брони могли не иметь `item_id` для проверки слотов | ✅ Решено: мягкий фоллбэк на пропуск проверки при `!grid.ok` |
| F-BE-13 (staff alert) | Отсутствие Telegram-чата | Попытка отправки алерта без настроенного chatId роняла воркер | ✅ Решено: проверка `chatTargets.length > 0` перед отправкой |
| F-UX-07 (RU/EN тексты) | i18n-система (010) | Полноценная локализация требует next-intl | ✅ Конфликт устранён: F-UX-07 в 009 решает только EN-базу в коде, локализация вынесена в 010 |
| F-UX-10 (`min={today}`) | Таймзоны клиента/сервера | Дата "сегодня" зависит от таймзоны | ✅ Согласовано с каноном `LocalTime` |

- Взаимоисключающих состояний FSM нет (Via Negativa: FSM не затрагивается).

## 3. Анализ полноты (Gate 3: Completeness & Boundary Conditions)

- **Отказы сети / API**: F-UX-09 добавляет кнопку повтора при сбое сети на страницах подтверждения опт-ина и клейма вейтлиста.
- **Граничные условия**: дата выбора слота ограничена `min={today}` (F-UX-10).
- **Пустые состояния**: F-UX-10 определяет явное сообщение об отсутствии слотов.
- **Логирование**: F-BE-11 переводит необработанные `console.error` на `payload.logger`.

## 4. Однозначность терминологии (Gate 4: Unambiguity)

- Идентификаторы находок строго привязаны к ревизии код-ревью 008 (F-UX-*, F-BE-*).
- Терминология компонентов и CSS-токенов согласована со дизайн-системой Tailwind.

## 5. Risk-Based Testing Scoring

| Находка | Описание | Impact (1–5) | Prob (1–5) | Risk Score | Обязательные техники |
| :--- | :--- | :--- | :--- | :--- | :--- |
| F-BE-14 | Reschedule grid validation | 4 | 3 | **12 Medium** | Интеграционный тест сетки + легаси фоллбэк |
| F-BE-13 | Staff alert empty chatId skip | 3 | 2 | **6 Medium** | Unit test бота с пустым таргетом |
| F-UX-09 | Network error retry button | 3 | 2 | **6 Medium** | UI State inspection |
| F-UX-16 | DeleteItemButton hit-zone 44px | 2 | 3 | **6 Medium** | DOM rect / a11y audit |
| F-UX-12 | Contrast text-muted-foreground | 2 | 2 | **4 Low** | CSS inspection / Lighthouse |

## Verdict

**PASS** — спецификация полностью верифицируема, детерминирована и готова к следующему шагу пайплайна.

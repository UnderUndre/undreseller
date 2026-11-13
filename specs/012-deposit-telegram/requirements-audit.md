# Requirements Audit Report: 012-deposit-telegram

- **Standard**: ISO/IEC/IEEE 29148:2018 (Clauses 5.2.5 & 5.2.6)
- **Status**: **PASS** (run #1)
- **Audit Date**: 2026-11-13
- **Audited**: `specs/012-deposit-telegram/spec.md` (FR-1201..1205, FR-1211..1213, NFR-1201..1204, SC-001..005)
- **Grounding (001–010 as-built)**: 202/202 интеграционных теста зелёные (`deposit-flow.int.spec.ts` 5/5 PASS), FSM PREPAID track канон 003.

---

## 1. Стоп-слова и неквантованные метрики (Gate 1: Verifiability)

- Нарушений: **0**.
- Все требования строго квантованы:
  - FR-1201: `deposit_amount > 0` и `deposit_amount <= priceInUSD`.
  - FR-1202: `PaymentIntent amount = deposit_amount * 100` (minor units, центы).
  - FR-1204: возврат ровно суммы `deposit_amount` при соблюдении cutoff.
  - NFR-1201: ≥197 существующих тестов зелёные (сохранение инвариантов).
  - NFR-1202: 0 новых внешних зависимостей (`@stripe/*` уже в package.json).
  - NFR-1203: создание PaymentIntent строго после коммита брони.
  - NFR-1204: Stripe Elements p95 < 3s (ленивая загрузка).

## 2. Матрица конфликтов (Gate 2: Consistency)

| ID 1 | ID 2 | Суть | Вердикт |
| :--- | :--- | :--- | :--- |
| FR-1202 (PaymentMode DEPOSIT) | FSM PREPAID track (003) | Риск появления несовместимых статусов | ✅ Изолировано: Taboo 1 прямо запрещает новые статусы FSM; используется существующий PREPAID трек (HELD → webhook → BOOKED) |
| FR-1202 (DEPOSIT) | FULL_PREPAYMENT mode | Коллизия логики расчёта суммы | ✅ Изолировано: Taboo 3 гарантирует неизменность FULL_PREPAYMENT, DEPOSIT добавлен параллельно |
| FR-1204 (Deposit refund) | Full price refund (003) | Опасность переплаты при возврате | ✅ Разрешено: при DEPOSIT возвращается ровно `deposit_amount`, а не полная стоимость услуги |
| FR-1211..1212 (Два бота) | Legacy `TELEGRAM_BOT_TOKEN` | Ломающая смена переменных окружения | ✅ Совместимо: поддержка новых `TELEGRAM_STAFF_*` / `TELEGRAM_CLIENT_*` с сохранением fallback на legacy токен |

## 3. Анализ полноты (Gate 3: Completeness & Boundary Conditions)

- **Граничные условия**: `deposit_amount == null` или `0` → режим `NONE` (SC-002).
- **Отказы оплаты**: показ ошибки + кнопка retry в компоненте DepositPayment (FR-1203).
- **Сбои вебхуков**: клиентский поллинг статуса бронирования до подтверждения вебхуком (FR-1203).
- **Отмена после cutoff**: автоматический отказ в возврате депозита, удержание средств в пользу заведения (канон 003).

## 4. Однозначность терминологии (Gate 4: Unambiguity)

- Терминология `PaymentMode` строго типизирована: `'DEPOSIT' | 'NONE' | 'FULL_PREPAYMENT'`.
- Сущности и роли разграничены: клиент (DepositPayment на confirmation) vs персонал (Staff bot alerts).

## 5. Risk-Based Testing Scoring

| Требование / Область | Impact (1–5) | Prob (1–5) | Risk Score | Обязательные техники |
| :--- | :--- | :--- | :--- | :--- |
| FR-1202 (createBooking DEPOSIT mode) | 5 | 3 | **15 High** | State Transition Testing (HELD → webhook → BOOKED) |
| FR-1204 (Deposit refund & cutoff logic) | 5 | 3 | **15 High** | BVA (до/после cutoff), симуляция возвратов |
| FR-1203 (Stripe DepositPayment component) | 4 | 3 | **12 Medium** | Component integration + webhook mock |
| FR-1211..1213 (Telegram tokens & staff card) | 3 | 2 | **6 Medium** | Unit test bot initialization |

Risk ≥15: Для денежного потока и возвратов обязательны сквозные интеграционные тесты — закрыты файлом `tests/int/deposit-flow.int.spec.ts` (5/5 PASS).

## Verdict

**PASS** — спецификация полностью верифицируема, детерминирована, не ломает существующий финансовый контур и готова к следующему шагу пайплайна.

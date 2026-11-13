# Implementation Plan: 012 (deposit-telegram)

> "Аванс взял — отвечай за базар. Без залога только воздух гонять." — Валера

**Branch**: `main` | **Date**: 2026-11-13 | **Spec**: rev 1.0 (clarified; requirements-audit PASS run #1)
**Input**: spec rev 1.0 + clarify.md + requirements-audit PASS + Voice of Pain #1 (no-shows) + business-plan v20.3 (Product 2 Sprint B)

## Summary

Реализация схемы частичного депозита (Phase 1, P0) и подключение Telegram-ботов персонала и клиентов (Phase 2, P1):
1. Модель данных: опциональное числовое поле `deposit_amount` (в USD) в коллекции `Products`.
2. Бэкенд бронирования: поддержка `PaymentMode = 'DEPOSIT'`, создание `PaymentIntent` в Stripe строго на сумму депозита (`deposit_amount * 100` центов) после фиксации брони в БД.
3. FSM бронирования: строгое переиспользование существующего трека `PREPAID` (HELD → webhook подтверждения оплаты → BOOKED) без введения новых статусов.
4. Возвраты: доработка `refundService` — при отмене брони с `paymentMode = DEPOSIT` до наступления cutoff возвращается ровно сумма депозита, а не полная стоимость услуги.
5. Интерфейс: новый клиентский компонент `DepositPayment` на базе Stripe Elements (`@stripe/react-stripe-js`), встраиваемый на странице `confirmation/[id]`. Показ сообщения «Внесите депозит для подтверждения брони», поллинг статуса вебхука до перехода в BOOKED.
6. Telegram Wiring: поддержка переменных окружения `TELEGRAM_STAFF_BOT_TOKEN`, `TELEGRAM_CLIENT_BOT_TOKEN` в `botManager` с сохранением обратной совместимости для `TELEGRAM_BOT_TOKEN`. Отправка карточки бронирования персоналу через `enqueueStaffCard`.
7. Интернационализация: добавление RU/EN строк для депозита в словари `ru.json` и `en.json`.

## Technical Context

- **Language/Version**: TypeScript 5.7+ / Next.js 16.4+ / Stripe API 2024-11-20+ / Payload 3.93+
- **New Dependencies**: 0 (Stripe SDK и Grammy уже в проекте)
- **Testing**: Vitest int (`tests/int/deposit-flow.int.spec.ts` 5/5 PASS, 202/202 суммарно)

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS | Безопасность денежного контура обеспечена |
| VI | PASS | Все денежные переходы проверены интеграционными тестами |
| VII | PASS | Артефакты версионируются тегами (clarify, requirements-audit, plan, tasks) |
| VII-B | PASS | Бизнес-план v20.3: защита от no-show через депозиты |
| IX | DEVIATION | Single-branch lineage на `main` |
| X | PASS | Additions-only миграция поля `deposit_amount` и enum `DEPOSIT` |
| XI | PASS | 0 спайков |
| XII | **PASS — Money path integrity** | State Transition Testing (HELD → webhook → BOOKED), строгая сумма возврата |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
src/collections/Products/index.ts                  # MOD: поле deposit_amount
src/migrations/20261113_000001_deposit_payment_mode.ts # NEW: миграция поля и enum
src/migrations/index.ts                            # MOD: регистрация миграции
src/lib/booking/bookingService.ts                  # MOD: PaymentMode 'DEPOSIT', логика суммы PaymentIntent
src/lib/booking/refundService.ts                   # MOD: возврат deposit_amount вместо full price
src/lib/payments/stripeGateway.ts                  # MOD: поддержка кастомной суммы депозита
src/components/booking/DepositPayment.tsx          # NEW: Stripe Payment Element компонент
src/app/[locale]/book/confirmation/[id]/page.tsx   # MOD: условный рендер DepositPayment
src/lib/telegram/botManager.ts                     # MOD: поддержка токенов TELEGRAM_*_BOT_TOKEN
src/i18n/locales/ru.json                           # MOD: строки депозита
src/i18n/locales/en.json                           # MOD: строки депозита
tests/int/deposit-flow.int.spec.ts                 # NEW: 5 сквозных сценариев (NONE, DEPOSIT, FULL, refund, staff)
.env.example                                       # MOD: новые переменные для ботов
```

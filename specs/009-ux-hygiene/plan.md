# Implementation Plan: 009 (ux-hygiene)

> "Сначала чини кран, потом меняй прокладки." — Валера

**Branch**: `main` | **Date**: 2026-11-13 | **Spec**: rev 1.0 (clarified; requirements-audit PASS run #1)
**Input**: spec rev 1.0 + clarify.md + requirements-audit PASS + 008 code-review backlog (F-UX-07..20, F-BE-11, 13, 14) + 197 int tests as-built

## Summary

Пакет гигиенических исправлений UX и бэкенда по итогам аудита 008:
1. Бэкенд: валидация слота через `resolveAvailability` при переносе брони (F-BE-14), пропуск отправки алерта staff-бота при отсутствии `chatId` (F-BE-13), замена `console.error` на `payload.logger` (F-BE-11).
2. Формы и ошибки: явные `<label htmlFor>` и `autoComplete` в `WaitlistJoinForm` (F-UX-08), кнопки retry при сетевых сбоях на страницах opt-in и waitlist-claim (F-UX-09), `min={today}` и обработка пустых слотов в `ReschedulePicker` (F-UX-10).
3. Доступность (a11y) и дизайн: устранение контрастных нарушений WCAG через `text-muted-foreground` (F-UX-12), замена токенов рамок на `border-border` (F-UX-13), фикс no-op hover на кнопках (F-UX-14), `<noscript>` fallback в layout (F-UX-15), расширение hit-zone кнопки удаления корзины до 44x44px (F-UX-16), медиазапрос `prefers-reduced-motion` для карусели (F-UX-18), `aria-label` для мобильного меню (F-UX-19), зачистка шаблонных артефактов "My Store" / "Designed in Michigan" (F-UX-20).

## Technical Context

- **Language/Version**: TypeScript 5.7+ / Node.js 20+ / Next.js 16.4+ / Payload 3.93+
- **New Dependencies**: 0
- **Testing**: Vitest int (197/197 PASS)

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS | Безопасность и целостность сохранены |
| VI | PASS | Все находки верифицированы по итогам code-review 008 |
| VII | PASS | Артефакты версионируются тегами (clarify, requirements-audit, plan, tasks) |
| VII-B | PASS | Бизнес-план без изменений (технический долг и UX-гигиена) |
| IX | DEVIATION | Single-branch lineage на `main` (канон репо 001–008) |
| X | PASS | Схема БД не модифицируется |
| XI | PASS | 0 спайков |
| XII | PASS | Денежный контур не затрагивается |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
src/lib/booking/bookingService.ts              # MOD: resolveAvailability в rescheduleBooking (F-BE-14)
src/lib/telegram/clientBot.ts                  # MOD: проверка chatTargets.length перед алертом (F-BE-13)
src/components/booking/WaitlistJoinForm.tsx    # MOD: label htmlFor, autocomplete (F-UX-08)
src/components/booking/ConfirmOptinClient.tsx  # MOD: retry кнопка (F-UX-09)
src/components/booking/ClaimWaitlistClient.tsx # MOD: retry кнопка (F-UX-09)
src/components/booking/ReschedulePicker.tsx    # MOD: min={today}, no-slots (F-UX-10)
src/components/ProductGridItem/index.tsx       # MOD: text-muted-foreground (F-UX-12)
src/components/AccountNav/index.tsx            # MOD: border-border (F-UX-13)
src/components/ui/button.tsx                   # MOD: outline hover fix (F-UX-14)
src/app/(app)/layout.tsx                       # MOD: noscript fallback (F-UX-15)
src/components/Cart/DeleteItemButton.tsx       # MOD: hit-zone p-2 (F-UX-16)
src/components/Header/MobileMenu.tsx           # MOD: aria-label, template cleanup (F-UX-19, F-UX-20)
src/components/Footer/index.tsx                # MOD: template cleanup (F-UX-20)
tests/int/tokens-sweep.int.spec.ts             # MOD: проверка F-BE-14
```

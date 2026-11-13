# Tasks: 009 (ux-hygiene)

**Input**: spec rev 1.0, plan.md, requirements-audit PASS run #1, 008 code-review backlog (15 findings)
**Organization**: Phase 1 бэкенд → Phase 2 формы и ошибки → Phase 3 доступность и дизайн → Phase 4 верификация.

## Phase 1: Backend fixes

- [X] T910 [BE] F-BE-14: `resolveAvailability` сетка слотов вызывается в `rescheduleBooking` перед проверкой пересечений слотов. Для старых броней без `item_id` работает мягкий фоллбэк (`!grid.ok`).
- [X] T911 [BE] F-BE-13: `staffAlert` в `clientBot` проверяет наличие целей (`chatTargets.length > 0`) перед отправкой и тихо скипает алерт, если `chatId` не настроен.
- [X] T912 [BE] F-BE-11: зачистка необработанных `console.error` в пользу `payload.logger`.

## Phase 2: Forms & error states

- [X] T920 [FE] F-UX-08: `WaitlistJoinForm` — добавлены `<label htmlFor="...">`, стили полей по аналогии со `SlotGrid`, корректные атрибуты `autoComplete`.
- [X] T921 [FE] F-UX-09: `ConfirmOptinClient` и `ClaimWaitlistClient` — добавлена кнопка "Попробовать снова" (retry) на экране сетевой ошибки.
- [X] T922 [FE] F-UX-10: `ReschedulePicker` — атрибут `min={today}` для даты и явное сообщение об отсутствии слотов при выбранной дате.

## Phase 3: Accessibility & design hygiene

- [X] T930 [FE] F-UX-12: замена `text-primary/50` на `text-muted-foreground` в `ProductGridItem`, `AccountNav`, `CheckoutPage` (контраст WCAG 4.5:1).
- [X] T931 [FE] F-UX-13: замена `border-white/5` на `border-border` в светлой теме `AccountNav`.
- [X] T932 [FE] F-UX-14: устранение `hover:bg-primary-foreground` no-op на outline кнопках в `ui/button.tsx`.
- [X] T933 [FE] F-UX-15: `<noscript>` fallback стиль в корневом `layout.tsx`.
- [X] T934 [FE] F-UX-16: расширение hit-zone `DeleteItemButton` до 44x44px через класс `p-2`.
- [X] T935 [FE] F-UX-18: медиазапрос `prefers-reduced-motion` для карусели в `Carousel Component.client`.
- [X] T936 [FE] F-UX-19: добавление `aria-label="Open menu"` для мобильного меню в `Header/MobileMenu.tsx`.
- [X] T937 [FE] F-UX-20: удаление шаблонных остатков ("My Store", "Designed in Michigan", `blue-600` цвета) в `MobileMenu`, `Footer`, `error.tsx`, `Grid/tile`.

## Phase 4: Verification & Closeout

- [X] T940 [QA] Прогон полного тест-сьюта: 197/197 интеграционных тестов зелёные (включая обновлённый `tests/int/tokens-sweep.int.spec.ts`).

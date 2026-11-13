# Спецификация: 009-ux-hygiene

**Input**: FR-BK бэклог 008 (13 UX-находок F-UX-07..20, не вошедших в P0)
**Organization**: код-фиксы одним контуром, без спек-pipeline (все находки verified в code-review, готовые решения в таблице)

## Сводная таблица фиксов

| # | Finding | Fix | Файлы |
|---|---|---|---|
| 1 | F-UX-07: EN/RU разнобой + lang="en" | RU-тексты → EN в SlotGrid; `lang="ru"` на (app) layout для RU-сегмента | SlotGrid, layout |
| 2 | F-UX-08: WaitlistJoinForm placeholder-only | Labels htmlFor + классы SlotGrid + autoComplete | WaitlistJoinForm |
| 3 | F-UX-09: Claim/optin error → нет retry | Retry кнопка на error-стейте | ClaimWaitlistClient, ConfirmOptinClient |
| 4 | F-UX-10: ReschedulePicker пустой date | min={today} + no-slots при непустой date | ReschedulePicker |
| 5 | F-UX-12: text-primary/50 контраст | → text-muted-foreground | ProductGridItem, AccountNav, CheckoutPage, ui/button |
| 6 | F-UX-13: border-white/5 light | → border-border | AccountNav |
| 7 | F-UX-14: outline hover no-op | убрать hover:bg-primary-foreground | ui/button |
| 8 | F-UX-15: html opacity без noscript | `<noscript>` стиль в layout | layout.tsx |
| 9 | F-UX-16: DeleteItemButton 17px | p-2 расширение hit-zone | DeleteItemButton, CartModal |
| 10 | F-UX-18: Carousel без reduced-motion | matchMedia гейт | Carousel Component.client |
| 11 | F-UX-19: MobileMenu без aria-label | aria-label="Open menu" | MobileMenu |
| 12 | F-UX-20: шаблонные остатки + blue-600 | SITE_NAME + primary tokens | MobileMenu, Footer, error.tsx, Grid/tile, EditItemQuantityButton |
| 13 | F-BE-11: console.error → payload.logger | 3 файла (bookingService done в 008, webhook routes done в 008) — grep остатки | grep cleanup |
| 14 | F-BE-13: staff-alert пустой chatId | staffChatTargets + skip если пусто | clientBot |
| 15 | F-BE-14: reschedule без grid-валидации | resolveAvailability перед clash-check | bookingService rescheduleBooking |

## Out of scope (отдельная работа)
- F-UX-07 lang="ru" через сегмент-лейаут — i18n-система, отдельная спека
- SEC-A-09 password policy — auth-домен
- SEC-A-10 feed token rotation — отдельно
- SEC-B-04 maxLimit — Payload API constraints

## Clarifications

### Session 2026-11-13
- Q: Объём и границы спеки → A: P0/P1 UX и security hygiene (15 находок из бэклога 008). Отложенные задачи (i18n, auth-политики, API-лимиты) вынесены в 010 и бэклог.
- Q: Валидация сетки при переносе (F-BE-14) → A: resolveAvailability проверяется перед проверкой пересечений слотов; для легаси-броней с отсутствующим item_id сохраняется мягкий фоллбэк.
- Q: Обработка пустого chatId в алертах staff-бота (F-BE-13) → A: Тихий пропуск отправки алерта вместо падения с ошибкой или забивания логов.


# Tasks: 010 (i18n)

**Input**: spec rev 1.0, plan.md, requirements-audit PASS run #1
**Organization**: Phase 1 инфраструктура next-intl → Phase 2 миграция страниц → Phase 3 перевод компонентов → Phase 4 верификация.

## Phase 1: Infrastructure

- [X] T1010 [INFRA] `src/middleware.ts` — настройка `createMiddleware` из `next-intl`: префикс `localePrefix: 'always'`, каскад (Cookie `NEXT_LOCALE` > `Accept-Language` > default `ru`), матчер исключает `/api`, `admin`, `_next`, `_vercel`.
- [X] T1011 [INFRA] `src/i18n/request.ts` — `getRequestConfig` с валидацией локали против `['ru', 'en']` и загрузкой соответствующего JSON-словаря.
- [X] T1012 [I18N] `src/i18n/locales/ru.json` и `src/i18n/locales/en.json` — создание словарей с ключами `Booking`, `Errors`, `Common`.

## Phase 2: Page structure migration

- [X] T1020 [FE] Перенос клиентских маршрутов из `src/app/(app)/` в `src/app/[locale]/(app)/`.
- [X] T1021 [FE] `src/app/[locale]/layout.tsx` — создание локализованного лейаута, оборачивание в `NextIntlClientProvider` с передачей сообщений.
- [X] T1022 [FE] Изоляция: сохранение `src/app/(payload)/` и `src/app/api/` на корне приложения без префикса локали.

## Phase 3: Component translations

- [X] T1030 [FE] `src/components/booking/SlotGrid.tsx` — подключение `useTranslations('Booking')` для заголовков, дат, кнопок и статусов конфликтов.
- [X] T1031 [FE] `src/components/booking/BookingFormOTP.tsx` — перевод полей ввода, подсказок, таймера и сообщений валидации OTP.
- [X] T1032 [FE] `src/components/booking/WaitlistJoinForm.tsx` — перевод формы подписки на лист ожидания.
- [X] T1033 [FE] `src/components/booking/LocalTime.tsx` — поддержка пропса `locale` в форматировании времени через `Intl.DateTimeFormat`.
- [X] T1034 [UTIL] `src/utilities/generatePreviewPath.ts` — обновление путей предпросмотра с учётом локали.

## Phase 4: Verification & Closeout

- [X] T1040 [QA] Проверка работы маршрутизации (`/` → `/ru`, `/en/book/...`), проверка отсутствия конфликтов с админкой `/admin` и API `/api/...`.

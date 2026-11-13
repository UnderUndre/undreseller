# Implementation Plan: 010 (i18n)

> "Каждый кран говорит на своём языке, но резьба должна сходиться." — Валера

**Branch**: `main` | **Date**: 2026-11-13 | **Spec**: rev 1.0 (clarified; requirements-audit PASS run #1)
**Input**: spec rev 1.0 + clarify.md + requirements-audit PASS + 68 leads pipeline (RU: ARM/GE, EN: CY/UAE) + business-plan v20.3

## Summary

Внедрение интернационализации на базе `next-intl` для клиентского booking flow:
1. Инфраструктура: middleware для детекции локали с каскадом (Cookie `NEXT_LOCALE` > `Accept-Language` > default `ru`), с обязательным префиксом (`localePrefix: 'always'`).
2. Изоляция админки и API: пути `/(payload)` (`/admin`) и `/api/` исключены из матчера middleware и остаются на корне без локализации.
3. Структура маршрутов: перенос клиентских страниц из `src/app/(app)/` в `src/app/[locale]/(app)/`, подключение `NextIntlClientProvider` в `src/app/[locale]/layout.tsx`.
4. Словари: `src/i18n/locales/ru.json` и `src/i18n/locales/en.json` с ключами для 6 ключевых поверхностей бронирования.
5. Компоненты: перевод `SlotGrid`, `BookingFormOTP`, `WaitlistJoinForm`, экрана подтверждения бронирования, адаптация `LocalTime` под текущую локаль.

## Technical Context

- **Language/Version**: TypeScript 5.7+ / Next.js 16.4+ App Router
- **New Dependencies**: `next-intl`
- **Testing**: Vitest int + Route verification

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS | Безопасность и целостность сохранены |
| VI | PASS | Архитектурная изоляция проверена |
| VII | PASS | Артефакты версионируются тегами (clarify, requirements-audit, plan, tasks) |
| VII-B | PASS | Бизнес-план v20.3: поддержка международного ICP (Кипр, ОАЭ, Грузия, Армения) |
| IX | DEVIATION | Single-branch lineage на `main` |
| X | PASS | Схема БД не модифицируется |
| XI | PASS | 0 спайков |
| XII | PASS | Денежный контур не затронут |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
src/middleware.ts                                  # NEW: next-intl middleware (matcher: exclude api/admin)
src/i18n/request.ts                                # NEW: next-intl getRequestConfig
src/i18n/locales/ru.json                           # NEW: русский словарь booking flow
src/i18n/locales/en.json                           # NEW: английский словарь booking flow
src/app/[locale]/layout.tsx                        # NEW: корневой layout локали с NextIntlClientProvider
src/app/[locale]/(app)/...                         # MOD: перенос всех клиентских страниц под [locale]
src/components/booking/SlotGrid.tsx                # MOD: перевод строк через t()
src/components/booking/BookingFormOTP.tsx          # MOD: перевод строк через t()
src/components/booking/WaitlistJoinForm.tsx        # MOD: перевод строк через t()
src/components/booking/LocalTime.tsx               # MOD: учёт locale в Intl.DateTimeFormat
src/utilities/generatePreviewPath.ts               # MOD: учёт префикса локали
```

# Contract: i18n & Notifications (FR-409–414, FR-417)

## Locale resolution (FR-412)

```
resolveLocale(user): override (UserPreference by Telegram identity)
                    > initData.user.language_code (bot + Mini App)
                    > session cookie (anonymous web)
                    > ShopSettings.defaultLocale
supported: ['ru', 'en'] at launch (uk added post-launch as data)
unsupported/missing → instance default, never an error
```

Per-surface dictionaries: web chrome, client-bot strings, staff-bot strings, admin UI, email templates — one message namespace per surface, ICU plural categories (`one/few/many/other`), locale-aware word-month dates (`Intl.DateTimeFormat`), currency per registry minor units. Owner content stays in authored language (FR-414). AST gate: 100% of chrome keys resolve in both locales (NFR-406); zero hardcoded user-facing literals in new code.

## Notification dispatch (FR-409)

Trigger events: `booking.created | confirmed | cancelled | rejected | rescheduled`, waitlist offer, underpaid alert. Pipeline: event → Telegram send (primary) → on failure/exception → email fallback ≤ 5 min → every attempt logged.

```
NotificationDeliveryLog { channel: TELEGRAM|EMAIL, status: ACCEPTED|FAILED, providerRef, attemptAt, latencyMs }
```

`ACCEPTED` = provider acknowledged (Telegram API 200 / email provider accepted). `delivered` is NEVER claimed — bots cannot confirm it. Staff UI: delivery history per booking. Email adapter: provider-isolated (Resend-recommended HTTP API behind an interface; swappable without core changes).

## Theme (FR-417)

Mini App reads Telegram `themeParams.colorScheme` ('light'|'dark') → toggles `html.dark` / `data-theme="undrlla-dark"`; undesign tokens do the rest (brand scales + semantic auto-switch, commit 1b7bd23). Light theme `undrlla` is a first-class target (contrast verified for semantic tokens in both themes). No OS-preference media queries (removed in 1b7bd23); no forced dark.

## Contract tests
- `language_code: 'de'` → instance default, no error screen (US3-SC2).
- Plurals: `1 услуга / 2 услуги / 5 услуг` / en `1 service / 2 services` (CLDR, no ternary).
- TG send fails (mocked 500) → email dispatched ≤ 5 min → both attempts in delivery log (US2-SC2).
- Theme flip light↔dark: all surfaces flip, semantic contrast pairs verified (US8-SC3).

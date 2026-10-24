# Contract: Content Admin UI & Uploads (FR-436–441)

## Admin surfaces (mobile-first, bottom nav 3 tabs — content-admin-research.md)

| Route | Role | Actions |
|---|---|---|
| `/admin/catalog` | OWNER, OPERATOR | quick-create sheet (≤4 required fields), edit, active toggle (one tap), arrow reorder, archive (soft) |
| `/admin/team` | OWNER, OPERATOR (profiles per ownership) | professional profiles, portfolio, publish/unpublish, working hours |
| `/admin/settings` | OWNER (foundation) / OPERATOR (operational view) | branding, contacts, defaultLocale, timeZone, currency+confirm gate; foundation section OWNER-only server-enforced |

Validation parity: UI forms validate with the SAME zod schemas as `/api/admin/items|services|profiles` (shared modules — no drift). Duration selector 15-min quantum; price in minor units; explicit Save (no auto-save on blur); unsaved state persisted to sessionStorage.

## POST /api/admin/uploads/presign (FR-441)

Request: `{ contentType: 'image/webp'|'image/jpeg', contentBytes ≤ 250_000, objectKind: 'item'|'profile' }` → `{ uploadUrl, publicUrl, expiresIn }`. Presign TTL ≤ 5 min; single-use key `uploads/{instanceId}/{objectKind}/{uuid}.webp`; OWNER/OPERATOR only; rate-limited. Server never receives file bytes. Client contract: `browser-image-compression` → WebP ≤1200px ≤200KB before presign request.

## Slug contract (FR-437)

Generated at creation (translit + collision suffix); immutable in mobile UI. If changed via API: write SlugRedirect(old→new); `/professionals/[slug]` checks redirects before 404 → 301.

## Contract tests
- PERFORMER → 403 on all content mutations (server-side, UI hiding insufficient).
- OPERATOR → 403 on foundation settings (currency/timezone/locale).
- Archived item: hidden from storefront + new bookings; historical bookings keep snapshots.
- Image >200KB or wrong type rejected client-side; presign for oversized payload → 400.
- Audit trail: every mutation writes AuditEvent with redacted reason.

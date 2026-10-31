# T060: STRIDE-верификация 006 (Phase 1–2 scope, webhooks — Phase 6)

**Verified**: 2026-10-31, commit b7f3fa1..HEAD (Phase 1–5 + Phase 7 scope)
**Test set**: 37 security-related tests green (secret-vault 7, gcal-sync 9, gcal-mapping 11, logger-redaction 4, stride-verification 6)

## S — Spoofing

- [x] OAuth `state`: one-time consume, replay → null, unknown → null (tests/unit/gcal-sync.test.ts «OAuth state one-time + TTL»); OWNER-gate на connect/callback (`authenticateStaff(req, 'OWNER')`, OPERATOR/PERFORMER → 401/403)
- [x] HMAC webhook-подпись: контракт `outbound-webhooks.md §2`, timestamp от момента попытки (F7-rev); реализация — Phase 6 (пост-Demand Gate), верификация при T040/T041
- [x] `PUBLIC_API_KEY` constant-time: Phase 6 (T042)

## T — Tampering

- [x] Токены/секреты AES-256-GCM (secretVault): tamper ciphertext/tag → throw (tests/unit/secret-vault.test.ts); формат `v1:` — 0 plaintext в БД (TC-GCAL-019 SQL-проверка при прогоне)
- [x] Защищённая поверхность `publicExtendedProperty` поиска событий — только по нашему orderId, sync не доверяет клиенту

## R — Repudiation

- [x] Audit-канон `emitAuditEvent`: `GCAL_CONNECTED`, `GCAL_DISCONNECTED`, `GCAL_PUSH` (kind/status incl. `already_deleted`), `GCAL_SYNC_FAILED`, `GCAL_NEEDS_REAUTH` (alert) — без секретов (metadataJson sanitize-канон 004)

## I — Information Disclosure

- [x] Дени-лист logger +6 ключей: `refreshToken`, `accessToken`, `webhookSecret`, `authorization`, `whsec` (+`secret`) — tests/unit/logger-redaction.test.ts green
- [x] PII-редакция в GC event description: maskName/maskPhone/maskEmail (gcalPush) — ни одного полного контакта
- [x] ExternalBusyBlock — только интервалы, без названий/гостей чужих событий (F2-фильтр собственных событий — тест «own events strictly ignored»)
- [x] GET /api/admin/integrations/gcal — статусы, без encryptedPayload в ответе

## D — Denial of Service

- [x] Per-credential session-level advisory lock (F4-rev) — параллельные sync-циклы изолированы, мастер A не блокирует мастера B
- [x] Пачки ≤50 + sequential per-credential (600 req/min/user Google-квота), бэкофф 429/403 (RateLimitedError)
- [x] Push fail-open (SC-006): ReauthRequiredError → NEEDS_REAUTH, бронь живёт; reconcile-sweep self-healing
- [ ] Circuit breaker webhooks — Phase 6 (T041), верифицировать при реализации

## E — Elevation of Privilege

- [x] OAuth-роуты строго OWNER; disconnect — OWNER; статус — OPERATOR+ (read-only)
- [x] GC-side правки не мутируют БД (табу spec §1.3; busy-импорт только сторонних событий, F2)
- [x] Push-воркер не принимает авторизационных решений из данных GC

## npm audit / лицензии

- [x] `npm audit --audit-level=high` → exit 0 (0 High/Critical; 38 moderate — dev-тулчейн jest/eslint, pre-existing, вне money-path)
- [x] `node scripts/verify-licenses.mjs` → PASS (googleapis Apache-2.0 exact-pin в реестре)

## Out of scope (Phase 6, post-Demand Gate)

SSRF-гейт регистрации/вызова, socket-level DNS-Rebinding pinning, circuit breaker, rate-limit public API — верифицируются в T040–T042 после закрытия гейта (фича-флаг `NEXT_PUBLIC_FEATURE_WEBHOOKS` default off).

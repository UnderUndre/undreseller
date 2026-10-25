# Regression Suite Plan — TC-MAIN (staging)

Three waves against the same staging instance. Never start a later wave with a broken earlier one: Smoke gates Sanity, Sanity gates Full.

## Environment prerequisites (must be true before any wave)

| # | Prerequisite | Value / How to verify |
|---|---|---|
| 1 | App + Postgres 16 (docker) up | `docker ps` shows `undreseller_db`; `GET /api/health` → 200 |
| 2 | Migrations + seed applied | `npm run db:migrate && npm run db:seed`; services A/B/C/D from Global Test Data present |
| 3 | Telegram accounts | 3 test accounts: client `@qa_client_1` (tg id 555111, language ru), `@qa_client_2` (tg id 555112, language en), staff member `@qa_staff_master` (tg id 777000111) inside supergroup `STAFF_CHAT_ID=-1001234567890`; outsider `@qa_intruder` (id 999999999) also in group |
| 4 | Live bot tokens | `TELEGRAM_BOT_TOKEN` + `STAFF_BOT_TOKEN` from @BotFather in `.env`; webhooks registered via `_setup-webhooks.sh` (public URL or cloudflared tunnel) |
| 5 | `ADMIN_TOKEN` (break-glass) | `qa_admin_breakglass_0987654321`; old rotated token `qa_admin_oldtoken_rotated_1122334455` with `ADMIN_OLD_TOKEN_EXPIRES_AT` = +24 h (set for TC-MAIN-005, reset after) |
| 6 | Crypto sandbox | NOWPayments sandbox creds: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET=qa_ipn_secret_777`; IPN replay script ready (TC-MAIN-030/032) |
| 7 | R2 / object storage | Sandbox bucket + presign endpoint reachable; verify unreachability scenario separately (TC-MAIN-140b) |
| 8 | Feature flags (cut-over baseline) | All five `FEATURE_FLAG_*` = `true` (see Global Test Data). Killswitch wave flips each to `false` one at a time (TC-MAIN-043) and restores |
| 9 | Shop settings | `slotGridStepMin=30` (then 15 for TC-MAIN-012), Mon–Fri 10:00–18:00 UTC, lunch 13:00–14:00 UTC, `minNoticeMin=60`, `prepaymentTiming` default `IMMEDIATE`, `autoCancelDeadlineHours=6`, `confirmationNoticeHours=24` |
| 10 | Seed data reset | Between waves: `npm run db:seed` + truncate test orders; scripts in 002 `checklists/scripts/00-preflight.sh` reusable |
| 11 | Clock control | Staging allows `deadlineSweeper` force-run + `holdFrozenAt`/`auth_date` manipulation for [BOUNDARY] cases |
| 12 | Log capture | stdout + file logs tailable for TC-MAIN-151 (PII grep) and audit events |

## Wave 1 — Smoke (P0, ≤15 min)

Goal: the money-and-calendar spine is alive after every deploy.

| Order | TC | Case | Budget |
|---|---|---|---|
| 1 | TC-MAIN-001 | Owner web sign-in | 2 min |
| 2 | TC-MAIN-010 | Cart sums A+B | 2 min |
| 3 | TC-MAIN-011 | Grid vs lunch (11:30 offered, 12:00 hidden) | 2 min |
| 4 | TC-MAIN-040 | Double-booking 409 | 2 min |
| 5 | TC-MAIN-020 | FREE-track auto-confirm IN_CALL | 3 min |
| 6 | TC-MAIN-060 | Wrong webhook secret → 403 | 1 min |
| 7 | TC-MAIN-110 | Same order consistent on web/bots/admin | 3 min |

Exit: 7/7 green. One red → stop, file `DEF-MAIN-NNN`, do not run Sanity.

## Wave 2 — Sanity (P1, ≤45 min)

| # | TC | Case | Budget |
|---|---|---|---|
| 1 | TC-MAIN-003 | Role matrix invites + denials | 8 min |
| 2 | TC-MAIN-021 | OUT_CALL approve/reject | 5 min |
| 3 | TC-MAIN-030 | PREPAID IMMEDIATE full crypto lifecycle (sandbox) | 8 min |
| 4 | TC-MAIN-031 | AFTER_STAFF_APPROVAL 15-min invoice | 5 min |
| 5 | TC-MAIN-091 | Approve idempotency | 3 min |
| 6 | TC-MAIN-080/081 | Client confirm + decline | 5 min |
| 7 | TC-MAIN-070 | Staff card masking + copy contacts | 3 min |
| 8 | TC-MAIN-130/131 | i18n ru/en web + bots | 5 min |
| 9 | TC-MAIN-151 | PII log grep | 3 min |

Exit: ≥8/9 green; any red in 1, 3, 5 blocks Full.

## Wave 3 — Full (P2/P3, ~1 working day)

Everything else, in dependency order:
1. Security negatives: TC-MAIN-002 (lockout), 004 (rotation), 005 (token grace), 042 (integration profile), 062 (initData 401), 090 (outsider), 093 (blacklist), 150 (rate limit), 032 (tampered IPN).
2. FSM boundaries: TC-MAIN-033 (UNDERPAID), 034 (TTL vs freeze), 035 (late payment re-booked), 036 (cancel prepaid), 100/101 (refunds).
3. Slot boundaries: TC-MAIN-012 (15-min grid), 013 (minNotice), 050 (cart guards), 051 (mixed cart).
4. Bot flows: TC-MAIN-061, 063, 082 (auto-cancel), 092 (magic link), 094 (fulfill + GDPR).
5. Content/waitlist/fields: TC-MAIN-120, 121, 122, 123, 124, 125.
6. i18n plural + ops: TC-MAIN-132, 140, 140b, 152.
7. Killswitch matrix: TC-MAIN-043 (last — touches env for the whole instance; restore flags after).

## Reporting

- Log every deviation as `DEF-MAIN-NNN` in the defect template of 002 `TESTING-CHECKLIST.md` (process section still VALID per legacy audit).
- Suite result = per-wave counts + defect list; attach NFR evidence from `rtm-matrix.md` where the run doubles as evidence collection.

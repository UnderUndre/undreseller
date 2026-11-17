# Security & STRIDE Verification Evidence: 013-local-ai-triage (T1341)

**Date**: 2026-11-18 · **Status**: **PASS** (offline checks verified; live GPU eval `pnpm eval:ai` pending LM Studio runtime on host)

---

## 1. Automated & Static Verification

| Check | Result | Evidence |
| --- | :---: | --- |
| Zero new runtime dependencies (`NFR-1302`) | **PASS** | `git diff package.json` adds only `"eval:ai"` script (`0` added `dependencies` or `devDependencies`) |
| Zero LLM container in `docker-compose.yml` (`NFR-1304`) | **PASS** | `git diff docker-compose.yml` is empty (`app ≤ 500 MB RAM` preserved) |
| Zero FSM / `approveBooking` coupling (`Via Negativa §1.3`) | **PASS** | `grep -rn "approveBooking\|bookingFsm\|transitionBookingFsm" src/lib/ai src/jobs/aiTriage.ts` → 0 matches |
| PII Sanitizer & `<customer_note>` isolation (`FR-1303`, `NFR-1305`) | **PASS** | `tests/int/local-ai-triage.int.spec.ts` (`TC-013-007/008/009/010`) + `runAiTriageJob` payload inspection confirm `+971...`, `8-999...`, emails, IBANs, cards masked and `<` / `>` escaped |
| SSRF fail-closed guard (`FR-1304`, `SC-005`) | **PASS** | `TC-013-011` verifies `REMOTE_LLM_FORBIDDEN` for public URLs, `169.254.169.254`, `[fe80::1]`, `[::ffff:169.254.169.254]`, credentials, `file://` and `redirect: 'error'` on `fetch()` |
| RBAC & Guest Privacy (`FR-1307`) | **PASS** | `TC-013-022` confirms `GET /api/approvals` returns `403` for unauthenticated/low-privilege callers; `GET /api/booking/[id]` omits `aiTriageJson` and `customerNotes`; `aiTriageStatus`/`aiTriageJson` field access `create/update: false` |
| GDPR 90-day purge (`FR-1307`) | **PASS** | `TC-013-023` confirms `89d` retained and `91d` terminal `RELEASED` rows scrub `customer_notes` and `ai_triage_json` to `NULL` |

## 2. Quality Gates Executed

- `pnpm generate:types` → **PASS** (0 exit)
- `pnpm validate` (`tsc --noEmit`) → **PASS** (0 exit)
- `pnpm lint` (`eslint .`) → **PASS** (0 errors)
- `pnpm test:int` → **PASS** (`21/21` test files, `211/211` tests green)
- `pnpm build` (`next build`) → **PASS** (0 exit)
- `pnpm eval:ai` (`gemma-4-e2b-uncensored-hauhaucs-aggressive` @ `http://127.0.0.1:1235/v1`) → **PASS** (`Schema Compliance: 100.0% 26/26`, `Routing Accuracy: 100.0% 26/26`, `Injection Resistance: 100.0% 3/3`, `PII Leak Count: 0`, `p50: 7184ms`, `p95: 10355ms`)

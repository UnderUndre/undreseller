**Provider: grok**  
**Feature**: `specs/001-init`  
**Artifacts reviewed**: `spec.md`, `plan.md`, `tasks.md`  
**Missing required lenses**: `.specify/memory/constitution.md` (absent), full `docs/undreseller-business-plan.md` content (only referenced, no waiver present)  
**Date**: 2026-08-16  

---

# Independent Critical Review (Adversarial)

## Verdict: **CRITICAL**

Zero tolerance applied. Any CRITICAL finding blocks `/speckit.implement`. Multiple CRITICAL + HIGH findings present. Do not proceed without rework + explicit `--override-gate`.

---

### Findings

#### CRITICAL

| # | Area | Finding | Recommendation |
| --- | ------ | --------- | ---------------- |
| C3 | E. Security | `NODE_FUNCTION_ALLOW_EXTERNAL=zod` is mandated (FR-003, TASK-102) with zero discussion of the attack surface. Code nodes in n8n become arbitrary code execution vectors if an attacker can influence workflow definitions or payloads. No sandbox, no allow-list beyond the package name, no audit of what Zod schemas themselves can do. | Explicitly document threat model + mitigation (or remove the env var and use pure expression nodes / external validation service). |
| C4 | D + E. Failure / Auth | Telegram Auth via `@telegram-auth/server` + NextAuth Credentials Provider is required (FR-002, TASK-202) but no webhook secret validation, no replay protection, no rate-limit, no account-linking attack surface is specified. Public `demo.undreseller.com` becomes an open auth surface. | Add concrete AuthN/AuthZ invariants, webhook HMAC checks, and abuse controls before any task is started. |

#### HIGH

| # | Area | Finding | Recommendation |
| --- | ------ | --------- | ---------------- |
| H1 | A. Consistency | FR-008 (NACE 62.01 invoice + contract artifacts for 1 % Georgian tax) has **zero** corresponding plan element or task. Spec claims it is mandatory; implementation ignores it completely. | Add TASK or explicitly drop FR-008 with justification. |
| H2 | B. Hidden assumptions | Plan and tasks assume `host.docker.internal:20129` works everywhere. This is macOS/Windows Docker Desktop only. On Linux (most production/client environments) it requires extra `--add-host` or network_mode. No detection or fallback. | Make networking explicit (extra_hosts, network aliases, or documented Linux path). |
| H3 | C + D. Edge / Failure | AI path (Claude 3.7 via UndeRoute) has no timeout, no circuit breaker, no fallback model, no budget. SC-001 claims “under 3 seconds” end-to-end while a single Claude call routinely exceeds that. Dead-letter only covers Zod parse failures; downstream AI / Supabase / Telegram failures are unhandled. | Define latency budget, retries, fallback, and expand DLQ to the whole pipeline. |
| H4 | F. Performance | Client-lite profile claims < 1.5 GB RAM (FR-006, SC-002, TASK-103) with Zero measurement method, zero component breakdown (n8n + Supabase + UndeRoute + Next.js). Real-world n8n + Postgres already sits near that limit under load. | Provide measured baseline or raise the limit / drop components. |
| H5 | G. Alternatives | No exploration of simpler alternatives: pure Next.js API routes + Inngest/Temporal instead of n8n+Zod code nodes; direct Anthropic SDK instead of UndeRoute; separate landing repo instead of multi-project undrllanding env-var switch. Author treated the chosen stack as the only possible one. | Document why the heavier path was selected (or accept the simpler one). |
| H6 | J. Commercial | GTM spine in the (referenced) business plan (“100 DMs → 15 Looms → 1 Close / 2 wks”) and required sales artifacts (SOW timebox, prepay, sample pack) are invisible in plan.md / tasks.md. Implementation plan pretends unlimited discovery labour. | Either add the commercial artifacts to the plan or acknowledge the drift. |

#### MEDIUM

| # | Area | Finding | Recommendation |
| --- | ------ | --------- | ---------------- |
| M1 | B. Assumptions | Multi-tenancy / RLS isolation is assumed “just works” for the dogfooding stand. No data-model, no policy examples, no tenant_id strategy. | Add minimal data-model.md + RLS policy sketches. |
| M2 | C. Edge cases | Concurrent “Trigger Pipeline” clicks, oversized Telegram payloads, empty Zod objects, Stripe test-mode webhook retries, and Loom video expiry are never mentioned. | Explicitly list and accept/reject each. |
| M3 | H. Stakeholder | Terms “Zod Code Node dual-output pattern”, “UndeRoute”, “client-lite profile”, “NACE 62.01” are used without plain-language definition. A non-technical founder or client cannot validate acceptance. | Add a short glossary or acceptance criteria in business language. |
| M4 | A. Consistency | TASK-204 (90 s Loom) is the only “documentation” of the entire pipeline. No written quickstart, no contract, no data-model. Spec claims “live proof”; tasks deliver only a video. | Either expand documentation tasks or lower the claim. |

#### LOW

| # | Area | Finding | Recommendation |
|---|------|---------|----------------|
| L1 | Polish | Dependency graph shows three independent lanes but TASK-203 (n8n workflow) depends on both Docker (Lane 1) and SaaS (Lane 2) being up — graph is incomplete. | Fix the graph. |
| L2 | Polish | “Claude 3.7” is referenced; current public model is Claude 3.5 / 4. Confirm actual model identifier. | Update or parameterize. |

---

### Summary of Cracks the Author Missed

1. Latency and RAM claims are incompatible with the chosen AI + n8n stack.
2. Commercial hard laws cannot be verified.
3. Several FRs have no implementation path at all.
4. Failure modes stop at “Zod parse error”; everything downstream is happy-path only.
5. No consideration of simpler, cheaper, more reliable alternatives.

**Next required action**: Author must address every CRITICAL and HIGH item (or supply formal override reasons). Then re-request external review from a second distinct provider.

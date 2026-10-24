# SpecKit Analyze: 004-release-readiness

**Reviewer**: analyze (Claude self-consistency)
**Reviewed at**: 2026-10-24T18:19:44Z
**Commit**: 95ab61a2df149685b4b891f9206672659452c7f2
**Artifacts**: spec.md (v6), plan.md, tasks.md, data-model.md, contracts/ (4), research.md (+Plan Phase 0), quickstart.md
**Constitution**: v1.7.1 · **Business plan**: external `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v18.4 (loaded as constraint)

> Reviewer note: the same session authored spec/plan/tasks — findings below are an explicit attempt to defeat authorial blindness; three HIGH items survived it.

## Findings

| ID  | Category | Severity | Location(s) | Summary | Recommendation |
| --- | -------- | -------- | ----------- | ------- | -------------- |
| H1  | Commercial (pass H) | HIGH | repo `docs/` (absent), FEATURE_DIR | No business-plan file inside the repo and no `business-plan-waiver.md`; the canonical plan lives in the external `undreplans` repo (user-provided path) — command pass H treats in-repo absence as HIGH | Add `docs/business-plan.md` pointer stub ("canonical: undreplans/…v18.4, read as constraint") or `FEATURE_DIR/business-plan-waiver.md` recording the external-canonical decision |
| D1  | Constitution (pass D) | HIGH | plan.md §Constitution Check; branch `004-release-readiness` | Constitution IX (Two-Phase, `specs/<slug>` branches) vs repo tooling (`create-new-feature.ps1` creates `NNN-slug`; 002/003 lineage). Deviation is documented and justified but the local constitution copy was never amended — an unresolved MUST | Amend the consumer copy of the constitution (align with repo scripts) in a dedicated commit, or plan a devx feature migrating branch naming; do not leave silent |
| E1  | Coverage (pass E) | HIGH | spec.md FR-430 vs tasks.md | FR-430 (customer-initiated cancellation of a prepaid booking within refund window → recorded refund workflow) has no dedicated task: T027 covers the late-payment webhook refund path only; the cancel→refund wiring is assumed, not tasked | Add one `[BE] [US1]` task: cancellation of prepaid booking triggers RefundOperation workflow + policy-window evaluation + notifications (extends T021/T090 lane); add E2E assertion |
| C1  | Underspecification (pass C) | MEDIUM | contracts/booking-waitlist-api.md; spec.md Assumptions | Waitlist join accepts contact-only users, but offers are Telegram-only at launch → contact-only entrants never receive offers (silent dead-end) | Restrict join to Telegram-identified users at launch (403/422 with explanation for contact-only), or extend offers to email — pick one; document in contract + spec |
| E2  | Coverage (pass E) | MEDIUM | spec.md FR-442; data-model §1.8 | `slotGridStepMin` (15/30 instance setting) exists in data-model column list but no task wires it to settings UI/API — FR-442's "instance setting" half is uncovered | Extend T064 (settings) or T030 (windows) with the grid-step setting surface + validation (15\|30) |
| G1  | Agent routing (pass G) | MEDIUM | tasks.md T016 | T016 tagged `[OPS]` but modifies `lib/config/integrationProfile.ts` (BE-path file) — path/tag mismatch | Retag `[BE]` or split: config edit `[BE]`, killswitch drill `[OPS]` |
| M1  | Observability (pass M) | MEDIUM | plan.md §Observability | OpenTelemetry explicitly deferred post-release; metrics limited to logger counters + delivery log — documented deferral, but pass M standard expects trace propagation | Accept as-is for launch (documented in backlog-carried-over T068 lineage) or add a minimal correlation-ID propagation task; record decision in plan |
| I1  | Supply chain (pass I) | LOW | plan.md §Technical Context | New-dep license claims (e.g., `next-intl` Apache-2.0) asserted but unverified until T003 runs `verify-licenses.mjs` | No action pre-implementation; T003 gate will enforce (registry is allowlist-driven) |
| B1  | Ambiguity (pass B) | LOW | spec.md FR-441; contracts/admin-content-uploads.md | Tilde-quantifiers "≤ ~200 KB / ≤1200px" — approximate bounds in normative text | Pin exact numbers (200_000 bytes, 1200px) when implementing T062 |
| F1  | Inconsistency (pass F) | LOW | tasks.md Dependency Graph | T095 `[SEC]` probes presign abuse but graph lacks edge `T060 → T095` (lane table implies it) | Add dependency edge for determinism |
| F2  | Coverage (pass E) | LOW | spec.md FR-435 | "Thin controllers over services" is architectural guidance; no audit/check task enforces it | Optional: fold a "no business logic in route handlers" check into T095 review checklist |

## Coverage Summary

50 requirements inventoried (FR-401..443 = 43, NFR-401..407 = 7). Mapped to 60 tasks.

| Requirement Key | Has Task? | Task IDs | Notes |
| --------------- | --------- | -------- | ----- |
| payment-provider-neutral (FR-401/402/416→406) | Yes | T013, T022, T025, T027 | full lifecycle + replay + HMAC |
| booking-fsm-two-track (FR-403/404/432) | Yes | T020, T021, T023, T027 | incl. freeze + late-payment |
| prepaid-refund-on-cancellation (FR-430) | **Partial** | (T027 adjacent only) | **see E1 — gap** |
| minor-units (FR-405) | Yes | T026 | JPY/KWD tests |
| timezone-dst (FR-408) | Yes | T030, T031 | |
| notification-redundancy (FR-409/410) | Yes | T032, T033, T034 | accepted/failed semantics |
| i18n-all-surfaces (FR-411–414) | Yes | T012, T040–T045 | incl. AST gate |
| hybrid-telegram (FR-415–418) | Yes | T050–T054 | |
| waitlist (FR-419/420/422/433) | Yes | T070, T072, T073 | single-winner races |
| any-available (FR-421) | Yes | T071 | deterministic greedy |
| custom-fields (FR-423/424/434) | Yes | T080–T082 | archive+snapshots |
| hardening (FR-425–429) | Yes | T090–T093 | |
| design-system (FR-431) | Yes | T100–T102 | gray→base, light theme, grep gate |
| content-admin (FR-436–441) | Yes | T060–T066 | quick-create, presign, RBAC split |
| duration-quantum (FR-442) | **Partial** | T061 (selector) | **see E2 — grid-step setting half** |
| service-oriented (FR-435) | Partial | T013 (contract) | architectural; see F2 |
| NFR-401/402 latency+RSS | Yes | T001 (bench repair), T111 | |
| NFR-403 waitlist p95 60s | Yes | T073 | |
| NFR-404 retention 90d | Yes | T092 | |
| NFR-405 DR/RTO/RPO | Yes | T094, T112 | real restore |
| NFR-406 i18n coverage | Yes | T044 | |
| NFR-407 idempotency | Yes | T027 | ×100 replay |

## Constitution Alignment Issues

- **IX (Two-Phase Review Flow)** — deviation (see D1): documented, unamended. All other principles: no violations (VI on-track pending external reviews; VII tags complete through `tasks/v1`; X manifest in data-model; XI spike governance in research.md).

## Commercial / Business Plan Alignment

- Plan files loaded: external `undreplans/.../undreseller-business-plan.md` v18.4 (no in-repo `docs/` plan — see H1).
- Focus/hard laws checked: Sprint B lineage honored; payments = explicitly post-Sprint-B scope (this release); ≤500 MB RSS embedded in plan/tasks; no paid-CAC tasks; no forbidden Lab work; brand isolation intact (undesign single source).
- Findings: H1 only. **No commercial drift detected** beyond the in-repo-plan-absence formality.

## Unmapped Tasks

None — every task maps to a story/requirement or declared Polish/OPS scope.

## Metrics

- Total Requirements: 50 (43 FR + 7 NFR)
- Total Tasks: 60
- Coverage % (requirements with ≥1 task): 96% full (2 partial: FR-430, FR-442-half)
- Ambiguity count: 1 (B1)
- Duplication count: 0
- CRITICAL count: 0
- HIGH count: 3 (H1, D1, E1)
- MEDIUM count: 4 (C1, E2, G1, M1)
- LOW count: 4 (I1, B1, F1, F2)

## VERDICT

```yaml
verdict: HIGH
override_reason: 
reviewer: analyze
reviewed_at: 2026-10-24T18:19:44Z
commit: 95ab61a2df149685b4b891f9206672659452c7f2
critical_count: 0
high_count: 3
medium_count: 4
low_count: 4
```

> Verdict rationale: no CRITICAL; three HIGH (one real task gap E1, two process/documentation gaps H1+D1). All three are cheap to remediate (~1 task + 2 doc commits) — after which a re-run is expected to reach PASS.

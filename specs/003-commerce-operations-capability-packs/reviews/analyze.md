# SpecKit Analyze: 003-commerce-operations-capability-packs

**Reviewer**: analyze (Codex self-consistency)
**Reviewed at**: 2026-10-22T07:59:02Z
**Commit**: 515b7b6793435061a990d5bc74147dc261989904
**Artifacts**: spec.md, plan.md, tasks.md, data_model.md, contracts.md, quickstart.md, research.md, .specify/memory/constitution.md, ../undreplans/docs/projects/undreseller/undreseller-business-plan.md (v18.4)
**Working tree**: The reviewed feature artifacts include uncommitted changes.

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | No unresolved findings in this pass. | Continue to the required independent external reviews for the revised scope. |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| --- | --- | --- | --- |
| FR-301 | Yes | T010 | Service listings |
| FR-302 | Yes | T063 | Product catalog |
| FR-303 | Yes | T006 | Configured currency metadata and display |
| FR-304 | Yes | T009 | Booking customer details |
| FR-305 | Yes | T040, T041, T042 | Party timeline implementation and verification |
| FR-306 | Yes | T040, T042 | Action suggestions and approval checks |
| FR-307 | Yes | T018 | Appointment capacity |
| FR-308 | Yes | T063 | Inventory movement ledger |
| FR-309 | Yes | T018 | Service schedules and booking rules |
| FR-310 | Yes | T036 | Quote lifecycle |
| FR-311 | Yes | T036 | Quote-to-order conversion |
| FR-312 | Yes | T023 | Order-line snapshots |
| FR-313 | Yes | T036 | Margin guard |
| FR-314 | Yes | T044 | Change requests |
| FR-315 | Yes | T027 | Payment plans and allocations |
| FR-316 | Yes | T027 | Payment provider contract |
| FR-317 | Yes | T044 | Commercial documents and reversals |
| FR-318 | Yes | T022 | Segmented fulfillment |
| FR-319 | Yes | T022 | Fulfillment evidence |
| FR-320 | Yes | T050 | Post-sale cases |
| FR-321 | Yes | T039, T040, T041, T042 | Exception queue, persistence, API, verification |
| FR-322 | Yes | T040, T041 | Conversation-to-draft |
| FR-323 | Yes | T039, T040, T041, T042 | Continuation links and verification |
| FR-324 | Yes | T040, T041, T042 | Offline draft reconciliation |
| FR-325 | Yes | T007 | Typed capability-pack configuration contract |
| FR-325a | Yes | T008 | Three fixed roles |
| FR-325b | Yes | T008, T031 | Better Auth staff identity and sessions |
| FR-325c | Yes | T060 | Per-installation isolation verification |
| FR-326 | Yes | T030, T032, T034, T051, T060 | Role-filtered staff views, authorized booking decisions, and privacy checks |
| FR-327 | Yes | T050 | Data-quality scanner and staged import |
| FR-328 | Yes | T047 | Jurisdiction-neutral core and provider ports |
| FR-329 | Yes | T047 | Customization manifest |
| FR-330 | Yes | T047, T048 | Compliance-readiness gate |
| FR-331 | Yes | T053 | LanguageModelGateway |
| FR-332 | Yes | T054 | Optional AI Lab topology |
| FR-333 | Yes | T053 | AI data-class routing |
| FR-334 | Yes | T053, T055 | AI telemetry, benchmark, and outage drill |
| FR-335 | Yes | T001, T006, T007, T014 | Business settings, service location, and configured currency |
| FR-336 | Yes | T010, T013, T014 | Professional profiles and portfolio |
| FR-337 | Yes | T019, T020, T021 | Booking flow with protected cancellation |
| FR-338 | Yes | T010, T014, T018, T020, T021, T032, T034, T057, T060, T070 | Location modes, privacy, coverage review, availability, and snapshots |
| FR-339 | Yes | T006, T010, T014, T019, T020, T021, T057, T058, T070 | Mode prices, fixed travel fee, currency, and booking totals |
| NFR-301 | Yes | T058 | Measured page and availability latency |
| NFR-302 | Yes | T058 | Measured booking command latency |
| NFR-303 | Yes | T058 | Concurrency and memory check |
| NFR-304 | Yes | T059 | Measured restore, RTO, and RPO |
| NFR-305 | Yes | T005, T011, T012, T070 | Additive migrations, backfill, compatibility, and rollback |
| NFR-306 | Yes | T056 | AI timeout limits |
| NFR-307 | Yes | T055 | AI evaluation gate |

## Constitution Alignment Issues

No unresolved artifact conflicts with the constitution's mandatory data-migration, review, or task-routing requirements. Principle VI still requires two distinct external AI reviews with current PASS verdicts before `/speckit.implement`; those reviews are the next workflow gate, not an unresolved finding in this analysis.

## Commercial / Business Plan Alignment

- Plan files loaded: `../undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v18.4)
- Focus/hard laws checked: Booking-first template for independent professionals and small service businesses; exactly three staff roles; one primary booking process; at most one client-selected external API; product sales and commerce packs deferred; the 10-paid-Tripwire prerequisite is stated before Sprint B implementation. The added location modes, optional outcall price override, and fixed travel fee stay within the same booking process and use deployment currency settings.
- Findings: No commercial drift detected; no country- or currency-specific pricing behavior was introduced.

## Unmapped Tasks

No unmapped tasks identified. The new migration task `T070` maps to `FR-338`, `FR-339`, and `NFR-305`; existing service, booking, staff-review, security, and handoff tasks cover the corresponding behavior.

## Metrics

- Total Requirements: 49
- Total Tasks: 70
- Coverage % (requirements with ≥1 task): 100% (49/49)
- Ambiguity count: 0
- Duplication count: 0
- CRITICAL count: 0
- HIGH count: 0
- MEDIUM count: 0
- LOW count: 0

## VERDICT

```yaml
verdict: PASS
reviewer: analyze
reviewed_at: 2026-10-22T07:59:02Z
commit: 515b7b6793435061a990d5bc74147dc261989904
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

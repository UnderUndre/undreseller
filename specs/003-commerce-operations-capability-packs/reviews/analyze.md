# SpecKit Analyze: 003-commerce-operations-capability-packs

**Reviewer**: analyze (Self-consistency pass)
**Reviewed at**: 2026-10-22T12:15:00+04:00
**Commit**: 867183d061e31da5fab377012c9d9376c67de3d2
**Artifacts**: spec.md, plan.md, tasks.md, data_model.md, contracts.md, quickstart.md, research.md, checklist.md, .specify/memory/constitution.md, specs/main/{README.md,architecture.md,requirements.md}, ../undreplans/docs/projects/undreseller/undreseller-business-plan.md (v18.4)

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | No unresolved findings in this pass (all 10 review findings `F1`–`F10` resolved across `spec.md`, `plan.md`, `tasks.md`, `data_model.md`, `contracts.md`, `quickstart.md`, `checklist.md`, and `specs/main/*`). | Obtain one additional independent external AI review PASS (`reviews/<provider>.md`) alongside `reviews/gemini.md` before `/speckit.implement`. |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| --- | --- | --- | --- |
| FR-301 | Yes | T010, T015 | Service listings and authorized updates |
| FR-302 | Yes | T063, T065, T066 | Product catalog (`003.2+`) |
| FR-303 | Yes | T005, T006 | `CurrencyMetadata` schema and ISO 4217 / non-ISO scaling provider |
| FR-304 | Yes | T009 | Booking customer details on `Order` |
| FR-305 | Yes | T040, T041, T042 | Party timeline implementation and verification |
| FR-306 | Yes | T040, T042 | Action suggestions and approval checks |
| FR-307 | Yes | T018 | Timezone- and buffer-aware appointment capacity |
| FR-308 | Yes | T063, T064, T067 | Inventory movement ledger (`003.2+`) |
| FR-309 | Yes | T005, T018, T019, T070 | Service schedules, exceptions, and buffered GiST overlap rules |
| FR-310 | Yes | T035, T036, T037, T038 | Quote lifecycle |
| FR-311 | Yes | T036, T037, T038 | Quote-to-order conversion |
| FR-312 | Yes | T023, T063 | Order-line snapshots |
| FR-313 | Yes | T036, T037, T038 | Margin guard |
| FR-314 | Yes | T043, T044, T045 | Change requests |
| FR-315 | Yes | T027, T028, T029, T063 | Payment plans and allocations |
| FR-316 | Yes | T027 | Payment provider contract |
| FR-317 | Yes | T043, T044, T045 | Commercial documents and reversals |
| FR-318 | Yes | T022, T023, T025, T026, T063 | Segmented fulfillment |
| FR-319 | Yes | T022, T024, T026, T063 | Fulfillment evidence |
| FR-320 | Yes | T049, T050 | Post-sale cases |
| FR-321 | Yes | T039, T040, T041, T042 | Exception queue, persistence, API, verification |
| FR-322 | Yes | T040, T041 | Conversation-to-draft |
| FR-323 | Yes | T039, T040, T041, T042 | Continuation links and verification |
| FR-324 | Yes | T040, T041, T042 | Offline draft reconciliation |
| FR-325 | Yes | T007 | Typed capability-pack configuration contract |
| FR-325a | Yes | T008, T030, T033, T034 | Three fixed roles (`OWNER`, `OPERATOR`, `PERFORMER`) |
| FR-325b | Yes | T005, T008, T031, T033, T034 | Better Auth staff identity, sessions, `OWNER` bootstrap, `AuditEvent`, and break-glass `ADMIN_TOKEN` |
| FR-325c | Yes | T060 | Per-installation single-business isolation verification |
| FR-326 | Yes | T030, T032, T034, T051, T060 | Role-filtered staff views, authorized booking decisions, and privacy checks |
| FR-327 | Yes | T049, T050, T052 | Data-quality scanner and staged import |
| FR-328 | Yes | T046, T047, T048 | Jurisdiction-neutral core and provider ports |
| FR-329 | Yes | T047 | Customization manifest |
| FR-330 | Yes | T047, T048 | Compliance-readiness gate |
| FR-331 | Yes | T053, T056 | `LanguageModelGateway` |
| FR-332 | Yes | T054 | Optional AI Lab topology |
| FR-333 | Yes | T053, T056 | AI data-class routing |
| FR-334 | Yes | T053, T055, T056 | AI telemetry, benchmark, and outage drill |
| FR-335 | Yes | T001, T006, T007, T014, T070 | Business settings, service location, and configured currency |
| FR-336 | Yes | T005, T010, T013, T014, T015, T016, T017 | Professional profiles and portfolio |
| FR-337 | Yes | T005, T019, T020, T021, T057 | Booking flow with GET-safe / POST-consumed protected cancellation |
| FR-338 | Yes | T010, T014, T018, T019, T020, T021, T032, T034, T057, T060, T070 | Location modes, privacy, pending outcall hold/coverage review, buffered availability, and snapshots |
| FR-339 | Yes | T006, T010, T014, T019, T020, T021, T057, T058, T070 | Mode prices, fixed travel fee, currency, and booking totals |
| NFR-301 | Yes | T058 | Measured page and availability latency |
| NFR-302 | Yes | T058 | Measured booking command latency |
| NFR-303 | Yes | T058 | Concurrency and memory check (`<= 500 MB RSS`) |
| NFR-304 | Yes | T059 | Measured restore, RTO (`<= 60 min`), and RPO (`<= 24 h`) |
| NFR-305 | Yes | T005, T011, T012, T070 | Additive migrations, backfill, compatibility, and rollback |
| NFR-306 | Yes | T056 | AI timeout limits |
| NFR-307 | Yes | T055 | AI evaluation gate |

## Constitution Alignment Issues

No unresolved artifact conflicts with the constitution's mandatory data-migration, review, living-spec, or task-routing requirements. Every task in `tasks.md` has an `[AGENT]` tag, an explicit file path, and race-free `prisma/schema.prisma` sequencing (`T005 → T070 → T063 → T035 → T039 → T043 → T046 → T049`). Principle VI requires `analyze.md` PASS + 2 distinct external AI reviews PASS (`reviews/gemini.md` is PASS; 1 additional external review PASS remains before `/speckit.implement`).

## Commercial / Business Plan Alignment

- Plan files loaded: `../undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v18.4)
- Focus/hard laws checked: Booking-first template for independent professionals and small service businesses; exactly three staff roles; one primary booking process; at most one client-selected external API; product sales and commerce packs deferred; the 10-paid-Tripwire prerequisite is stated before Sprint B implementation.
- Findings: No commercial drift detected.

## Unmapped Tasks

No unmapped tasks identified (all 70 tasks `T001`–`T070` map to requirements and phases).

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
reviewed_at: 2026-10-22T12:15:00+04:00
commit: 867183d061e31da5fab377012c9d9376c67de3d2
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

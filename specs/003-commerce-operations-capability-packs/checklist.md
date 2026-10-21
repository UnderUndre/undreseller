# Specification Quality Checklist: Small-Business Commerce Operations Kernel & Capability Packs

**Purpose**: Validate specification completeness and quality before proceeding to `/speckit.plan`  
**Created**: 2026-10-21  
**Feature**: `specs/003-commerce-operations-capability-packs/spec.md`  
**Workflow**: `/speckit.full-spec` (Phase 1 Specify + Phase 2 Clarify integrated — 5/5 Questions Resolved)

---

## Content Quality

- [x] Focused on user value, commercial promise continuity, and small-business operational needs
- [x] Written clearly for both business stakeholders and system architects
- [x] All mandatory sections (`User Scenarios & Testing`, `Clarifications`, `Requirements`, `Key Entities`, `Success Criteria`) completed

## Requirement Completeness

- [x] No `[NEEDS CLARIFICATION]` markers remain (all 5 `/speckit.clarify` questions resolved and integrated into `## Clarifications` and normative sections: **Q1 Option B** Production MVP scope, **Q2 Option B** 3-role staff model `OWNER | OPERATOR | PERFORMER`, **Q3 Option B** individual session-based staff accounts + break-glass `ADMIN_TOKEN`, **Q4 Option A** single-tenant dedicated-database deployment boundary, and **Q5 Option B** Single-VPS production operational baseline)
- [x] Requirements (`FR-301`–`FR-334`, including `FR-325a` for fixed 3-role RBAC, `FR-325b` for session-based `StaffMember` auth, and `FR-325c` for single-tenant dedicated-DB boundary) explicitly tagged by delivery tier (`[MVP-CORE]`, `[PHASE-PACK]`, `[AI-LAB]`) and hard invariants (`INV-001`–`INV-013`, `INV-J01`–`INV-J08`) are testable and unambiguous (ISO/IEC/IEEE 29148:2018)
- [x] Non-functional requirements (`NFR-301`–`NFR-307`) quantified with percentiles and hard ceilings (p95 < 50ms read/capacity, p95 < 250ms write, **99.0% uptime**, **RTO $\le 60\text{ min}$**, **RPO $\le 24\text{ h}$**, **100 concurrent requests**, **app RSS $\le 500\text{ MB RAM}$** excluding optional AI Lab, 4s/3s/8s AI gateway timeouts)
- [x] Security & threat triggers checked (STRIDE threat matrix completed across single-tenant physical DB isolation, session-based staff auth, break-glass `ADMIN_TOKEN` audit, 3-role RBAC, guest links, read models, MCP, and local AI Gateway / VPN contour per NIST SP 800-218 SSDF PW.1)
- [x] Regulatory & compliance constraints identified (Jurisdiction-neutral core, `JurisdictionProfile`, narrow compliance provider ports, `AiDataClass` confidentiality gates, and explicit Client Compliance Readiness Gate)
- [x] Success criteria (`SC-001`–`SC-006`) are measurable and verifiable
- [x] All acceptance scenarios (`US1`–`US11`) are defined in `Given / When / Then` format and mapped to P1 Production MVP vs P2/P3 Subsequent Phases
- [x] Edge cases and failure modes are identified (pack disablement, stale quote acceptance, partial bundle cancellation, zero/three-decimal currencies, VPN/local-LLM disconnect)
- [x] Scope is clearly bounded with explicit Out-of-Scope declarations (excludes general ledger, payroll, MRP, WMS, marketplace, customer password accounts, public staff self-registration, custom RBAC builders, shared-DB/multi-schema SaaS multi-tenancy, multi-branch/multi-legal-entity MVP tenancy, Kubernetes/multi-node HA, no-code schema builder, and MCP mutations)
- [x] OSS reuse governance and path-level license gate defined (`MIT` / `BSD-3-Clause` / `Apache-2.0` allowlist; `AGPLv3` / `ELv2` / `MSCL` core code reuse prohibited)

## Clarify Coverage Audit (`/speckit.clarify` Taxonomy — 5/5 Locked)

| Category | Status | Resolution Notes |
| :--- | :--- | :--- |
| **Functional Scope & Delivery Phasing** | **Clear (Resolved — Q1 Option B)** | **Option B locked**: Production MVP (`003.1`) delivers `Party`, `Offering`, `CapacityPort`/`InventoryMovement`, `Order`/`OrderLine` snapshots, `PaymentPlan`/`PaymentAllocation`, `FulfillmentPlan`/`FulfillmentSegment`, `OperatorAction`, and 4-stage migration; remaining packs and `Engineering AI Lab` are subsequent independent phases. |
| **User Roles & Staff Permissions** | **Clear (Resolved — Q2 Option B)** | **Option B locked (`FR-325a`)**: Three fixed `StaffRole` values (`OWNER`, `OPERATOR`, `PERFORMER`) enforced statically across HTTP commands and Staff Bot callbacks without a custom RBAC builder. |
| **Staff Authentication & Session Model** | **Clear (Resolved — Q3 Option B)** | **Option B locked (`FR-325b`)**: Individual `StaffMember` accounts and server-side `StaffSession` records via a maintained auth library; no self-registration (`OWNER` creates/invites); individual session revocation; `actorId` recorded on every command; `ADMIN_TOKEN` retained strictly as emergency break-glass credential with dedicated audit. |
| **Tenancy & Deployment Boundary** | **Clear (Resolved — Q4 Option A)** | **Option A locked (`FR-325c`, `INV-013`)**: One client business per deployment and dedicated PostgreSQL database (`1 deployment = 1 client business = 1 PostgreSQL DB`); branches, warehouses, and additional legal entities are not modeled as independent tenants in MVP (reserved for future capability pack). |
| **Operational Baseline & Resource Limits** | **Clear (Resolved — Q5 Option B)** | **Option B locked (`NFR-303`, `NFR-304`, `SC-002`, `SC-006`)**: Single-VPS production baseline (`99.0% uptime`, `RTO <= 60 min`, `RPO <= 24 h`, `100 concurrent requests`, `app RSS <= 500 MB`); optional `Engineering AI Lab`, `LM Studio`, `OmniRoute`, monitoring backends, and VPN workstation are excluded from the 500 MB app container budget and decoupled from `commerce-core` availability. |
| **Domain & Data Model** | **Clear (Resolved)** | Unified `Offering`, `Party`, `StaffMember` (`StaffRole`), `StaffSession`, `CapacityPort`, `OrderLine` snapshots, `PaymentPlan`/`PaymentAllocation`, `FulfillmentPlan`/`FulfillmentSegment`, `ChangeRequest`, and 4-stage Expand/Contract migration defined. |
| **Interaction & UX Flow** | **Clear (Resolved)** | Exception-driven `OperatorAction` work queue as home screen (MVP), operator-approved conversation-to-draft (`Phase E`), and guest-first `ContinuationLink` journeys (`Phase E`) defined. |
| **Integration & External Dependencies** | **Clear (Resolved)** | Capability-declared `PaymentProvider` & `FulfillmentProvider`, 5 narrow compliance ports (`Phase F`), and `LanguageModelGateway` (`LM Studio` + `OmniRoute`, `Phase H`) specified. |
| **Edge Cases & Failure Handling** | **Clear (Resolved)** | Post-payment capacity/compliance failure (`INV-002`, `INV-J05`), partial bundle cancellation, and `CONFIDENTIAL` AI fail-closed behavior specified. |
| **Terminology & Consistency** | **Clear (Resolved)** | Canonical terms (`Party`, `Offering`, `StaffMember`, `StaffSession`, `StaffRole`, `Reservation`, `InventoryMovement`, `FulfillmentSegment`, `CommercialDocument`, `OperatorAction`, `JurisdictionProfile`) normalized across all sections. |

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria and delivery-tier tags (`[MVP-CORE]`, `[PHASE-PACK]`, `[AI-LAB]`)
- [x] User scenarios cover primary MVP flows (`US1`–`US5`) and subsequent phase packs (`US6`–`US11`)
- [x] Feature meets measurable outcomes defined in Success Criteria (`SC-001`–`SC-006`)
- [x] Business plan alignment verified against `undreseller-business-plan.md` v18.3 (`Business plan: unchanged — Q1–Q5 decisions preserve Sprint B $4,900 / 14-day envelope, <=500 MB RAM core ceiling, single-VPS deployment, and Track 2 freeze`)

## Verdict

- **Status**: `PASS` — All 5 `/speckit.clarify` questions resolved. Ready for `/speckit.plan` or `/speckit.full-plan`.

# Implementation Plan: [FEATURE]

> "Тяжесть — это надёжно. Даже если не выстрелит, таким всегда можно врезать по башке." — Борис Бритва (_Большой куш / Snatch_, в защиту монолита)  
> "These walls are funny. First you hate 'em, then you get used to 'em. Enough time passes, you get so you depend on them." — _Побег из Шоушенка_  
> "Scissors cuts paper, paper covers rock, rock crushes lizard... — Распределённый дедлок в микросервисах." — Шелдон Купер (_The Big Bang Theory_)

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]
**Security Surface & STRIDE Triggers**: [e.g., Auth/Network/Storage modified -> STRIDE required, OR "N/A (UI/Styling only)"]  
**Database Migration Trigger**: [e.g., Schema modified -> 4-phase Expand/Contract required, OR "N/A (No DB changes)"]  
**Supply Chain & Licensing**: [e.g., MIT/Apache-2.0, zero AGPL/GPL contamination, lockfiles verified]  
**Research Spikes & Disposal**: [List of throwaway PoCs/spikes and explicit decommission/removal criteria]

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

[Gates determined based on constitution file]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Threat Modeling & Security Boundaries (STRIDE)

> **Trigger**: Mandatory if feature adds/modifies network endpoints, auth/tokens, cryptographic logic, or stores PII/sensitive data. For visual/UI-only changes: specify `STRIDE: N/A (Client UI/Styling only)`.

| Threat Category (STRIDE)   | Target Component / Asset    | Potential Attack Vector                               | Mitigation / Architecture Countermeasure                         |
| :------------------------- | :-------------------------- | :---------------------------------------------------- | :--------------------------------------------------------------- |
| **S**poofing               | [Auth / Session / Identity] | [e.g. Token forgery, credential stuffing]             | [e.g. FIDO2 / Ed25519 signatures / DPoP RFC 9449]                |
| **T**ampering              | [Data in transit / at rest] | [e.g. Parameter tampering, MITM payload manipulation] | [e.g. TLS 1.3 pinning, HMAC/AES-GCM integrity, signed payloads]  |
| **R**epudiation            | [Audit trail / Key actions] | [e.g. Denying transaction/admin action]               | [e.g. Append-only audit logs, cryptographic receipts]            |
| **I**nformation Disclosure | [PII / Secrets / Database]  | [e.g. Memory dumps, verbose error leaks, IDOR]        | [e.g. Field-level encryption, zero PII in logs, strict RBAC]     |
| **D**enial of Service      | [Network / Compute / DB]    | [e.g. ReDoS, payload flooding, connection exhaustion] | [e.g. Rate-limiting, payload size caps, bounded timeouts]        |
| **E**levation of Privilege | [RBAC / API scopes]         | [e.g. Broken object-level auth, role escalation]      | [e.g. Least-privilege IAM, scope assertions at service boundary] |

## Database Migration Strategy (Expand/Contract)

> **Trigger**: Mandatory for any task modifying existing database schemas, tables, columns, indexes, or contracts. For pure `CREATE TABLE` of isolated new entities: Phase 1 only. For non-DB features: `N/A`.

- **Data Consistency Model**: [ACID vs BASE, transactional boundaries, distributed transaction avoidance]
- **Capacity & IOPS Bounds**: [Row volume growth, write IOPS overhead during dual-write, replication lag budget]
- **Compliance & Scope Isolation**: [e.g. PCI DSS v4.0.1 CDE isolation, PII encryption at rest, field-level tokenization]
- **Phase 1 (Expand)**: Additive schema migration (new nullable columns, new tables, backward-compatible API endpoints). Old code and new code run simultaneously.
- **Phase 2 (Dual-Write & Backfill)**: Application writes to both old and new storage locations. Idempotent asynchronous backfill script migrates legacy rows.
- **Phase 3 (Cutover)**: Application reads are switched to the new schema/fields. Verify telemetry for 0 errors.
- **Phase 4 (Contract)**: Drop deprecated columns, legacy tables, and temporary dual-write adapters (scheduled in Polish phase).
- **Rollback Path**: Step-by-step per-phase reversal procedures with verified down-migrations and lock-free indexes.

## Observability, Recovery & Rollback Plan

### Observability & Telemetry

- **Metrics & SLIs**: [Request rate, latency p95/p99, error rate thresholds, SLO error budget limits]
- **Structured Logging**: [Correlation IDs, log event schema, verified zero-PII/token redaction (PCI DSS Req 10 / ISO 27001)]
- **Distributed Tracing**: [OpenTelemetry trace propagation across services and database boundaries]
- **Health Checks & Probes**: [Liveness and readiness endpoint specifications]

### Disaster Recovery & Rollback Strategy

- **Recovery Targets**: [RTO <= X, RPO <= Y, PITR backup window]
- **DR GameDay Scenario**: [Simulated database failover, network timeout, or pod kill verification]
- **Rollback Triggers**: [Error rate > 1%, latency degradation > 2x, migration deadlock]
- **Rollback Procedure**: [Step-by-step down-migration, feature flag killswitch, deploy revert]
- **Data Recovery Bounds**: [PITR target, max tolerable data drift]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |

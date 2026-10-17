---
description: Execute the implementation planning workflow using the plan template to generate design artifacts.
handoffs:
  - label: Create Tasks
    agent: speckit.tasks
    prompt: Break the plan into tasks
    send: true
  - label: Create Checklist
    agent: speckit.checklist
    prompt: Create a checklist for the following domain...
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

ultrathink

> "Обкашляю вопросик." — Решала  
> "Тяжесть — это надёжно. Даже если не выстрелит, таким всегда можно врезать по башке." — Борис Бритва (_Snatch_, в защиту монолита)  
> "Never half-ass two things. Whole-ass one thing." — Рон Свонсон (_Parks and Recreation_)

1. **Setup**: Run `.specify/scripts/powershell/setup-plan.ps1 -Json` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, SPECS_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Load context**: Read FEATURE_SPEC and `.specify/memory/constitution.md`. Load IMPL_PLAN template (already copied).  
   **Also load** any `docs/**/*business-plan*.md` / `docs/business-plan.md`. Treat active focus laws, price floors, Phase A sole SKU, legal gates, and brand isolation as **hard commercial constraints**. If the feature plan would violate them, STOP and either:
   - narrow technical scope to fit the business plan, or
   - require `/speckit.business-plan --update` + explicit user approval before continuing.

34 3. **Execute plan workflow**: Follow the structure in IMPL_PLAN template to:
35 - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION")
36 - Architectural Topology Evaluation (Conway's Law & Inverse Conway Maneuver): Default to Modular Monolith. Distributed services ONLY permitted if justified by:
37 a) Regulatory compliance isolation (e.g. PCI DSS v4.0.1 CDE scope reduction);
38 b) Heterogeneous hardware requirements (GPU vs CPU);
39 c) Independent team boundaries.
40 - Fill Constitution Check section from constitution
41 - Evaluate gates (ERROR if violations unjustified)
42 - Phase 0: Generate research.md (resolve all NEEDS CLARIFICATION with Spike Governance)
43 - Phase 1: Generate data-model.md (Expand/Contract schema strategy), contracts/, quickstart.md (Tracer Bullet scenario)
44 - Phase 1: Update `specs/main/architecture.md` with new technologies, paths, and feature reference
45 - Re-evaluate Constitution Check post-design
46
47 4. **Stop and report**: Command ends after Phase 2 planning. Report branch, IMPL_PLAN path, and generated artifacts.

## Phases

### Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```text
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

63 3. **Consolidate findings** in `research.md` using format:
64 - Decision: [what was chosen]
65 - Rationale: [why chosen]
66 - Alternatives considered: [what else evaluated]
67 - Spike Governance (ISO/IEC/IEEE 12207 Decision Management):
68 - Timebox: [Strict duration limit]
69 - Quantitative Verification Metrics: [Latency p95/p99, throughput, memory overhead]
70 - Spike Disposal Path: [MANDATORY DELETION PROTOCOL — confirm prototype code will be completely destroyed and not leaked into production; production implementation starts from scratch in main branch]
71
72 **Output**: research.md with all NEEDS CLARIFICATION resolved and spike governance defined
73
74 ### Phase 1: Design & Contracts
75
76 **Prerequisites:** `research.md` complete
77
78 1. **Extract entities from feature spec** → `data-model.md`:
79 - Entity name, fields, relationships, and data classification (PII, Financial, Internal, Public)
80 - Validation rules from requirements
81 - State transitions and transactional boundaries (ACID vs BASE)
82 - 4-Phase Expand/Contract Schema Evolution: Explicit DDL manifests for Phase 1 (Expand/Additive), Phase 2 (Dual-Write), Phase 3 (Backfill/Read-Switch), Phase 4 (Contract/Cleanup)
83
84 2. **Define interface contracts** (if project has external interfaces) → `/contracts/`:
85 - Identify what interfaces the project exposes to users or other systems (OpenAPI, tRPC, schemas)
86 - Consumer-Driven Contract Testing expectations
87 - STRIDE Threat Model: If feature adds/modifies network endpoints, auth/tokens, cryptography, or handles sensitive data (PII, payments), document the STRIDE matrix in plan.md (or mark N/A for UI-only per NIST SP 800-218 PW.1)
88 - Database Migration Strategy: If feature modifies existing database schemas, define the 4-phase Expand/Contract strategy in plan.md
89 - Observability & Operational Readiness Review (ORR): Document structured logging (PII-free per PCI DSS / ISO 27001), OpenTelemetry telemetry metrics, SLO/SLI impact, RTO/RPO targets, and rollback down-migration procedures
90 - Tracer Bullet Quickstart: `quickstart.md` defining the minimal end-to-end integration path from interface to persistence for early validation
91 - Document the contract format appropriate for the project type
92 - Examples: public APIs for libraries, command schemas for CLI tools, endpoints for web services, grammars for parsers, UI contracts for applications
93 - Skip if project is purely internal (build scripts, one-off tools, etc.)

3. **Architecture update** (`specs/main/architecture.md`):
   - Read the current `specs/main/architecture.md`
   - If the feature introduces **new technologies** (language, framework, DB, external service) not already listed → add them to the relevant section (§5 CLI Package Layout, or a new subsection if the tech doesn't fit existing sections)
   - If the feature adds **new directories or modules** to the project layout → update the path tables in §2/§4/§5/§6 to reflect the new structure
   - Add a **feature reference row** to §6 SpecKit Integration's `specs/<feature-slug>/` pattern (or update the existing description if the slug already appears)
   - Preserve all existing content — only append or update, never remove sections
   - Use the same markdown table style and heading hierarchy as the rest of the file

**Output**: data-model.md, /contracts/*, quickstart.md, updated architecture.md

## Key rules

- Use absolute paths
- ERROR on gate failures or unresolved clarifications

## Snapshot Stage (Principle VII)

After all plan artifacts (`plan.md`, `data-model.md`, `contracts/`, `research.md`, `quickstart.md`) are written and committed (or staged), tag the pipeline stage:

```bash
.specify/scripts/bash/snapshot-stage.sh plan <slug>
```

```powershell
.specify\scripts\powershell\snapshot-stage.ps1 -Stage plan -Slug <slug>
```

Where `<slug>` = the feature directory slug (e.g., `001-orchestrator`). Tag (e.g., `plan/001-orchestrator/v1`) MUST be reported back to the user. Idempotent. Skips with warning if not in a git repo.

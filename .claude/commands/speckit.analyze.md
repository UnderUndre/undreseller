---
description: Cross-artifact consistency and quality analysis across spec.md, plan.md, and tasks.md. Writes verdict to specs/<slug>/reviews/analyze.md. First gate before /speckit.implement (per constitution Principle VI). Pass --override <reason> to mark verdict as OVERRIDDEN.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

**Argument parsing**: If `$ARGUMENTS` contains `--override <reason>` (or `--override="<reason>"`), this run is an explicit gate-pass override. Skip detection passes, write verdict `OVERRIDDEN: <reason>` to the review file, and exit.

## Goal

ultrathink

> "В системе нет багов, есть только аномалии." — _S.T.A.L.K.E.R._  
> "It must be humbling to suck on so many levels." («Должно быть, унизительно лажать на стольких уровнях сразу.») — Шелдон Купер (_The Big Bang Theory_)  
> "Ай, мля, я маслину поймал!" — _S.T.A.L.K.E.R._ (Bandits)

Identify inconsistencies, duplications, ambiguities, and underspecified items across the three core artifacts (`spec.md`, `plan.md`, `tasks.md`) before implementation. This command MUST run only after `/speckit.tasks` has successfully produced a complete `tasks.md`.

This is the **first of multiple gates** before `/speckit.implement` per constitution Principle VI. The other gates are external-AI reviews via `/speckit.review` from at least 2 distinct providers (Codex, Antigravity, Gemini, Copilot). The implement command verifies all gate verdicts before proceeding.

## Operating Constraints

**READ-ONLY against feature artifacts**: Do **not** modify `spec.md`, `plan.md`, `tasks.md`, `data-model.md`, `contracts/`, `quickstart.md`. The only file this command writes is `specs/<slug>/reviews/analyze.md` (the report itself, with VERDICT block).

Offer an optional remediation plan (user must explicitly approve before any follow-up editing commands would be invoked manually).

**Constitution Authority**: The project constitution (`.specify/memory/constitution.md`) is **non-negotiable** within this analysis scope. Constitution conflicts are automatically CRITICAL and require adjustment of the spec, plan, or tasks—not dilution, reinterpretation, or silent ignoring of the principle. If a principle itself needs to change, that must occur in a separate, explicit constitution update outside `/speckit.analyze`.

## Execution Steps

### 1. Initialize Analysis Context

Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` once from repo root and parse JSON for FEATURE_DIR and AVAILABLE_DOCS. Derive absolute paths:

- SPEC = FEATURE_DIR/spec.md
- PLAN = FEATURE_DIR/plan.md
- TASKS = FEATURE_DIR/tasks.md

Abort with an error message if any required file is missing (instruct the user to run missing prerequisite command).
For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

### 2. Load Artifacts (Progressive Disclosure)

Load only the minimal necessary context from each artifact:

**From spec.md:**

- Overview/Context
- Functional Requirements
- Non-Functional Requirements
- User Stories
- Edge Cases (if present)

**From plan.md:**

- Architecture/stack choices
- Data Model references
- Phases
- Technical constraints

**From tasks.md:**

- Task IDs and descriptions
- Agent tags:
  - Core: `[SETUP]`, `[DB]`, `[BE]`, `[FE]`, `[OPS]`, `[E2E]`, `[SEC]`, `[PERF]`, `[DOC]`, `[DEBUG]`, `[REFACTOR]`
  - Conditional: `[SEO]`, `[MOBILE]`, `[UIUX]`, `[PENTEST]`, `[GAME]`
- Story labels (`[US1]`, `[US2]`, etc.)
- Phase grouping and sync barriers
- Referenced file paths
- Dependency Graph section (→ and + relationships)
- Parallel Lanes table
- Agent Summary table

**From constitution:**

- Load `.specify/memory/constitution.md` for principle validation

**From business plan (Principle VII-B — commercial features):**

- Load any `docs/**/*business-plan*.md` and `docs/business-plan.md` if present
- Extract: Phase A hero SKU(s), price floors, focus/hard laws, frozen brands/modules, CAC/cold-spend gates, brand isolation rules, GTM spine constraints
- If **no** plan files and feature is user-facing/monetized (not pure chore): flag under pass **H** (see below) — severity HIGH unless `FEATURE_DIR/business-plan-waiver.md` exists

### 3. Build Semantic Models

Create internal representations (do not include raw artifacts in output):

- **Requirements inventory**: Each functional + non-functional requirement with a stable key (derive slug based on imperative phrase; e.g., "User can upload file" → `user-can-upload-file`)
- **User story/action inventory**: Discrete user actions with acceptance criteria
- **Task coverage mapping**: Map each task to one or more requirements or stories (inference by keyword / explicit reference patterns like IDs or key phrases)
- **Constitution rule set**: Extract principle names and MUST/SHOULD normative statements

### 4. Detection Passes (Token-Efficient Analysis)

Focus on high-signal findings. Limit to 50 findings total; aggregate remainder in overflow summary.

#### A. Duplication Detection

- Identify near-duplicate requirements
- Mark lower-quality phrasing for consolidation

#### B. Ambiguity Detection

- Flag vague adjectives (fast, scalable, secure, intuitive, robust) lacking measurable criteria
- Flag unresolved placeholders (TODO, TKTK, ???, `<placeholder>`, etc.)

#### C. Underspecification

- Requirements with verbs but missing object or measurable outcome
- User stories missing acceptance criteria alignment
- Tasks referencing files or components not defined in spec/plan

#### D. Constitution Alignment

- Any requirement or plan element conflicting with a MUST principle
- Missing mandated sections or quality gates from constitution

#### E. Coverage Gaps

- Requirements with zero associated tasks
- Tasks with no mapped requirement/story
- Non-functional requirements not reflected in tasks (e.g., performance, security)

#### F. Inconsistency

- Terminology drift (same concept named differently across files)
- Data entities referenced in plan but absent in spec (or vice versa)
- Task ordering contradictions (e.g., integration tasks before foundational setup tasks without dependency note)
- Conflicting requirements (e.g., one requires Next.js while other specifies Vue)

#### G. Agent Routing Validation

- Every task MUST have an `[AGENT]` tag — flag missing tags as HIGH
- Agent tag must be consistent with file path: DB files → `[DB]`, API files → `[BE]`, component files → `[FE]`, etc. — flag mismatches as MEDIUM
- Dependency Graph section MUST exist — flag missing as CRITICAL
- Dependency syntax validation: only `→` (unlock) and `+` (join) operators allowed, no chained arrows on single line
- Every task ID in Dependencies must exist in the task list — flag orphans as HIGH
- No circular dependencies (A→B→A or longer cycles) — flag as CRITICAL
- Parallel Lanes table MUST exist — flag missing as HIGH
- Agent Summary table MUST exist — flag missing as MEDIUM
- Lane assignments must match agent tags in tasks — flag mismatches as MEDIUM
- `[SEC]` and `[E2E]` tasks must depend on implementation tasks (not vice versa) — flag inverted dependencies as HIGH
- Shared file conflicts: if 2+ tasks from different agents reference the same file path without a common `[SETUP]` dependency — flag as CRITICAL (race condition risk)

#### H. Commercial drift vs business plan (GTM / money path)

Read-only check against loaded business plan(s). **Skip** only if `business-plan-waiver.md` exists for this feature **or** feature is explicitly chore-only (no user-facing/monetization).

Flag when `spec.md` / `plan.md` / `tasks.md`:

| Drift                                                                                                                 | Typical severity |
| :-------------------------------------------------------------------------------------------------------------------- | :--------------- |
| Implements or tasks a **SKU / price / offer** that contradicts plan floors or killed SKUs                             | **CRITICAL**     |
| Builds work **forbidden by focus/hard law** (e.g. secondary brand eng while frozen; Lab while gated; dual-front)      | **CRITICAL**     |
| Opens **paid cold CAC / ads** tasks while plan says $0 cold until gate                                                | **HIGH**         |
| Ignores **brand isolation** (crypto/polity copy in sterile B2B surface, or reverse)                                   | **HIGH**         |
| Adds monetization surface with **no** plan update path and plan file missing                                          | **HIGH**         |
| GTM/sales artifacts required by plan (sample pack, SOW knives) never appear in tasks though feature is the hero offer | **MEDIUM**       |
| Terminology: plan hero name vs spec product name drift without alias                                                  | **MEDIUM**       |

Do **not** re-litigate full unit-econ tables here — that is `/speckit.business-plan` Stress Pass + optional external biz review. Here only **consistency / drift**.

#### I. Supply Chain & Dependency Licensing Validation

- Scan `plan.md` and `research.md` for newly introduced external libraries and dependencies
- Flag viral copyleft licenses (AGPL-3.0, GPL without open-source intent) as **CRITICAL**
- Flag missing lockfile validation or unpinned floating dependency ranges as **HIGH**
- Flag dependencies with known critical CVEs or deprecated status as **HIGH**

#### J. Zero-Downtime Data Architecture & Expand/Contract Validation

- Verify that features modifying database schemas explicitly define 4-phase Expand/Contract migrations:
  1. Expand (additive, nullable, backward compatible)
  2. Dual-Write (service writes old + new)
  3. Backfill & Read-Switch (background migration)
  4. Contract (cleanup, drop old schema elements)
- Flag any non-backward-compatible DDL (dropping columns/tables, column renames in 1 step, adding NOT NULL without default) as **CRITICAL**
- Flag missing down-migration rollback plan as **HIGH**

#### K. Spike Governance & Prototype Deprecation Validation (ISO/IEC/IEEE 12207)

- Check if research spikes are documented in `research.md`
- Verify that every spike has:
  1. Explicit numerical verification metrics (latency p95/p99, throughput, memory)
  2. Mandatory Spike Disposal Path (throwaway protocol ensuring experimental prototype code is discarded)
- Flag any plan or task that attempts to merge or keep raw exploratory spike code in production as **HIGH**

#### L. Regulatory Compliance & Trust Boundary Isolation (ISO 12207 Phase 0 / PCI DSS v4.0.1 / GDPR)

- Verify that features handling PII, tokens, or financial data isolate trust boundaries (e.g. CDE scope reduction)
- Verify that logging does not record unmasked PII or secrets (PCI DSS Req 10 / ISO 27001)
- Flag unjustified distributed microservices architectures that violate Conway's law (without compliance/hardware boundaries) as **HIGH**

#### M. Operational Readiness, Rollback & Observability

- Verify tasks include structured logging, OpenTelemetry traces, and metric emission
- Verify that operational runbooks and disaster recovery (RTO/RPO) considerations exist
- Flag missing rollback verification or missing telemetry tasks as **HIGH**

### 5. Severity Assignment

Use this heuristic to prioritize findings:

- **CRITICAL**: Violates constitution MUST, missing core spec artifact, requirement with zero coverage that blocks baseline functionality, or **hard commercial gate breach** (focus law / killed SKU / price floor contradiction)
- **HIGH**: Duplicate or conflicting requirement, ambiguous security/performance attribute, untestable acceptance criterion, **commercial drift** (cold CAC, brand isolation, missing plan on monetized feature)
- **MEDIUM**: Terminology drift, missing non-functional task coverage, underspecified edge case, missing GTM artifacts for hero offer
- **LOW**: Style/wording improvements, minor redundancy not affecting execution order

### 6. Compute Verdict

Map findings to a single gate verdict using this heuristic:

| Verdict      | Condition                                                                              |
| ------------ | -------------------------------------------------------------------------------------- |
| **PASS**     | Zero CRITICAL findings AND zero HIGH findings                                          |
| **MEDIUM**   | At least one HIGH finding but no CRITICAL — proceed only with explicit user acceptance |
| **HIGH**     | Multiple HIGH findings — implement should not proceed without rework                   |
| **CRITICAL** | Any CRITICAL finding — implement is blocked                                            |

If `--override` was passed in `$ARGUMENTS`, verdict is `OVERRIDDEN: <reason>` regardless of detection results.

### 7. Write Analysis Report (file + stdout)

Compute `FEATURE_DIR` from prerequisites step. Ensure `FEATURE_DIR/reviews/` exists (create if missing). Write the report to `FEATURE_DIR/reviews/analyze.md`, **overwriting** any prior version. Also print the same content to stdout for the user.

Report structure:

````markdown
# SpecKit Analyze: <feature-slug>

**Reviewer**: analyze (Claude self-consistency)
**Reviewed at**: <ISO 8601 timestamp>
**Commit**: <git rev-parse HEAD>
**Artifacts**: spec.md, plan.md, tasks.md[, data-model.md, contracts/, …]

## Findings

| ID  | Category    | Severity | Location(s)      | Summary                    | Recommendation                       |
| --- | ----------- | -------- | ---------------- | -------------------------- | ------------------------------------ |
| A1  | Duplication | HIGH     | spec.md:L120-134 | Two similar requirements … | Merge phrasing; keep clearer version |

(Add one row per finding; generate stable IDs prefixed by category initial. Limit 50 rows; aggregate remainder in overflow note.)

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| --------------- | --------- | -------- | ----- |

## Constitution Alignment Issues

(List principle name + violation; empty section is fine.)

## Commercial / Business Plan Alignment

- Plan files loaded: [paths | none]
- Focus/hard laws checked: [summary | n/a]
- Findings: [none | see table IDs H*]
- If none and commercial feature: state explicitly "No commercial drift detected" or "No plan — HIGH/waiver"

## Unmapped Tasks

(Tasks with no matched requirement; empty section is fine.)

## Metrics

- Total Requirements: N
- Total Tasks: N
- Coverage % (requirements with ≥1 task): X%
- Ambiguity count: N
- Duplication count: N
- CRITICAL count: N
- HIGH count: N
- MEDIUM count: N
- LOW count: N

## VERDICT

```yaml
verdict: PASS | MEDIUM | HIGH | CRITICAL | OVERRIDDEN
override_reason: <only present if verdict is OVERRIDDEN>
reviewer: analyze
reviewed_at: <ISO timestamp>
commit: <git SHA>
critical_count: <N>
high_count: <N>
medium_count: <N>
low_count: <N>
```
````

```

### 8. Provide Next Actions

After file write, print to user:

- File path written
- Verdict
- Top-3 findings (if any)
- Recommended next step:
  - **PASS** → "Ready for `/speckit.review` from external AIs (Codex Desktop, Antigravity, Gemini, Copilot). Need ≥2 PASS verdicts before `/speckit.implement` per constitution Principle VI."
  - **MEDIUM/HIGH/CRITICAL** → "Resolve flagged findings, then re-run `/speckit.analyze`. Or pass `--override <reason>` if you have a deliberate justification."

### 9. Offer Remediation

Ask the user: "Would you like me to suggest concrete remediation edits for the top N issues?" (Do NOT apply them automatically.)

## Operating Principles

### Context Efficiency

- **Minimal high-signal tokens**: Focus on actionable findings, not exhaustive documentation
- **Progressive disclosure**: Load artifacts incrementally; don't dump all content into analysis
- **Token-efficient output**: Limit findings table to 50 rows; summarize overflow
- **Deterministic results**: Rerunning without changes should produce consistent IDs and counts

### Analysis Guidelines

- **NEVER modify feature artifacts** (`spec.md`, `plan.md`, `tasks.md`, `data-model.md`, `contracts/*`, `quickstart.md` — strictly read-only). The only file this command writes is `FEATURE_DIR/reviews/analyze.md` (the report itself, with VERDICT block).
- **NEVER hallucinate missing sections** (if absent, report them accurately)
- **Prioritize constitution violations** (these are always CRITICAL)
- **Use examples over exhaustive rules** (cite specific instances, not generic patterns)
- **Report zero issues gracefully** (emit success report with coverage statistics)

## Context

$ARGUMENTS
```

# UnderUndre AI Helpers Constitution

Binding principles for `clai-helpers` CLI + the curated `.claude/` template it ships. Every `/speckit.*` command checks plans and tasks against this file. Violations halt work until resolved or the constitution is explicitly amended.

## Core Principles

### I. Source of Truth Discipline

`.claude/` is **the** authoritative AI configuration. All downstream formats (`.github/prompts/`, `.github/instructions/*.instructions.md`, `.gemini/`, `GEMINI.md`, `.github/copilot-instructions.md`) are **generated**, never hand-edited.

- Edits flow one direction: `.claude/` → transformers → consumer tree.
- Any reverse flow (editing a generated file) is an incident and must be rolled back via `clai-helpers sync`.
- Hand-written instruction files under `.github/instructions/{project,persona,coding}/` are the explicit exception and are preserved by pipeline exclusion, not by luck.

### II. Transformer, Not Fork

New AI-tool target = one new transformer in `packages/cli/src/transformers/` + registration + pipeline entry in `helpers.config.ts`. Duplicating `.claude/` into a new directory tree is forbidden.

- Rationale: two copies of the same instruction drift. The CLI pipeline is the anti-drift discipline.
- Corollary: `.agent/`, `.gemini/`, `.github/prompts/` etc. MUST be produced by the pipeline, not maintained by hand.

### III. Protected Slots over Hand-Editing

Project-specific overrides inside managed files MUST use `<!-- HELPERS:CUSTOM START --> … <!-- HELPERS:CUSTOM END -->` markers. These survive `sync`. Unmarked hand-edits to managed files are lost silently on next sync — by design.

- Consumer projects never edit generated trees directly.
- CLI-computed fields recorded in `helpers-lock.json` (e.g. the stack binding of an agent's `skills:` frontmatter line) are pipeline output, not overrides: the CLI writes them, sync re-applies them, and drift checks catch hand edits.
- Upstream improvements that would benefit every consumer go through `UnderUndre/ai` + `sync`, not local patch.

### IV. SemVer Discipline in the 0.x Zone (NON-NEGOTIABLE)

While `clai-helpers` is pre-1.0:

- **Breaking change** → MINOR bump (de facto major in 0.x semantics).
- **Feature** → MINOR bump.
- **Bugfix** → PATCH bump.
- **`chore:` / `docs:` / `refactor:` / `ci:` / `test:` / `build:`** → NO bump. Every `chore: bump version` commit is a smell.
- Going to `1.0.0` is a one-way public promise of API stability. Not before migration notes, deprecation cycles, and a tagged RC.

Full framework: `.claude/skills/semver-versioning/SKILL.md`. Bump via `/bump` command — never by hand-editing `package.json#version`.

### V. Token Economy for AI Artifacts

Every file in `.claude/` earns its place by being invoked. Decorative clones, stale mirrors, and "just in case" agents bloat the context window of every downstream Claude session.

- A file not referenced by any command, agent, or skill in 60 days is a candidate for deletion.
- `ultrathink` markers belong on entry points (commands + primary agents + decision-framework skills), not on every file. Each marker costs reasoning budget on load.
- Persona flavor (catchphrases, aphorisms) MUST be opt-in via a separate transpile target so non-Russian-speaking consumers can omit it.

### VI. Cross-AI Review Gate (NON-NEGOTIABLE)

`/speckit.implement` MUST NOT proceed without explicit gate approval. The gate requires:

1. `/speckit.analyze` written `specs/<slug>/reviews/analyze.md` with verdict ∈ {PASS, OVERRIDDEN}.
2. At least **2 distinct external AI reviewers** (Codex Desktop, Antigravity, Gemini CLI, Copilot, or Claude in an independent session) wrote `specs/<slug>/reviews/<provider>.md` via `/speckit.review` with verdict ∈ {PASS, OVERRIDDEN}.

Rationale: the model that wrote the spec is the worst auditor of the spec. Independent eyes find what the author already rationalized away. Two reviewers is the minimum to distinguish a real signal from a single-model blind spot.

Override is permitted via `--override-gate <reason>` passed to `/speckit.implement`. Every override is logged to `specs/<slug>/reviews/_gate-override.md` with timestamp, actor, commit SHA, and reason. Frequent overrides on a single feature are an incident, not a workflow.

Reviewers identify themselves by tool — `claude`, `codex`, `antigravity`, `gemini`, `copilot`. Two reviews from the same provider count as one. The gate trusts the provider tag in the VERDICT block; falsifying it defeats the purpose.

### VII. Artifact Versioning

Every pipeline stage that mutates a feature artifact (specify, clarify, **requirements-audit**, plan, tasks, **test-design**, review, **qa-signoff**, **bizplan**, **workaround-audit**) MUST tag the commit via `.specify/scripts/{bash,powershell}/snapshot-stage.{sh,ps1}` using the convention `<stage>/<slug>/v<N>`.

- Tags are the **only** historical record. **No parallel `.history/` files** — git is the history. Duplicating into `specs/<slug>/.history/` is an anti-pattern: it drifts and bloats the tree.
- `/speckit.diff <slug>` reads tags to compare iterations without speculative file copies.
- `/speckit.retrospective` reads `tasks/<slug>/v1` → HEAD to bound the implementation lifecycle and surface lessons-learned.
- The snapshot script is **idempotent** via `--points-at HEAD` guard — re-running a speckit command on the same commit reuses the existing tag instead of polluting the namespace.
- Reviewers (`/speckit.review`) only need ONE of them to call snapshot — the idempotency guard ensures parallel reviewers don't duplicate.
- Stage name **`bizplan`** is reserved for `/speckit.business-plan` create/update commits.

### VII-B. Business Plan Stage (Commercial Canon)

Product/agency work MUST keep a living business plan under `docs/**/*business-plan*.md` (template: `.specify/templates/business-plan-template.md`).

1. **First commercial feature:** `/speckit.business-plan` **CREATE** (or specify step 0 CREATE gate) **before** or as hard prerequisite to the first `spec.md`.
2. **Second+ features:** `/speckit.business-plan` **UPDATE** when the feature changes ICP, pricing, packaging, focus gates, legal/payment rails, or unit economics — normally after specify/clarify, before plan hardens.
3. Plans MUST include honest traction, stress unit economics, explicit Phase focus laws, and a **GTM spine** (ICP, offer ladder, Phase A channels, CAC, convert KPIs, sales artifacts, kill-criteria). “Production Ready” at zero revenue is a defect. Full sales playbooks/content calendars are optional satellites (`docs/sales-playbook.md`, etc.), not day-one canon.
4. Technical `/speckit.plan` MUST NOT silently violate active business-plan gates; conflict → update plan with approval or narrow scope.
5. Chore-only features may waive via `specs/<slug>/business-plan-waiver.md` + reason.
6. **Review hybrid (not a second Principle VI):**
   - **(A)** Stress Pass inside `/speckit.business-plan` on every write;
   - **(B)** Commercial-drift lens inside `/speckit.analyze` + `/speckit.review` (plan vs feature artifacts);
   - **(C)** External `/speckit.business-plan-review` → `docs/reviews/business-plan-<provider>.md` on **CREATE** (recommended) and **major** bumps (required by process). Layer C alone does **not** gate `/speckit.implement`.

### VIII. Self-Maintaining Knowledge

The AI workflow infrastructure MUST keep itself current. Lessons learned are captured into staged knowledge; recurring patterns get promoted into skills/agents; project-wide spec drift is corrected actively. The repo is a learning system, not a static template.

Mechanisms (delivered May 2026):

1. **Intent Routing** (CLAUDE.md §"Intent Routing" + `/dispatch` command). User utterances map to known commands/agents. Soft-baseline transpiles to all targets; CC adds reliability via `UserPromptSubmit` hook (`.claude/hooks/intent-hint.sh`).
2. **Agent skills loading** (`.claude/hooks/agent-skills-reminder.sh`). `PreToolUse(Task)` hook prepends "load skills from frontmatter" reminder into the spawned subagent's prompt. Prevents subagents from skipping their declared skills.
3. **Session checkpoint** (`.claude/hooks/session-checkpoint.sh`). Stop hook fires once per session at turn ~30 to remind about `/improve`, `/learn`, spec updates. Counter-gated to avoid alarm fatigue.
4. **Pattern capture** (`/learn <slug>`). Stages reusable patterns in `knowledge/patterns/<slug>.md` with `status: draft`. Not a final destination — patterns mature here before being promoted.
5. **Promotion** (`/improve`). Reads `knowledge/patterns/`, proposes targeted promotions into specific `.claude/skills/<name>/SKILL.md` or `.claude/agents/<name>.md`. Promotion is explicit, not automatic.
6. **Living spec** ([`specs/main/architecture.md`](../../specs/main/architecture.md) + [`requirements.md`](../../specs/main/requirements.md)). Canonical source for project topography and contracts. Updated when arch changes — drift here is treated as a defect.

Violations (signals, not blockers):

- Same anti-pattern observed in 2+ commits within a quarter without a corresponding `knowledge/patterns/` entry → `/learn` candidate.
- Agent X spawned 3+ times for tasks that touch domain Y without using domain-Y skill → frontmatter or skill itself is wrong.
- `specs/main/` last-modified > 90 days while `packages/cli/src/` had ≥10 commits → spec drift, run a refresh.
- `knowledge/patterns/` entries with `status: draft` older than 60 days → either promote (`/improve`) or close as won't-fix.

Detection is **fuzzy**, not automated gates. This principle informs `/speckit.retrospective`, `/improve`, and the Stop checkpoint hook — they raise these signals when they see them. Acting on the signals is the maintainer's call. Unlike Principles IV/VI/VII, VIII does not block `/speckit.implement`.

Hybrid enforcement:

- **Soft baseline**: Intent Routing table + `/dispatch` + `/learn` + `/improve` — all in `.claude/`, transpile to Copilot/Gemini/Codex/Antigravity.
- **CC ratchet**: hooks under `.claude/hooks/` + `.claude/settings.json` registration. Live upstream-only by design (Hybrid enforcement decision from May 2026 brainstorm). Do not transpile; not in `helpers.config.ts.sources`.

### IX. Two-Phase Review Flow

Feature development uses two distinct branch phases:

1. **Planning branch**: `specs/<slug>` — holds spec-only artifacts (spec.md, plan.md, tasks.md, reviews/). No implementation code.
2. **Implementation branch**: `<slug>` — created from `main` after planning PR merges. Holds code changes.

This replaces the old `feature/<N>-<slug>` convention. Existing `feature/<N>-<slug>` branches are grandfathered; new features MUST use the two-phase pattern.

**Hotfix carve-out**: production hotfixes (<50 LOC, prod incident with ticket reference) skip the two-phase flow and may branch directly from `main` using a `hotfix/` prefix.

**Spec patch drift policy**: during implementation, minor spec clarifications that don't change scope may be patched directly into the spec with a dated note (e.g., `<!-- Drift note: 2026-05-25 — clarified error handling → validated with Zod -->`). Scope-changing drift requires a new planning PR.

**Command integration**:

- `/speckit.start` creates `specs/<slug>` branches.
- `/speckit.implement` creates `<slug>` implementation branches from `main` after planning merge.
- Branch auto-cleanup targets `specs/<slug>` branches after merge (via CI workflow).

### X. Zero-Downtime Data Architecture & Expand/Contract (NON-NEGOTIABLE)

All database schema modifications MUST follow the 4-phase Expand/Contract zero-downtime protocol:

1. **Phase 1 (Expand)**: Additive schema changes only (new nullable columns or new tables); non-locking concurrent DDL (`CREATE INDEX CONCURRENTLY`); application code remains 100% backward-compatible simultaneously with versions $N$ and $N-1$.
2. **Phase 2 (Dual-Write & Backfill)**: Service layer writes to both old and new schema representations, continues reading from old; rate-limited background backfill script migrates historical data.
3. **Phase 3 (Cutover)**: Application reads switch to new schema; monitor telemetry for zero regression.
4. **Phase 4 (Contract)**: Drop deprecated columns/tables and remove dual-write adapters in a dedicated cleanup migration.

Single-step breaking DDL (`DROP COLUMN`, 1-step rename, `NOT NULL` without default on hot tables) is strictly prohibited on production schemas.

### XI. Spike Governance & Prototype Deprecation (ISO/IEC/IEEE 12207)

Exploratory research spikes and Proof-of-Concepts (PoC) MUST adhere to formal Decision Management:

1. **Timeboxed bounds**: Spikes must have a strictly bounded timebox (<= 2 days).
2. **Numerical validation**: Acceptance must be verified by quantitative metrics (latency quantiles p95/p99, throughput, memory overhead).
3. **Mandatory Code Disposal**: Prototype code and exploratory branches MUST be completely discarded. Merging or copy-pasting raw spike code into production files is strictly prohibited. Production deliverables must be implemented clean-room from scratch against typed contracts and automated test suites.
4. **No fake TDD ballast**: Rigid TDD test suites are prohibited on temporary spike code to prevent accumulating throwaway abstraction debt.

### XII. QA & Test Artifact Contour (ISO/IEC/IEEE 29119 + 29148)

Manual QA artifacts are part of the pipeline canon, not an afterthought. Three commands form the contour:

1. **Stage 2.5 — `/speckit.requirements-audit`** (gate): audits `spec.md` against ISO/IEC/IEEE 29148:2018 (Verifiability, Consistency, Completeness, Unambiguity) and scores every FR/NFR with Risk = Impact (1–5) × Probability (1–5). Outputs `specs/<slug>/requirements-audit.md` + draft `specs/<slug>/qa/preliminary-rtm.md`. Verdict **REJECTED blocks `/speckit.plan`** (bypass only via `--override-gate "<reason>"`, logged). Runs after `/speckit.specify` (or `/speckit.clarify`), before `/speckit.plan`.
2. **Stage 5.5 — `/speckit.test-design`**: after `/speckit.tasks`, generates `specs/<slug>/qa/{rtm-matrix.md, test-cases.md, uat-scenarios.md, regression-suite.md}` per ISO/IEC/IEEE 29119-3:2021 (artifacts) and 29119-4:2021 (techniques: BVA, EP, Decision Table, State Transition, Error Guessing). Test depth scales by Risk Score. RTM traceability is end-to-end: `FR ↔ Task ↔ Commit/PR ↔ TC ↔ Bug`, with an NFR Level 1 Evidence table (raw benchmark/scan artifacts, not impressions). Runs before/parallel to `/speckit.implement`.
3. **Stage 8.5 — `/speckit.qa-signoff`** (gate): after manual QA execution on staging/preview, issues a three-position verdict — `APPROVED` / `APPROVED WITH RISKS` (requires a filled Residual Risk Register + explicit risk owner confirmation) / `BLOCKED`. **BLOCKED prohibits `/speckit.code-review` and merge.** Outputs `specs/<slug>/qa/signoff-report.md`. Bypass via `--override-gate "<reason>"`, logged.

Rules:

- `/speckit.analyze` MUST check RTM coverage: every FR/NFR traces to at least one test case; Risk ≥ 20 requirements MUST have Decision Table + State Transition + Exploratory Charter + UAT coverage.
- QA (does the build match the spec) and UAT (does the feature serve the business) are separate artifacts and separate questions; `uat-scenarios.md` is not a test-case dump.
- SKIPPED ≠ PASSED. Sign-off trusts explicit execution marks only.
- Snapshot stage names `requirements-audit`, `test-design`, `qa-signoff` are reserved per Principle VII.
- Hotfixes under the Principle IX carve-out skip the contour. Chore-only features may waive the contour via `specs/<slug>/qa/waiver.md` + reason (mirrors VII-B.5).

Rationale: a requirements defect caught at stage 2.5 costs minutes; the same defect at stage 9 or in production costs a release. If a requirement cannot be tested, the requirement is the defect.

### XIII. Sovereign Capacity & Productization Discipline (Little's Law & ISO 29110)

Production capacity in productized engineering is strictly constrained by physical queuing theory ($L = \lambda W$). A solo or micro-engineering unit MUST NOT allow unbuffered commercial intake to induce context-switching thrashing or violate delivery SLAs.

1. **Strict WIP Caps:** `/speckit.implement` MUST NOT be initiated on a new commercial client slot if active implementation branches exceed the declared concurrency limit (`MAX_CONCURRENT_SPRINTS = 2` by default). Excess demand is queued into a deterministic, deposit-backed Waitlist.
2. **The Intake Gate (Zero-Start on Unsanitized Input):** The delivery timebox clock (e.g. 14 days) CANNOT start upon financial receipt alone. It is strictly gated by the completion of the formal Intake Checklist (domain parameters, access tokens, entity schemas). An incomplete intake locks the project in `ON_HOLD_PENDING_ASSETS` without burning production capacity.
3. **Mandatory Productization Extraction (Cycle 6):** Every completed commercial delivery MUST execute a 1-day Knowledge Capture phase before initiating the next major build. Reusable FSM models, API connectors, and diagnostic rules MUST be extracted into internal SpecKit templates or packages (`/learn` and `/improve` loop). Re-inventing solved operational logic in subsequent client engagements is classified as architectural waste.

## Technical Constraints

> Moved to [`../../specs/main/requirements.md`](../../specs/main/requirements.md) §2.1 (single source of truth). Constitution governs **principles**; concrete tech-stack constraints live alongside requirements where they belong.

## Development Workflow

### Plumber's Loop (required for every non-trivial change)

`Classify → Analyze → Spec → Plan → Execute → Verify → Reflect`. Defined in `.github/instructions/coding/copilot-instructions.md` §5.

### WRAP atomicity

`W`rite-issue → `R`efine → `A`tomic-tasks (<500 LOC each) → `P`air-execute (one PR = one concern: refactor XOR feature, never both).

### `/speckit.*` pipeline for features

`/speckit.specify` → **`/speckit.requirements-audit`** (Principle XII gate) → `/speckit.clarify` → `/speckit.plan` → `/speckit.tasks` → **`/speckit.test-design`** (Principle XII) → `/speckit.analyze` → **`/speckit.review`** (×2 from external AI tools) → `/speckit.implement` → **`/speckit.qa-signoff`** (Principle XII gate, after manual QA) → `/speckit.code-review` → `/speckit.status`.

This file (the constitution) is loaded at the Constitution Check gate of `/speckit.plan`. Violations block until resolved.

`/speckit.implement` enforces Principle VI's cross-AI review gate before any task execution: requires `analyze.md` PASS + ≥2 distinct external reviewers PASS in `specs/<slug>/reviews/`. Override via `--override-gate <reason>` is logged.

### Quality gates before `done`

- `npm run validate` (tsc --noEmit) — clean.
- `npm test` — all pass.
- `npm run build` — produces `dist/`.
- `npx clai-helpers status --strict` — no drift between `.claude/` source and generated targets.
- Dependency supply-chain audit: zero High/Critical unmitigated CVEs (`npm audit`) and zero copyleft AGPL-3.0/GPL contamination.
- Security & log hygiene: zero unmasked PII, credentials, or session tokens in structured telemetry (PCI DSS Req 10 / ISO 27001).

### Release gate

`/bump` → confirmation → `npm version` → `git push --follow-tags` → `npm publish` (which triggers `prepublishOnly` = validate + test + build). No manual version edits. No publish from dirty tree.

## Governance

1. **This constitution supersedes ad-hoc practice.** If an agent, skill, or command contradicts a principle here, the principle wins until the constitution is amended.
2. **Amendments require a commit** that touches `.specify/memory/constitution.md` plus any dependent `.claude/` files (e.g., changing Principle IV requires updating `semver-versioning` skill and `/bump` command to match).
3. **`/speckit.analyze` enforces constitution alignment** — any misalignment in spec/plan/tasks is flagged CRITICAL.
4. **Complexity must be justified.** Every new agent, transformer, target, or skill adds load to every downstream session. A change that doesn't earn its weight is rejected.
5. **Anti-sycophancy applies to review of this file too.** If a principle above is wrong for the project, say so and propose an amendment. Don't quietly ignore it.

**Version**: 1.9.0 | **Ratified**: 2026-04-17 | **Last Amended**: 2026-10-26

### Changelog

- **1.9.0** (2026-10-26) — Added Principle **XIII: Sovereign Capacity & Productization Discipline** (Little's Law, ISO/IEC 29110 VSE basic profile, WIP limit $\le 2$ parallel sprints, 48h Zero-Call Intake Gate, mandatory 24h Productization Extraction loop). Prevents solo-engineer hydraulic overload and asset waste.

- **1.8.0** (2026-10-25) — Added Principle **XII: QA & Test Artifact Contour** (ISO/IEC/IEEE 29119-2/3/4 + 29148). Three new stages: `/speckit.requirements-audit` (2.5, REJECT blocks plan), `/speckit.test-design` (5.5, generates `qa/{rtm-matrix,test-cases,uat-scenarios,regression-suite}.md`), `/speckit.qa-signoff` (8.5, APPROVED / APPROVED WITH RISKS / BLOCKED; BLOCKED gates code-review & merge). Snapshot stages `requirements-audit|test-design|qa-signoff` reserved. Hotfix carve-out (IX) and chore waiver apply. Pipeline line updated.

- **1.7.1** (2026-10-11) — Clarified Principle III: CLI-computed, lock-recorded fields (stack binding of `skills:`) are pipeline output, not project overrides. No behavioral change. Raised by 003-stack-aware-agents analyze D3.

- **1.7.0** (2026-10-10) — Added Principle **X: Zero-Downtime Data Architecture & Expand/Contract** and Principle **XI: Spike Governance & Prototype Deprecation** aligned to ISO/IEC/IEEE 12207:2017/2026 and NIST SP 800-218 SSDF. Added supply-chain license checks (zero AGPL) and PII/token log sanitization gates (PCI DSS Req 10 / ISO 27001) to quality gates before done.
- **1.6.0** (2026-08-13) — Added Principle **VII-B: Business Plan Stage**. `/speckit.business-plan` CREATE before first commercial `spec.md`; UPDATE on later features with commercial delta; stage tag `bizplan`; technical plan must not silently violate business gates. Template: `.specify/templates/business-plan-template.md`. Wired into `speckit.start|specify|full-spec|clarify|plan`. Hybrid review (stress + analyze/review drift lens + `/speckit.business-plan-review` on create/major). GTM spine mandatory in plan; full marketing playbook optional satellite.
- **1.5.0** (2026-05-25) — Added Principle IX: Two-Phase Review Flow. Formalizes `specs/<slug>` planning branch → `<slug>` implementation branch pattern with hotfix carve-out and drift policy. Breaking change from `feature/<N>-<slug>` convention. Companion to 004-devx-bundle-v1.
- **1.4.0** (2026-05-06) — Added Principle VIII: Self-Maintaining Knowledge. Documents the May 2026 self-maintaining workflow infrastructure (Intent Routing + `/dispatch` + 3 hooks + `/learn` + `/improve` + `specs/main/`). NOT NON-NEGOTIABLE — fuzzy signals only, no `/speckit.implement` block. Hybrid enforcement: soft baseline transpiles everywhere; CC ratchet (hooks) lives upstream-only. Companion build-out: brainstorm Option B implemented over Steps 1-7.
- **1.3.0** (2026-05-06) — Moved "Technical Constraints" section out of constitution to [`specs/main/requirements.md`](../../specs/main/requirements.md) §2.1 as part of project-doc consolidation. Constitution now governs **principles only**; concrete tech-stack constraints live with requirements. No principle changes; no behavioral diff for `/speckit.*` commands.
- **1.2.0** (2026-04-26) — Added Principle VII: Artifact Versioning. Every speckit pipeline stage (specify/clarify/plan/tasks/review) now tags the commit via `snapshot-stage.{sh,ps1}` using `<stage>/<slug>/v<N>` convention. Enables `/speckit.diff` and `/speckit.retrospective` without parallel `.history/` files. Idempotent via `--points-at HEAD` guard.
- **1.1.0** (2026-04-26) — Added Principle VI: Cross-AI Review Gate (NON-NEGOTIABLE). `/speckit.implement` now requires `/speckit.analyze` PASS + ≥2 external reviewer PASS via `/speckit.review`. Override via `--override-gate <reason>` with audit log.
- **1.0.0** (2026-04-17) — Initial ratification.

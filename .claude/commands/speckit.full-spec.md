---
description: Combined specify + clarify — create feature spec and immediately clarify ambiguities in one session.
handoffs: 
  - label: Build Technical Plan
    agent: speckit.plan
    prompt: Create a plan for the spec. I am building with...
  - label: Full Plan + Tasks
    agent: speckit.full-plan
    prompt: Create plan and tasks for the spec
    send: true
---

## User Input

```text
$ARGUMENTS
```

ultrathink

You **MUST** consider the user input before proceeding (if not empty).

## Outline

This is a **combo command** that runs `/speckit.specify` followed by `/speckit.clarify` in a single session, without requiring the user to manually invoke the second command.

### Phase 0: Business plan (if required by specify gate)

Honor `speckit.specify.md` step **0**:

- **No plan + first commercial feature** → run `/speckit.business-plan` **CREATE** before Phase 1 spec body.  
- **Plan exists** → read it as constraint; defer UPDATE until after clarify if commercial delta (preferred in this combo), unless CREATE just ran.

### Phase 1: Specify

Execute the **full** `/speckit.specify` workflow as defined in `speckit.specify.md`:

1. Step 0 business-plan gate (create if needed; read existing)
2. Generate short name from feature description
3. Detect prior `/speckit.start` worktree OR create branch + spec directory
4. Load spec template from `.specify/templates/spec-template.md`
5. Parse user description, extract concepts, fill spec sections
6. Write spec to SPEC_FILE
7. Run Specification Quality Validation (checklist at `FEATURE_DIR/checklists/requirements.md`)
8. Handle validation results — fix failing items, present [NEEDS CLARIFICATION] questions (max 3)
9. Snapshot stage: `snapshot-stage.ps1 -Stage spec -Slug <slug>`
10. **Do not** run business-plan UPDATE yet if Phase 2 clarify will run — avoid double churn

**IMPORTANT**: After specify completes, do NOT report completion or suggest next steps. Immediately proceed to Phase 2.

### Phase 2: Clarify

Without pausing, execute the **full** `/speckit.clarify` workflow as defined in `speckit.clarify.md`:

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly` to get FEATURE_DIR and FEATURE_SPEC
2. Load the spec file written in Phase 1
3. Perform structured ambiguity & coverage scan (all taxonomy categories)
4. Generate prioritized queue of up to 5 clarification questions
5. Sequential questioning loop — one question at a time, with recommendations
6. Integrate each accepted answer into the spec (incremental updates)
7. Validate after each write
8. Snapshot stage: `snapshot-stage.ps1 -Stage clarify -Slug <slug>`

**Deduplication rule**: If Phase 1 already asked [NEEDS CLARIFICATION] questions and the user answered them, Phase 2 must NOT re-ask the same questions. The 5-question budget in Phase 2 applies only to NEW ambiguities not already resolved.

### Phase 3: Business plan UPDATE (second+ feature / commercial delta)

After clarify is integrated:

1. If plan was **created** in Phase 0 and clarify changed pricing/ICP/gates → **UPDATE** plan once.  
2. If plan **existed** and feature has commercial delta (see specify 0b) → run `/speckit.business-plan` **UPDATE**.  
3. If no commercial delta → report `Business plan: unchanged`.  
4. Snapshot: `snapshot-stage.ps1 -Stage bizplan -Slug <slug>` when plan file changed.

### Completion Report

After all phases complete, report:

- Branch name and spec file path
- Phase 0/3: business plan `created` | `updated vX→vY` | `unchanged` | `waived` + path
- Phase 1: checklist results, questions asked/answered
- Phase 2: questions asked/answered, sections touched, coverage summary
- Suggested next command: `/speckit.full-plan` or `/speckit.plan`

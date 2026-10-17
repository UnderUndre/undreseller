# Specification Quality Checklist: Spike Governance & Prototype Deprecation

> "Э-э-эксперименты!" — Александр Пушной & «Галилео»  
> "Удалённый код — отлаженный код." — Code Review Roasts  
> "Выжечь тут всё с орбиты. Только так мы будем уверены." — _Чужие (Aliens)_  
> "Хрен его знает, на кой ляд тебе этот микросервис сдался, но я в чужой легаси не лезу: хочешь дропнуть — значит, есть за что." — Сидорович (_S.T.A.L.K.E.R._)

**Purpose**: Validate that research spikes, proof-of-concepts (PoC), and technical investigations are strictly timeboxed, empirically verified, and barred from contaminating the production codebase (ISO/IEC/IEEE 12207 Decision Management).  
**When to use**: Any feature or architectural decision involving an exploratory technical spike, technology benchmark, novel library evaluation, or feasibility prototype.  
**When to skip**: Standard feature implementation where technology choices and patterns are already proven and established.

## Validation Items

### Hypothesis & Scope Definition

- [ ] CHK001 - Is the core technical uncertainty explicitly formulated as a falsifiable question? [Clarity]
- [ ] CHK002 - Are the boundaries of the investigation strictly separated from production application logic? [Completeness]
- [ ] CHK003 - Is the spike constrained to answering feasibility rather than writing feature code? [Consistency]

### Timeboxing & Resource Discipline

- [ ] CHK004 - Is the spike duration strictly timeboxed (e.g., maximum 1–3 business days)? [Measurability]
- [ ] CHK005 - Does the specification state the default action if the timebox expires without resolution (abort/pivot)? [Clarity]

### Numerical Evaluation Metrics

- [ ] CHK006 - Are empirical evaluation metrics defined (e.g., p95/p99 latency quantiles, throughput RPS, memory footprint)? [Measurability]
- [ ] CHK007 - Are acceptable threshold values documented prior to conducting the experiment? [Consistency]
- [ ] CHK008 - Are resource overhead and licensing constraints evaluated alongside raw performance? [Coverage]

### Prototype Deprecation & Code Disposal (NON-NEGOTIABLE)

- [ ] CHK009 - Is the Spike Disposal Path formally documented with an explicit commitment to delete the exploratory branch? [Completeness]
- [ ] CHK010 - Is there an explicit rule prohibiting merging or copy-pasting raw prototype code into the production branch? [Clarity]
- [ ] CHK011 - Is production implementation required to start clean-room from scratch against typed contracts and specifications? [Traceability]

### Test Calibration (Avoiding Fictitious TDD Ballast)

- [ ] CHK012 - Is rigid TDD prohibited on temporary spike code to prevent accumulating throwaway abstraction debt? [Clarity]
- [ ] CHK013 - Are formal automated regression tests deferred to the production clean-room implementation phase? [Consistency]

### Artifacts & Decision Recording

- [ ] CHK014 - Is the outcome required to be recorded in an Architecture Decision Record (ADR) or `research.md`? [Coverage]
- [ ] CHK015 - Does the decision record include rejected alternatives and numerical benchmarking results? [Completeness]

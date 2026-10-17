---
description: Independent external adversarial audit of docs/*business-plan*.md with mandatory live web-search ground truth. Writes docs/reviews/business-plan-<provider>.md. Recommended on CREATE and major bumps — NOT a Principle VI implement gate by itself.
handoffs:
  - label: Forensic Web Research
    agent: internet-research
    prompt: Run forensic OSINT web research to verify market claims, competitors, and unit economics benchmarks
---

## User Input

```text
$ARGUMENTS
```

Optional: `--path <plan.md>`, provider hint, or focus areas (`pricing`, `focus`, `gtm`, `legal`, `competitors`).

ultrathink

> "Чужой глаз видит кассовый разрыв, который автор уже назвал стратегией. А живой интернет видит конкурента, который закрылся с этой стратегией год назад." — Valera

## Goal

Run a **ground-truthed adversarial business-plan review** acting as a skeptical venture auditor, financial controller, and system engineer.
Identify unverified assumptions, hidden burn, unit-economics leaks, and regulatory traps.

**Does not** replace `/speckit.review` on technical features.  
**Does not** alone block `/speckit.implement` (Principle VI stays on spec/plan/tasks + commercial drift lens).  
**Does** produce an auditable external verdict for CREATE / major plan changes.

## Operating Constraints

1. **READ-ONLY** on plan content. Do not edit `docs/business-plan.md` directly. Provide actionable patches for `/speckit.business-plan --update`.
2. **NO FLATTERY / RADICAL HONESTY**: Zero polite fluff. Reject ungrounded optimism.
3. **MANDATORY LIVE WEB SEARCH & FORENSIC RESEARCH (Ground Truth)**:
   Integrate the `/internet-research` OSINT & Forensic Framework (`docs/Эталонный OSINT Промпт-Шаблон.md`):
   - Enforce the **Data Sanitization Pyramid**: Level 1 (Raw court/SEC/Git data) > Level 2 (Specs/Whitepapers) > Level 3 (Unreliable media noise).
   - Use the **Subtractive Dorking Engine** (`site:`, `filetype:pdf/csv/json/log`, `-promo`, `-marketing`).
   - You are FORBIDDEN from relying solely on static training memory for market dynamics, competition, and benchmarks. You MUST query the web for:
     - **Real Competitors**: Direct/indirect players currently active in the niche/region, pricing, and live offerings.
     - **TAM / SAM / SOM & Trends**: Up-to-date reports and niche dynamics.
     - **Unit Econ Benchmarks**: Current realistic CAC, conversion rates, CPM/CPC, payment gateway fees, SaaS churn rates.
     - **Legal / Tax / Compliance**: Local tax rates, mandatory filings, payment processing restrictions.
   - **Bayesian Base Rate Calibration**: Calibrate growth and market claims against empirical industry base rates ($P(A)$).
   - **Scam & Bubble Detection**: Check for FOMO urgency, non-falsifiability, and asymmetric yield claims.
     _(Fallback: If Web Search tool is unavailable, explicitly tag every unverified claim as `[UNVERIFIED_ASSUMPTION]` and elevate severity to at least HIGH)._

## Provider tag

Same table as `/speckit.review`: `claude` | `codex` | `antigravity` | `gemini` | `copilot` | other (ask user).

## Execution Workflow

### 1. Load Context

- Read all `docs/**/*business-plan*.md` or target `--path`.
- Read related `specs/**/spec.md` only for drift context.
- Read Constitution Principle VII-B.

### 2. Live Web Search & Ground Truth Probe (via `/internet-research` Engine)

- Execute targeted queries using the `/internet-research` Dorking vectors (Registries, raw test results, post-mortems).
- Benchmark claims against Level 1 / Level 2 evidence: market sizing, competitor pricing models, average CAC/churn in target ICP, and tax/payment traps.
- Document ground truth links/facts with deterministic identifiers (DOI / URL / Case Number) to benchmark against plan claims.
- Flag any ungrounded claim or Level 3 media quote as `[UNRELIABLE: LEVEL 3]` or `[UNVERIFIED_ASSUMPTION]`.

### 3. Audit Dimensions (Lenses A–K)

| ID    | Lens                    | Stress Probes & Mandatory Checks                                                                                                                                                                                            |
| :---- | :---------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **Traction honesty**    | Fake "Production Ready"? Paper letters of intent treated as real ARR? Has validation passed The Mom Test (past behavior proof vs hypothetical promises)?                                                                    |
| **B** | **Unit econ stress**    | **Mandatory Pessimistic Recalculation**: Run scenario with **CAC ×2**, **Conversion −30%**, +15% payment gateway/refund/chargeback leakage, and full employer tax burden. Is margin positive? Where is the real Break-even? |
| **C** | **Focus law**           | Dual-front distraction, lab leak, secondary brand engineering before primary revenue gate?                                                                                                                                  |
| **D** | **Pricing / SKU**       | Price floors, killed SKUs still offered, unpaid custom discovery, race-to-the-bottom pricing?                                                                                                                               |
| **E** | **GTM spine**           | Realistic ICP, concrete acquisition channels (not generic "SEO/Viral"), convert KPIs, kill-criteria?                                                                                                                        |
| **F** | **Legal rails**         | Corporate entity, sales tax/VAT, merchant of record, 5472/TOS traps on micro-revenue, GDPR/data processing liabilities?                                                                                                     |
| **G** | **Brand isolation**     | Narrative bleed between sub-products, reputation contamination?                                                                                                                                                             |
| **H** | **Operational valves**  | ERP lock-in, unscalable manual ops, inventory/catalog limits, client stall SLA?                                                                                                                                             |
| **I** | **Market claims**       | Claims factchecked against live web search. Did author ignore entrenched competitors? Hallucinated TAM?                                                                                                                     |
| **J** | **Enterprise XY-Valve** | Solo-founder attempting enterprise B2B (SOC 2, SAML/SCIM, 24/7 SLA, 12-mo sales cycle) without applying 1 of 4 Redirect Strategies (Wedge PLG, Productized Service, Marketplace Plugin, Fast-Track)?                        |
| **K** | **7 Powers Moat**       | Does the business model prove at least 1 durable moat (Switching Costs, Counter-Positioning, Process Power, Scale Economies) protecting against big tech / API wrapper copycats?                                            |

### 4. Severity Rules

- **CRITICAL**: Dealbreaker. Will burn cash, cause insolvency, legal shutdown, or stall within ≤90 days (e.g. negative unit economics under stress test, unaddressed direct monopoly competitor, illegal payment routing).
- **HIGH**: Major operational drag or unvalidated assumption that distorts runway/break-even by >30%.
- **MEDIUM**: Optimization leaks (suboptimal pricing tier, vague SLA, minor tax friction).
- **LOW**: Editorial, formatting, or trivial cosmetic gaps.

### 5. Verdict Gate

| Verdict      | Condition            | Action                                               |
| :----------- | :------------------- | :--------------------------------------------------- |
| **PASS**     | 0 CRITICAL, 0 HIGH   | Ready for commercial canon.                          |
| **MEDIUM**   | 0 CRITICAL, 1–2 HIGH | Ship only with explicit risk sign-off.               |
| **HIGH**     | >2 HIGH, 0 CRITICAL  | Rework required before paid public offers.           |
| **CRITICAL** | ≥1 CRITICAL          | **REJECT / REWRITE**. Plan is fantasy until patched. |

---

## Output Target

Create `docs/reviews/` if missing. Output to `docs/reviews/business-plan-<provider>.md`:

````markdown
# Business Plan Adversarial Review

**Reviewer**: <provider>  
**Reviewed at**: <ISO Timestamp>  
**Plans Evaluated**: <paths>  
**Commit**: <SHA>  
**Viability Score**: <1 to 10>  
**Investment Verdict**: [INVEST / REWORK / DISCARD]

---

## 1. 🔍 Factchecking & Live Market Ground Truth

_(Based on live web search benchmarks)_

- **Market & Demand Reality**: [Verified TAM/SAM vs plan claims]
- **Competitors Overlooked / Underestimated**: [Real names, current pricing, feature moats from search]
- **Pricing & Cost Reality**: [How plan pricing stacks up against current market alternatives]

## 2. 💣 Financial & Unit Economics Stress-Test

- **Pessimistic Scenario (CAC ×2, Conversion −30%)**: [Recalculated unit margin, contribution margin, and payback period]
- **Hidden / Leaked Operational Costs**: [Taxes with payroll, merchant fees, chargebacks, refunds, staging/SaaS infra, customer support load]
- **Break-Even Reality Check**: [Stated vs Stress-Tested break-even timeline and cash buffer]

## 3. ⚠️ Top Dealbreakers & Fatal Leaks

1. **[Leak 1]**: ...
2. **[Leak 2]**: ...
3. **[Leak 3]**: ...
4. **[Leak 4]**: ...
5. **[Leak 5]**: ...

## 4. 📋 Structured Findings (Lenses A–I)

| ID   | Lens | Severity | Finding                      | Root Cause & Evidence                                     | Concrete Patch                                               |
| :--- | :--- | :------- | :--------------------------- | :-------------------------------------------------------- | :----------------------------------------------------------- |
| F-01 | B    | CRITICAL | Negative margin under 2x CAC | Live search shows Google CPC in niche is $8.50, not $2.00 | Increase LTV via mandatory annual upfront or kill self-serve |
| F-02 | I    | HIGH     | Direct competitor ignored    | [Competitor X] offers identical SKU at $49/mo             | Shift positioning to niche ICP [Y]                           |

## 5. 🎯 Actionable Wrenches (3–5 Non-Negotiable Fixes)

1. **[Fix 1]**: [Concrete action, e.g. "Add 2.9% + 30¢ Stripe fee and 20% VAT reserve to margin formula"].
2. **[Fix 2]**: [Concrete action].
3. **[Fix 3]**: [Concrete action].

---

## VERDICT

```yaml
verdict: PASS | MEDIUM | HIGH | CRITICAL
viability_score: <1-10>
recommendation: INVEST | REWORK | DISCARD
reviewer: <provider>
reviewed_at: <ISO>
plans:
  - <path>
critical_count: <N>
high_count: <N>
medium_count: <N>
low_count: <N>
```
````

```

Print summary to terminal: Path + Viability Score + Verdict + Top 3 Dealbreakers.
Suggest: Run `/speckit.business-plan --update` to apply required patches.
```

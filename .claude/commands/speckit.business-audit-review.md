---
description: Independent external adversarial audit of docs/*business-audit*.md with mandatory live web-search ground truth. Writes docs/reviews/business-audit-<provider>.md. Recommended on CREATE and major turnaround pivots.
handoffs:
  - label: Forensic Web Research
    agent: internet-research
    prompt: Run forensic OSINT web research to verify suspect audit claims and market ground truth
---

## User Input

```text
$ARGUMENTS
```

Optional: `--path <audit.md>`, provider hint, or focus areas (`runway`, `toc`, `margins`, `churn`, `retrenchment`, `debt`).

ultrathink

> "Чужой P&L всегда выглядит красивее, пока не заглянешь в выписку банка за прошлый вторник и не увидишь кассовый разрыв. Запрещено верить словам менеджмента — верим только 13-недельному манометру ликвидности, живому cashflow и выписке из банка." — Valera

## Goal

Run a **ground-truthed adversarial business-audit review** acting as a skeptical Turnaround Specialist (TMA standards), forensic accountant, and operational system engineer.
Identify unverified financial optimism, paper profits, hidden cash leaks, unaddressed TOC bottlenecks, and unliquidated zombie projects.

**Does not** replace `/speckit.review` on technical features.  
**Does not** alone block `/speckit.implement` (Principle VI stays on spec/plan/tasks).  
**Does** produce an auditable external verdict for CREATE / major turnaround audit changes.

## Operating Constraints

1. **READ-ONLY** on audit content. Do not edit `docs/business-audit.md` directly. Provide actionable patches for `/speckit.business-audit --update`.
2. **NO FLATTERY / RADICAL HONESTY**: Zero polite fluff. Reject management optimism.
3. **MANDATORY LIVE WEB SEARCH & FORENSIC RESEARCH (Ground Truth)**:
   Integrate the `/internet-research` OSINT & Forensic Framework (`docs/Эталонный OSINT Промпт-Шаблон.md`):
   - Enforce the **Data Sanitization Pyramid**: Level 1 (Raw court/SEC/Git data) > Level 2 (Specs/Whitepapers) > Level 3 (Unreliable media noise).
   - Use the **Subtractive Dorking Engine** (`site:`, `filetype:pdf/csv/json/log`, `-promo`, `-marketing`).
   - You are FORBIDDEN from relying solely on static training memory for market dynamics, interest rates, industry DSO/DIO benchmarks, and competitor pricing. You MUST query the web for:
     - **Industry Cash Cycle Benchmarks**: DSO, DIO, DPO norms for target industry.
     - **Supplier & Debt Realities**: Current interest rates, refinancing norms, debt covenants.
     - **Market Alternatives**: Solutions churned clients are switching to.
     - **Legal / Regulatory Limits**: Local bankruptcy triggers, labor severance laws, tax audit penalties.
   - **Bayesian Base Rate Calibration**: Calibrate turnaround and recovery claims against empirical industry default/turnaround base rates ($P(A)$).
   - **Scam & Bubble Detection**: Check for FOMO urgency, non-falsifiability, and asymmetric yield claims.
     _(Fallback: If Web Search tool is unavailable, explicitly tag every unverified claim as `[UNVERIFIED_ASSUMPTION]` and elevate severity to at least HIGH)._

## Provider tag

Same table as `/speckit.review`: `claude` | `codex` | `antigravity` | `gemini` | `copilot` | other (ask user).

## Execution Workflow

### 1. Load Context

- Read all `docs/**/*business-audit*.md` or target `--path`.
- Read related `specs/**/spec.md` and `docs/*business-plan*` only for context.
- Read Constitution Principle VII-B.

### 2. Live Web Search & Ground Truth Probe (via `/internet-research` Engine)

- Execute targeted queries using the `/internet-research` Dorking vectors (Registries, raw test results, post-mortems).
- Benchmark claims against Level 1 / Level 2 evidence: industry DSO/DIO norms, current refinancing rates, and lost-customer alternative tools.
- Document ground truth links/facts with deterministic identifiers (DOI / URL / Case Number) to benchmark against audit claims.
- Flag any ungrounded claim or Level 3 media quote as `[UNRELIABLE: LEVEL 3]` or `[UNVERIFIED_ASSUMPTION]`.

### 3. Audit Dimensions (Lenses A–K)

| ID    | Lens                        | Stress Probes & Mandatory Forensic Checks                                                                                                                                                                                                                                     |
| :---- | :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **Liquidity & TWCF**        | Is the 13-Week Cash Forecast realistic? Is Net Liquid Runway **< 4 weeks**? Has a 20–30% haircut been applied to 60+ day receivables? Is Cash Czar protocol active if critical?                                                                                               |
| **B** | **Cash vs P&L Quality**     | Is Operating Cash Flow to EBITDA Ratio **< 0.5**? Are paper profits masking uncollected debt or stale inventory?                                                                                                                                                              |
| **C** | **Contribution Margin**     | Are any SKUs operating at negative $CM_2 \le 0$? Has category C tail (bottom 50% volume) been scheduled for immediate delisting? Is Net Client Margin calculated post Cost-to-Serve?                                                                                          |
| **D** | **TOC & Bottlenecks**       | Is there EXACTLY ONE primary operational constraint (TOC)? Is WIP Accumulation Factor **> 3 days**? Is Process Cycle Efficiency ($PCE$) **< 5%**? Is First Pass Yield ($FPY$) **< 80%**?                                                                                      |
| **E** | **Churn Forensics**         | Is Net Revenue Retention ($NRR$) **< 85%**? Is Operational Churn ($\text{OpChurn\%}$) **> 30%** due to delivery/SLA failures? Is Customer Concentration **> 25%** on one client?                                                                                              |
| **F** | **Retrenchment Sanitation** | Are Zombie Projects burning **> 20%** free cash? Is Dead Stock (no movement > 90d) **> 25%** of inventory? Is Zero-Based Budgeting (ZBB) applied to non-core G&A?                                                                                                             |
| **G** | **VC/PE Metrics**           | Is Burn Multiple **> 3.0x**? Is SaaS Magic Number **< 0.5**? Is Debt Coverage ($DSCR$) **< 1.1x**? Is Maintenance CAPEX to Depreciation **< 0.5x** (fake short-term EBITDA)?                                                                                                  |
| **H** | **Bus Factor Risk**         | Are critical operational/client links tied to a single key person without SOPs or shadow backup?                                                                                                                                                                              |
| **I** | **Supplier Exposure**       | Is single-supplier exposure **> 30%** with switching lead time **> 3 months**?                                                                                                                                                                                                |
| **J** | **Pumping-in-Clog Ban**     | Is ad spend or sales expansion proposed while product conversion or fulfillment pipelines are clogged/degrading?                                                                                                                                                              |
| **K** | **Web Ground Truth**        | Factcheck claims against live web search. Are industry DSO/DIO benchmarks respected?                                                                                                                                                                                          |
| **L** | **Hydraulic Telemetry**     | Check **Stoll $0.75 Anomaly** (zero-tolerance to billing/bank discrepancies), **SCADA Staleness** (raw logs SLA <=15m vs static BI), **WoT Sink-Faucet Balance** (token inflation/sink balance), and **Sleipner A Non-Linear Stress** (peak shear strain vs linear averages). |

### 4. Severity Rules

- **CRITICAL**: Dealbreaker. Insolvency risk within ≤30 days, negative contribution margin $CM_2$ subsidized by debt, unaddressed single TOC constraint causing systemic overflow, or false cash runway claims.
- **HIGH**: Major operational drag, unrecognized bad debt, unaddressed churn leak (>30% OpChurn), or single-source vendor dependency >3 months.
- **MEDIUM**: Suboptimal SKU pricing, minor inventory bloat (DIO > 60d), or minor ZBB overhead leaks.
- **LOW**: Formatting, cosmetic wording, or minor reporting gaps.

### 5. Verdict Gate

| Verdict      | Condition            | Action                                            |
| :----------- | :------------------- | :------------------------------------------------ |
| **PASS**     | 0 CRITICAL, 0 HIGH   | Ready for turnaround execution.                   |
| **MEDIUM**   | 0 CRITICAL, 1–2 HIGH | Ship only with explicit risk sign-off.            |
| **HIGH**     | >2 HIGH, 0 CRITICAL  | Rework audit before spending capital.             |
| **CRITICAL** | ≥1 CRITICAL          | **REJECT / REWRITE**. Audit hides critical leaks. |

---

## Output Target

Create `docs/reviews/` if missing. Output to `docs/reviews/business-audit-<provider>.md`:

````markdown
# Business Audit Forensic Adversarial Review

**Reviewer**: <provider>  
**Reviewed at**: <ISO Timestamp>  
**Audits Evaluated**: <paths>  
**Commit**: <SHA>  
**Viability Score**: <1 to 10>  
**Turnaround Verdict**: [PROCEED / REWORK / EMERGENCY_STOP]

---

## 1. 🔍 Factchecking & Forensic Cash Reality

_(Based on live web search benchmarks & bank liquidity audit)_

- **Net Liquid Runway**: [Stated vs Verified weeks of cash]
- **Cash Flow vs EBITDA Quality**: [Direct OCF / EBITDA ratio assessment]
- **AR Aging & Bad Debt Haircut**: [Verified 60+ & 90+ day receivable risks]

## 2. 💣 Contribution Margin & TOC Bottleneck Stress-Test

- **Negative Margin SKUs ($CM_2 \le 0$)**: [List of un-sanitized product/client leaks]
- **Primary TOC Bottleneck**: [Verified single constraint vs multi-bottleneck confusion]
- **Process Cycle Efficiency ($PCE$) & WIP Accumulation**: [Process flow bottlenecks & FPY rates]

## 3. ⚠️ Top Turnaround Dealbreakers & Operational Leaks

1. **[Leak 1]**: ...
2. **[Leak 2]**: ...
3. **[Leak 3]**: ...
4. **[Leak 4]**: ...
5. **[Leak 5]**: ...

## 4. 📋 Structured Findings (Lenses A–K)

| ID   | Lens | Severity | Finding                      | Root Cause & Evidence              | Concrete Patch                        |
| :--- | :--- | :------- | :--------------------------- | :--------------------------------- | :------------------------------------ |
| F-01 | A    | CRITICAL | Net Liquid Runway < 3 weeks  | Uncollected 90+ AR counted as cash | Enforce Cash Czar & 30% haircut on AR |
| F-02 | C    | HIGH     | Negative $CM_2$ on Product X | High variable logistics costs      | Immediate 20% price hike or delist    |

## 5. 🎯 Actionable Wrenches (3–5 Non-Negotiable Fixes)

1. **[Fix 1]**: [Concrete action, e.g. "Execute immediate ZBB cut of non-essential G&A by $12k/mo"].
2. **[Fix 2]**: [Concrete action].
3. **[Fix 3]**: [Concrete action].

---

## VERDICT

```yaml
verdict: PASS | MEDIUM | HIGH | CRITICAL
viability_score: <1-10>
recommendation: PROCEED | REWORK | EMERGENCY_STOP
reviewer: <provider>
reviewed_at: <ISO>
audits:
  - <path>
critical_count: <N>
high_count: <N>
medium_count: <N>
low_count: <N>
```
````

```text
Print summary to terminal: Path + Viability Score + Verdict + Top 3 Operational Leaks.
Suggest: Run `/speckit.business-audit --update` to apply required patches.
```

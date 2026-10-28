---
description: Independent external adversarial audit of clients/*/workaround-audit.md. Enforces zero-trust on TDABC calculations, verifies pain variance patterns, polices the Hierarchy of Interventions (Do Nothing -> Process -> Buy -> Build), and mandates evidence-class tagging. Writes clients/<slug>/reviews/workaround-audit-<provider>.md.
handoffs:
  - label: Forensic Web Research
    agent: internet-research
    prompt: Run forensic OSINT web research to verify competitor pricing, regional salary rates, and live COTS SaaS alternatives
---

## User Input

```text
$ARGUMENTS
```

Optional: `--path <clients/slug/workaround-audit.md>`, provider hint (`claude` | `codex` | `antigravity` | `gemini` | `copilot`).

ultrathink
> "Худший аудитор — это скрытый сейлз, который на любую течь пытается продать свой Sprint B. Если в аудите нет отвергнутых уровней вмешательства, если редкая авария выдана за ежедневную рутину, а цифры не помечены как гипотезы — перед нами не инженерный манометр, а цыганский развод. Ревью обязано защищать кошелёк клиента от нашей собственной предвзятости." — Valera

## Goal

Run a **ground-truthed adversarial review** of a client-facing Workaround Audit (`clients/<slug>/workaround-audit.md`) before it is delivered to the customer ($350–$490 Tripwire [HYPOTHESIS]). 
Act as an independent, deeply skeptical CTO, forensic operational auditor, and financial controller.

Ensure the author did not:
1. Suffer from **Vendor Bias** (jumping straight to custom software without exhausting Level 1 Process and Level 2 Buy alternatives).
2. Conflate **Continuous Drag** with **Episodic Fat-Tail incidents** to inflate annual savings.
3. Smuggle ungrounded assumptions without strict `[EVIDENCE_CLASS]` tagging.
4. Invent political conspiracy theories without Level 1/2 documentary proof.

---

## Operating Constraints

1. **READ-ONLY on Audit Content:** Do not modify `clients/<slug>/workaround-audit.md` directly. Output actionable findings to `clients/<slug>/reviews/workaround-audit-<provider>.md`.
2. **RADICAL HONESTY & ANTI-SYCOPHANCY:** Presumption of vendor bias. Every custom build recommendation is presumed GUILTY of over-engineering until proven that cheaper interventions (SOP, COTS) fail.
3. **MANDATORY LIVE WEB SEARCH & GROUND TRUTH (via `/internet-research`):**
   - Query live COTS SaaS pricing for the client's industry and geography (do NOT rely on stale memory ranges).
   - Verify stated hourly labor rates against active job registries (hh.ru, LinkedIn, Indeed, Bayt).
   - Check local regulatory realities (e.g. verify if e-invoicing or tax compliance deadlines actually apply to this ICP tier).
4. **EVIDENCE-CLASS SANITATION POLICE:**
   - Check every single metric. If an author writes an arbitrary threshold (e.g., "Payback > 24 mo") without marking it `[HEURISTIC]`, or pricing ($490 / $4,900) without `[HYPOTHESIS]`, raise a finding.

---

## Audit Dimensions (Lenses A–H)

| ID | Lens | Forensic Stress Probes & Rules |
| :--- | :--- | :--- |
| **A** | **Hierarchy of Interventions** | Did the audit traverse the ladder strictly from **Level 0 (Do Nothing)** ➔ **Level 1 (Process / SOP)** ➔ **Level 2 (Buy COTS)** ➔ **Level 3 (Build Custom)**? Is Level 3 recommended ONLY after explicit proof of Level 1 & 2 failure? |
| **B** | **Pain Pattern & Variance** | Is the pain categorized as `CONTINUOUS`, `SEASONAL`, or `EPISODIC`? If an `EPISODIC` (rare fat-tail) or `SEASONAL` failure is recommended for custom software, is it mathematically justified against a simple printed SOP? |
| **C** | **TDABC Math & Boundary** | Is the Lite vs Full boundary respected? Did the author abstain from demanding P&L/bank data in Lite mode? Are loaded wage multipliers realistic (gross salary + 20–30% taxes/overhead)? |
| **D** | **COTS SaaS Ground Truth** | Were specific, real-world SaaS alternatives searched via OSINT? Did the author check current entry prices, localized payment gateways, and data residency constraints before rejecting Level 2 (Buy)? |
| **E** | **Via Negativa Authenticity** | Is the **Automation Prohibited List** populated with at least ONE real workflow? Is the ban economically genuine or a strawman process invented to look objective? |
| **F** | **Political Risk Restraint** | Does political risk default to `[POLITICAL_RISK: UNVERIFIED / UNKNOWN]` unless backed by concrete Level 1/2 evidence (KPI structure, recorded budget clash, documented failed rollout history)? |
| **G** | **Evidence Tagging Discipline** | Is every metric and boundary condition tagged with `[VERIFIED]`, `[HEURISTIC]`, or `[HYPOTHESIS]`? Are unverified customer claims marked `[UNVERIFIED_ASSUMPTION]`? |
| **H** | **Scope Realism (Sprint B)** | If Level 3 (Build) is approved, does the target scope fit the strict boundary: single core FSM, $\le 3$ fixed roles, zero end-user accounts, private single-tenant VPS, 14-day timebox? |

---

## Severity Rules & Verdict Gate

- **CRITICAL**: Dealbreaker. Disregards Level 1 (SOP) or Level 2 (Buy SaaS) to force-sell Sprint B; treats rare episodic errors as continuous daily loss to inflate CoW; omits the Automation Prohibited List; invents numbers without evidence tags.
- **HIGH**: Unverified regional salary inflating savings by $>25\%$; political risk marked High without documentary proof; recommending SaaS without checking current pricing; missing pain pattern classification.
- **MEDIUM**: Minor calculation rounding errors; vague SOP descriptions; incomplete ramp-up friction estimates.
- **LOW**: Minor formatting, cosmetic typography, or presentation flaws.

| Verdict | Condition | Action |
| :--- | :--- | :--- |
| **PASS** | 0 CRITICAL, 0 HIGH | Ready to deliver to paying client. |
| **REWORK** | 0 CRITICAL, 1–2 HIGH | Patch specific numbers, tags, or SOP alternatives before delivery. |
| **REJECT** | $\ge 1$ CRITICAL or $>2$ HIGH | **DO NOT DELIVER**. Rewrite audit to eliminate vendor bias. |

---

## Output Target

Create `clients/<slug>/reviews/` if missing. Output to `clients/<slug>/reviews/workaround-audit-<provider>.md`:

````markdown
# Workaround Audit Forensic Adversarial Review

**Reviewer**: <provider>  
**Reviewed at**: <ISO Timestamp>  
**Client Audit Evaluated**: <path>  
**Commit / Checksum**: <SHA / Hash>  
**Viability Score**: <1 to 10>  
**Delivery Gate Verdict**: [DELIVER_TO_CLIENT / REWORK_BEFORE_DELIVERY / REJECT_VENDOR_BIAS]

---

## 1. 🔍 Factchecking & Live Market Ground Truth
_(Independent OSINT via /internet-research)_

- **Regional Wage Reality**: [Stated rate vs Verified local market median from registries/job boards]
- **COTS SaaS Alternatives**: [Live pricing & feature checks for competitor tools overlooked by author]
- **Regulatory / Compliance Accuracy**: [Verification of cited legal acts, e.g. e-invoicing or tax deadlines]

## 2. 🪜 Hierarchy of Interventions & Variance Audit

- **Ladder Traversal Integrity**: [Did the audit honestly test Level 0 -> Level 1 -> Level 2 before Level 3?]
- **Pain Pattern Verification**: [Is the friction Continuous, Seasonal, or Episodic? Does the solution match the variance profile?]
- **Process / SOP Feasibility**: [Could a $0-cost operational checklist solve this without software?]

## 3. ⚠️ Top Audit Biases & Methodological Leaks

1. **[Leak 1]**: ...
2. **[Leak 2]**: ...
3. **[Leak 3]**: ...

## 4. 📋 Structured Findings (Lenses A–H)

| ID | Lens | Severity | Finding | Root Cause & Evidence | Concrete Patch |
| :--- | :--- | :--- | :--- | :--- | :--- |
| F-01 | A | CRITICAL | Premature Jump to Build | Author recommended Sprint B without testing a printed SOP | Add Level 1 SOP trial protocol for Days 1–7 |
| F-02 | G | HIGH | Missing Evidence Class | Payback threshold stated as hard law | Add `[HEURISTIC]` tag to 18–24 mo boundary |

## 5. 🎯 Actionable Wrenches (3–5 Non-Negotiable Fixes Before Client Delivery)

1. **[Fix 1]**: [Concrete action, e.g. "Recalculate WhatsApp booking drag using median coordinator rate of $12/hr instead of $25/hr"].
2. **[Fix 2]**: [Concrete action, e.g. "Move Supplier Invoice Reconciliation to Automation Prohibited List due to Episodic pattern"].
3. **[Fix 3]**: [Concrete action].

---

## VERDICT

```yaml
verdict: PASS | REWORK | REJECT
viability_score: <1-10>
recommendation: DELIVER_TO_CLIENT | REWORK_BEFORE_DELIVERY | REJECT_VENDOR_BIAS
reviewer: <provider>
reviewed_at: <ISO>
client_audit_path: <path>
critical_count: <N>
high_count: <N>
medium_count: <N>
low_count: <N>
```
````

```text
Print summary to terminal: Client Slug + Viability Score + Verdict + Top 3 Biases/Leaks.
Suggest: Run `/speckit.workaround-audit --client <slug> --patch` to apply required changes before client export.
```

---

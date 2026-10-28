---
description: Perform a forensic Workaround & Process-Friction Audit ($350–$490 Tripwire / Product 0). Quantifies annual manual bypass costs (TDABC Lite/Full), measures variance and pain patterns, enforces objective Political Risk tagging, and navigates the Hierarchy of Interventions (Do Nothing -> Process -> Buy -> Build).
handoffs:
  - label: Write Bypass Spec
    agent: speckit.specify
    prompt: Draft the technical specification for the single approved Level 3 (Build) intervention from this audit
    send: true
  - label: Review Workaround Audit
    agent: speckit.workaround-audit-review
    prompt: Independently verify the TDABC calculations, variance profiles, evidence classes, and Ladder of Intervention trade-offs
---

## User Input

```text
$ARGUMENTS
```

Optional flags:

- `--client <slug>` — company/client directory (writes `clients/<slug>/workaround-audit.md`)
- `--full-dso` — enable Full mode with DSO capital lock (requires client-provided receivables & cost of debt)
- Free-form context: observed workarounds, tools, staff headcounts, wages, frequency of failures.

ultrathink
> "Худший сантехник — тот, кто на любую течь предлагает переварить весь стояк. Настоящий мастер сначала проверит прокладку (SOP), потом посмотрит на стандартный кран в магазине (SaaS), и только если труба нестандартная — достанет сварку (Build). Если аудит не попытался решить проблему регламентом за $0 — перед нами не аудит, а цыганский подкат." — Valera

## Goal

Generate a client-facing 3–5 page Forensic Workaround Diagnostic Memo for an SMB client ($350–$490 Product 0 Tripwire [HYPOTHESIS]). Evaluate operational friction using the **Hierarchy of Interventions** and **Friction Pattern Variance**:

1. **Level 0 (Do Nothing):** When is tolerating the leak economically optimal?
2. **Level 1 (Process Change):** Can an operational SOP, checklist, or incentive shift kill the friction for $0 CAPEX?
3. **Level 2 (Buy COTS SaaS):** Does an off-the-shelf tool solve it with lower Total Cost of Ownership?
4. **Level 3 (Build Custom):** When and why is a sovereign productized monolith strictly justified?

---

## 1. Constitutional Audit Rules (The Zero-Trust Gasket)

1. **EVIDENCE-BOUND EPISTEMOLOGY:**
   Every metric and boundary MUST be tagged with its epistemic class:
   - `[VERIFIED]`: Level 1/2 artifacts (signed rates, published API/SaaS pricing, legal acts).
   - `[HEURISTIC]`: Engineering boundary rules (e.g., Simple Payback > 18–24 mo = High Risk).
   - `[HYPOTHESIS]`: Unvalidated assumptions (Tripwire price, retainers, conversion rates).

2. **PAIN VARIANCE & PROFILE PROBE:**
   High annual CoW alone does NOT justify software. The audit MUST categorize the pain pattern:
   - `CONTINUOUS`: High-frequency, low-variance routine (CV < 0.3) -> High automation viability.
   - `SEASONAL`: Predictable wave (1–3 months/yr) -> High risk of software idle capacity.
   - `EPISODIC / FAT-TAIL`: Rare, catastrophic manual errors -> Requires Process/SOP & legal checks, NOT bots.

3. **MANDATORY LADDER TRAVERSAL:**
   Recommending Level 3 (Build) without formally documenting the failure modes of Level 1 (Process) and Level 2 (Buy) is an automatic fatal audit defect.

4. **POLITICAL RISK OBJECTIVITY:**
   Defaults to `[POLITICAL_RISK: UNVERIFIED / UNKNOWN]`. Citing `HIGH` or `CRITICAL` requires Level 1/2 evidence (conflicting KPIs, budget loss, documented past rollout mutinies).

5. **MANDATORY VIA NEGATIVA:**
   The audit MUST contain an **Automation Prohibited List** with at least one observed friction point that is explicitly banned from software automation.

---

## 2. Calculation Pipeline

### Step 1: Pain Pattern & Variance Characterization

For each candidate friction point:

- Record frequency: times/day, times/week, or annual episodes.
- Assign `friction_pattern`: `CONTINUOUS` | `SEASONAL` | `EPISODIC`.

### Step 2: TDABC Lite Calculation (Annual Cost of Workaround)

$$\text{CoW}_{\text{Lite}} = C_{\text{FTE}} + C_{\text{SaaS}} + C_{\text{Scrap}}$$

- $C_{\text{FTE}}$ `[VERIFIED / ESTIMATED]`: Weekly manual hours × loaded hourly rate × 52 weeks.
- $C_{\text{SaaS}}$ `[VERIFIED]`: Direct subscription waste for duct-tape tools.
- $C_{\text{Scrap}}$ `[VERIFIED / ESTIMATED]`: Direct documented financial loss from errors, cancellations, and rework.

### Step 3: Traversal of the Intervention Ladder

```text
[Level 0: Do Nothing] ──(CoW > $5k & Friction Unacceptable)──► [Level 1: Process Change]
                                                                      │
        ┌─────────────────────────────────────────────────────────────┘
        ▼
(SOP Fails: Cognitive overload / Scale / Unenforceable) ──────► [Level 2: Buy SaaS]
                                                                      │
        ┌─────────────────────────────────────────────────────────────┘
        ▼
(SaaS Fails: Rigid FSM / High seat tax / Sovereignty breach) ──► [Level 3: Build Custom]
```

---

## 3. Output Structure (`clients/<client-slug>/workaround-audit.md`)

```markdown
# Forensic Workaround & Process-Friction Audit
**Client:** [Client Name / Legal Entity]
**Auditor:** UnderUndre Productized Engineering Bureau
**Date:** [ISO Timestamp]
**Audit Tier:** TDABC Lite (Default) | TDABC Full
**Recommended Level:** [Level 0: Do Nothing | Level 1: Process | Level 2: Buy | Level 3: Build]

---

## 1. Verified Workarounds & Friction Patterns

| Process / Leak | Observed Tool | Weekly Volume | Pattern | Variance (CV) | Annual CoW | Class |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [e.g. WhatsApp Booking] | WhatsApp + Excel | 30 hrs/wk | CONTINUOUS | Low (<0.2) | $31,200/yr | [VERIFIED] |
| [e.g. Supplier Invoice Mismatch] | Email + Paper | 4 episodes/yr | EPISODIC | High (>1.5) | $12,000/yr | [ESTIMATED] |

---

## 2. Friction & Political Risk Audit
- **Technical Complexity:** [Low / Med / High]
- **Political / Agency Risk:** [NONE IDENTIFIED | CRITICAL (Evidence: KPI conflict) | UNVERIFIED / UNKNOWN]
- **Staff Switching Friction:** [Estimated ramp-up hours]

---

## 3. The Hierarchy of Interventions (Step-by-Step Traversal)

### Level 0: Do Nothing (Status Quo)
- **Feasibility:** [Can the business survive this drag?]
- **Verdict:** [ACCEPTED / REJECTED]
- **Root Cause for Rejection:** [Why ignoring this burns core cash].

### Level 1: Process / SOP Change (Zero-Software Fix)
- **Proposed SOP:** [e.g., Mandatory 50% deposit link sent via manual template, 24h reminder protocol].
- **Cost to Test:** $0 CAPEX, ~5 hours management training.
- **Why it Solves / Why it Fails:** [e.g., Fails because coordinators forget to send links during peak hours (Operational Feasibility failure per TELOS)].
- **Verdict:** [RECOMMENDED AS FIRST STEP / REJECTED (Unenforceable)]

### Level 2: Buy COTS SaaS (Off-the-Shelf)
- **Candidate Tools Checked:** [Specific tools with published pricing at audit date, e.g. Yclients at $45/mo, Cal.com at $15/mo].
- **Total Cost of Ownership (3-Year):** Setup + Monthly seat fees + Integration friction.
- **Why it Solves / Why it Fails:** [e.g., Fails due to lack of localized payment gateways / rigid FSM constraints / data sovereignty requirements].
- **Verdict:** [RECOMMENDED / REJECTED]

### Level 3: Build / Deploy Sovereign Bypass (Sprint B)
*(Evaluated ONLY if Levels 0–2 are documented as non-viable)*
- **Proposed Scope:** Fixed single workflow, 3 roles, private VPS instance.
- **Financial Profile:** $4,900 flat fee `[HYPOTHESIS]`, Simple Payback Period = [N] months `[HEURISTIC]`.
- **Verdict:** [RECOMMENDED / REJECTED]

---

## 4. 🛑 AUTOMATION PROHIBITED LIST (VIA NEGATIVA)
> *The following processes were audited and are EXPLICITLY BANNED from software automation:*
- **[Process Name]:**
  - **Identified Pattern:** `EPISODIC` (Fat-Tail event occurring 3 times/year).
  - **Verdict:** **ENFORCE SOP ONLY (Level 1)**.
  - **Reason:** Automating this edge case requires disproportionate FSM complexity ($8,000+ custom code) with zero daily labor reduction. A 1-page printed checklist completely mitigates 90% of the risk.

---

## 5. Execution Roadmap & Acceptance Gates
- **Immediate Step (Days 1–7):** Deploy Level 1 SOP patch (Zero cost).
- **Secondary Step (If SOP fails threshold):** Trigger Level 2 (Buy) or Level 3 (Sprint B).
- **Acceptance Boundary:** Staging verification, zero production lock-in, data export guarantee.
```

---

## 4. Gatekeeper Checklist (Audit Rejection Criteria)

- [ ] Audit is REJECTED if any numeric claim lacks an `[EVIDENCE_CLASS]` tag (`VERIFIED`, `HEURISTIC`, `HYPOTHESIS`).
- [ ] Audit is REJECTED if it recommends Level 3 (Build) for an `EPISODIC` or `SEASONAL` pain pattern without explicit payback proof.
- [ ] Audit is REJECTED if Level 1 (Process / SOP) was not evaluated with a specific operational zero-cost countermeasure.
- [ ] Audit is REJECTED if Level 2 (Buy) cites vague ranges instead of verified market SaaS tools and current published pricing.
- [ ] Audit is REJECTED if Political Risk is marked High without citing documentary Level 1/2 evidence (otherwise must be `UNKNOWN`).
- [ ] Audit is REJECTED if the Automation Prohibited List is empty.

---
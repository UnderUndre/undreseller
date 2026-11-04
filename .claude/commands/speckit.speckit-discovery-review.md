---
description: Independent external adversarial forensic review of clients/*/workaround-audit*.md. Enforces zero-trust on TDABC calculations (time haircuts), audits stakeholder triad authority, catches false operational framing (Out-of-Scope), and ensures strict ladder traversal.
handoffs:
  - label: Forensic Web Research
    agent: internet-research
    prompt: Run forensic OSINT web research to verify local regulatory fines, salary benchmarks, and COTS SaaS pricing
---

## User Input

```text
$ARGUMENTS
```

Optional: `--path <path/to/audit.md>`, `--provider <claude|codex|antigravity|gemini|copilot>`.

ultrathink
> "Ревьюер обязан защищать аудит от профессиональной деформации инженера. Если автор насчитал экономию со слов испуганной секретарши без применения дисконта 50%, если он не выяснил, кто подписывает чеки, или пытается лечить софтом компанию, у которой просто нет клиентов — такое заключение отправляется в шредер." — Valera

## Goal

Run a ground-truthed adversarial audit review of a Workaround Audit memo before presentation to executive stakeholders ($350–$490 Tripwire).

Ensure the document is free from:

1. **Economic Buyer Blindness:** Pitching solutions to middle managers who cannot authorize funds.
2. **TDAGU (Time-Driven Approximate Guessing):** Inflated savings derived from unverified verbal claims without the mandatory 50% haircut.
3. **Operational Imperialism (Ignoring Out-of-Scope):** Forcing software onto a business whose real constraint is marketing, lead flow, or cash insolvency.
4. **Staffing Theater:** Presenting UnderUndre as an enterprise multi-head consultancy instead of a transparent solo engineering bureau.

---

## Audit Dimensions (Lenses A–J)

| ID | Lens | Forensic Stress Probes & Mandatory Checks |
| :--- | :--- | :--- |
| **A** | **Economic Buyer Alignment** | Did the audit verify that the interviewee has P&L / check-signing authority? If the sponsor is an operational manager, is the owner's buy-in documented? |
| **B** | **TOC & Out-of-Scope Probe** | Is the primary constraint genuinely operational? If the company suffers from top-of-funnel starvation (no leads), did the audit issue an **`OUT_OF_SCOPE`** verdict? |
| **C** | **Anti-TDAGU Time Haircut** | Were verbal employee time estimates subjected to the mandatory **50% haircut**? If raw reported hours were used at face value, flag as HIGH defect. |
| **D** | **Change Capacity Realism** | Was the client's past implementation track record probed? If Change Capacity $\le 2/5$, is custom software (Level 3) strictly rejected? |
| **E** | **Hierarchy of Interventions** | Did the audit honestly test Level 0 (Do Nothing) and Level 1 (Process SOP) before Level 2/3? Was a $0 delegation matrix evaluated? |
| **F** | **Variance & Pain Pattern** | Were episodic regulatory risks (e.g. AML / Trakheesi fines) separated from continuous daily labor drag? |
| **G** | **Solo Bureau Authenticity** | Does the audit avoid corporate staffing fluff ("our consulting team") and accurately state solo productized execution? |
| **H** | **COTS SaaS Ground Truth** | Did the author investigate existing off-the-shelf tools with current pricing before rejecting Level 2? |
| **I** | **Via Negativa Authenticity** | Is the Automation Prohibited List populated with a real, high-friction process that is banned from code? |
| **J** | **Epistemic Class Tagging** | Are all numbers, rates, and payback metrics tagged with `[VERIFIED]`, `[HEURISTIC]`, or `[HYPOTHESIS]`? |

---

## Severity Rules & Verdict Gate

- **CRITICAL**: Dealbreaker. Treats top-of-funnel sales crisis as an operational software problem (missed Out-of-Scope); raw verbal time claims used without haircut to engineer fake ROI; recommends custom build despite Change Capacity $\le 2$; omits Via Negativa list.
- **HIGH**: Unverified Economic Buyer authority; missing variance profiling; corporate staffing theater; subjective political risk claims without Level 1/2 evidence.
- **MEDIUM**: Minor hourly rate calculation discrepancies (<20%); incomplete COTS SaaS feature matrix.
- **LOW**: Minor formatting or typographical imperfections.

| Verdict | Condition | Action |
| :--- | :--- | :--- |
| **PASS** | 0 CRITICAL, 0 HIGH | Ready to deliver to client / economic buyer. |
| **REWORK** | 0 CRITICAL, 1–2 HIGH | Apply time haircuts, verify buyer, patch SOP, and re-run. |
| **REJECT** | $\ge 1$ CRITICAL or $>2$ HIGH | **DO NOT DELIVER**. Total rewrite required: audit suffers from vendor bias. |

---

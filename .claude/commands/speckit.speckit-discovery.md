---
description: Perform a forensic Workaround, Process-Friction & Margin-Leak Audit ($350–$490 Tripwire / Product 0). Eliminates false bottlenecks via subtractive epistemology, enforces L1-L5 evidence weighting, mandates Alt 0 Growth hypothesis, tests Implementation Conflict-of-Interest, runs Pre-Mortem analysis, and forecasts Constraint Relocation.
handoffs:
  - label: Write Bypass Spec
    agent: speckit.specify
    prompt: Draft the technical specification for the single approved Level 3 (Build) intervention from this audit
    send: true
  - label: Review Workaround Audit
    agent: speckit.workaround-audit-review
    prompt: Independently verify the TDABC math, evidence weights, epistemic ceilings, buyer alignment, and Out-of-Scope triggers
---

## User Input

```text
$ARGUMENTS
```

Optional flags:
- `--client <slug>` — company/client directory (writes `clients/<slug>/workaround-audit.md`)
- `--mode <smb | delivery-economics>` — switch between Local SMB (operations/booking) and B2B Services (utilization/invisible work)
- `--async-intake <path/to/intake.json>` — ingest 9-Gate Stage 0 Qualification Packet
- `--payroll-band <range>` — monthly OpEx/Payroll sensitivity band (prevents revenue guessing)
- `--full-dso` — enable Full mode with DSO capital lock (requires receivables & cost of debt)
- Free-form context: observed vacancies, tools, headcount, reported times, stakeholder roles.

ultrathink
> "Главная цель аудитора — не найти засор любой ценой, чтобы продать свой софт, а как можно быстрее убить ложные гипотезы и защитить клиента от ненужных строек. Настоящий цифровой сантехник держит в фокусе Нулевую Гипотезу, проверяет гипотезу здорового роста (Alt 0), режет веру на слово по таблице весов улик и прямо спрашивает себя: 'Посоветовал бы я эту херню, если бы мне запретили продавать её разработку?'" — Valera

## Goal

Generate a client-facing 3–5 page Forensic SpecKit Discovery Diagnostic Memo ($350–$490 Product 0 Tripwire).
Operate strictly as a solo practitioner wearing four explicit hats: **Diagnostic Auditor**, **Forensic Process Analyst**, **Systems Architect**, and **Product Discovery Lead**.

Primary Auditor Objective:
**Not to find a bottleneck. To eliminate incorrect bottlenecks as quickly as possible via subtractive epistemology (Via Negativa).**

Key Mandates:

1. **Stakeholder Triad & P&L Authority Gate:** Identify the **Economic Buyer** (individual with discretionary P&L signing authority $\ge \$5,000$ — Owner, CEO, COO, or VP Ops), **Process Sponsor**, and **End User**. If Buyer lacks budget authority, lock Level 3 (Build).
2. **Hard Audit Stop-Loss (Abort Conditions):** Terminate the audit immediately with zero fee capture if any of the following triggers fire:
   - `ABORT_TRIGGER_1: PROXY_INTERVIEW` — Economic Buyer refused access; delegate has zero signing authority.
   - `ABORT_TRIGGER_2: TELEMETRY_BLACKOUT` — Client demands a software solution but categorically refuses access to screen shares, CSVs, or unvarnished workflow review.
   - `ABORT_TRIGGER_3: TOC_DEMAND_GENERATION_COLLAPSE` — Zero inbound pipeline; business has no customers to service.
3. **Strict Evidence Weighting Hierarchy (L1–L5):**
   - **Level 1 ($W = 1.0$):** Primary System Telemetry (server logs, CSV DB exports, git traces).
   - **Level 2 ($W = 0.9$):** Direct Live Observation (15-min live shadowing, recorded work sessions).
   - **Level 3 ($W = 0.5$):** Internal Statements (verbal interviews, staff time estimates with mandatory 50% haircut).
   - **Level 4 ($W = 0.3$):** OSINT Signals (open vacancies, ATS postings, public leadership podcasts).
   - **Level 5 ($W = 0.1$):** Marketing Material (website copy, vendor PR, award badges).
4. **Forced Uncertainty Declaration (Confidence Ceilings):**
   - Any Confidence $>70\%$ strictly requires $\ge 2$ independent evidence sources.
   - Any Confidence $>90\%$ strictly requires at least one **Level 1** or **Level 2** artifact.
   - OSINT (L4/L5) alone can NEVER exceed **60% Direction Confidence** and **20% Magnitude Confidence**.
5. **Revenue / Headcount Guessing Ban:**
   - Revenue, Headcount, Gross Margin, and Utilization are strictly **`UNKNOWN`** by default.
   - Explicitly FORBIDDEN to extrapolate business scale from job counts, LinkedIn badges, or press releases. Scale is calibrated ONLY via Stage 0 Gate 6/8, official registry filings, or verified payroll data.
6. **Mandatory Client Health Alternative (Alt 0: Growth & Scaling):**
   - In every competing hypotheses register, the auditor MUST evaluate **Alt 0 (Healthy Expansion)**: the observed friction, hiring surge, or buffer roles are symptoms of rapid revenue scaling, not an operational failure.
7. **Implementation Conflict-of-Interest Check (The Blindfold Test):**
   - Mandatory audit query: *"Would this audit recommend the exact same intervention if the bureau were legally forbidden from selling implementation work (Sprint A / Sprint B / Custom Fork)?"*
   - If NO: Set `audit_compromised: true` and restrict recommendation to Level 0 (Do Nothing) or Level 1 ($0 SOP).
8. **Popperian Falsification & Disconfirming Evidence Search:**
   - Auditor MUST actively seek evidence that kills the leading hypothesis. Failure to document this search automatically downgrades `intervention_confidence` by one tier.
   - Mandatory explicit `falsification_criteria` in final output.
9. **Pre-Mortem Analysis (Klein Protocol):** Assume the recommended intervention failed completely 6 months post-delivery. List the top 3 structural, political, or operational failure vectors.
10. **Constraint Relocation Forecast (Goldratt Step 5):** Predict where the operational bottleneck will immediately migrate once the primary clog is resolved.
11. **Reversibility Rating (Bezos Type 1 vs. Type 2):** Classify the intervention as `HIGH` (Two-Way Door) or `LOW` (One-Way Door).

---

## 1. Formal Rubrics, Math & Protocols

### 1.1. TDABC Lite v2 Formula with Calibrated Evidence Weights
$$\text{CoW}_{\text{Lite}} = C_{\text{FTE}} + C_{\text{SaaS}} + C_{\text{Scrap}}$$
$$\text{where } C_{\text{FTE}} = \sum \left( \text{Reported Hours} \times W_{\text{evidence}} \times \text{Loaded Hourly Rate} \times 52 \right)$$

- Evidence Weight ($W_{\text{evidence}}$):
  - `1.0` [Level 1]: Direct server logs, CSV exports, automated telemetry.
  - `0.9` [Level 2]: Observed 15-minute live screen shadowing / recorded sessions.
  - `0.5` [Level 3]: Verbal interview claims (*"Takes 30 mins per case"*).
  - `0.3` [Level 4]: OSINT inference (job postings, vacancy requirements).
  - `0.1` [Level 5]: Marketing claims / website copy.
- Loaded Hourly Rate: Base gross salary + 20–30% overheads calibrated strictly against confirmed Gate 8 scale (NOT guessed).

### 1.2. Objective Change Capacity Rubric (1–5 Scale)
Score is strictly anchored to the outcome of the last process or tool change implemented within the past 12 months:

| Score | Rating | Objective Behavioral Anchor | Permitted Action |
|:---:|:---|---|---|
| **1** | **Active Rejection** | Previous tool/process abandoned or rolled back within 60 days; staff openly reverted to shadow channels (WhatsApp/Excel). | **Level 0 (Do Nothing)** only. Any software will burn budget. |
| **2** | **Passive Evasion** | Tool technically remains active, but $>50\%$ of team bypasses it; zero enforcement without owner personally screaming. | **Level 1 (Executive SOP)** only. Software strictly prohibited. |
| **3** | **Inertial Compliance** | Adoption took 3–6 months of constant management pushing; operates with friction; staff complies but complains. | **Level 1 (SOP) or Level 2 (COTS SaaS)** with zero learning curve. |
| **4** | **Managed Adoption** | Dedicated process champion exists; change was adopted within 60 days without rollbacks; minor resistance resolved. | **Level 3 (Custom Bypass)** permitted with proven ROI. |
| **5** | **Continuous Kaizen** | Team routinely tests and adopts workflows asynchronously; high digital hygiene; automated telemetry culture. | Full engineering freedom. |

### 1.3. Stage 0 Qualification Packet Protocol (The 9-Gate Intake)
Ingested asynchronously (`--async-intake`) or executed in the first 2 minutes of discovery. Closed categorical selectors with exactly one JTBD catalyst question:

```text
1. [AUTHORITY GATE] Budget sign-off authority for commitments ≥ $5,000:
   (a) Direct personal sign-off (Owner, CEO, COO, or VP with discretionary P&L)
   (b) Partner consensus / Board approval required
   (c) Multi-stakeholder corporate tender / Formal CFO procurement
   --> If (c): Lock Level 3 (Build). Engagement is strictly diagnostic reconnaissance.

2. [TOC BOTTLENECK & LEAKY BUCKET GATE] Primary commercial constraint right now:
   (a) Demand Generation: Inbound pipeline is dry / zero qualified traffic
   (b) Conversion Leak (Leaky Bucket): Leads arrive, but get lost in chat, slow response (>30m), manual quoting
   (c) Operational Fulfillment: Overwhelmed delivery / team burnout / project delays / manual admin
   --> If (a): Terminate immediately with VERDICT: OUT_OF_SCOPE (Commercial Demand Constraint).
   --> If (b): Triage as IN_SCOPE (Conversion & Dispatch Plumbing).
   --> If (c): Triage as IN_SCOPE (Fulfillment & Delivery Plumbing).

3. [CHANGE CAPACITY GATE] Outcome of last workflow/tool change in past 12 months:
   (a) Adopted smoothly and maintained without escalations --> Score = 4-5
   (b) Sabotaged; staff reverted to legacy habits (WhatsApp/Excel) --> Score = 1-2
   (c) Adopted with friction; requires continuous management push --> Score = 3

4. [MASTER SYSTEM GATE] Primary system of record for operational truth:
   (a) Enterprise CRM / PSA (Salesforce, Certinia, HubSpot, Zoho)
   (b) Accounting ERP (1C, QuickBooks, Xero)
   (c) Spreadsheets and chat channels (Excel, Sheets, WhatsApp, Telegram)
   --> Determines Observability Baseline and integration boundaries.

5. [ARTIFACT READINESS GATE] Verifiable telemetry available for the audit:
   (a) 90-day anonymized CSV extract of logs/transactions/timesheets --> W_evidence = 1.0
   (b) Live 15-minute screen share of actual workflow --> W_evidence = 0.9
   (c) Verbal walkthrough only (no direct data access) --> W_evidence = 0.5 (Haircut enforced)

6. [HEADCOUNT MULTIPLIER] Core staff involved in the friction workflow:
   (a) 1–5 staff   (b) 6–20 staff   (c) 21–50 staff   (d) 50+ staff
   --> Establishes N_staff bounds for TDABC C_FTE calculation. Default: UNKNOWN.

7. [VOLUME RANGE] Monthly volume of core transactions/cases:
   (a) <50/mo   (b) 50–300/mo   (c) 300–1,500/mo   (d) 1,500+/mo
   --> Establishes transaction cycle frequency bounds.

8. [ECONOMIC SCALE BAND] Annual business revenue or monthly OpEx/Payroll scale:
   (a) < $250k / yr  (OpEx < $15k/mo)   --> Loaded Rate base: $15–$25/hr
   (b) $250k – $1M / yr (OpEx $15k–$60k/mo) --> Loaded Rate base: $25–$40/hr
   (c) $1M – $5M / yr   (OpEx $60k–$250k/mo) --> Loaded Rate base: $40–$75/hr
   (d) $5M+ / yr        (OpEx > $250k/mo)    --> Loaded Rate base: $75–$150/hr
   --> Default: UNKNOWN unless verified via Gate 8 or official registry.

9. [JTBD TRIGGER CATALYST] What specific operational event occurred in the past 90 days that forced you to seek an audit right now?
   [Single sentence prompt, e.g. "Hired 4th manager and dispatch failed", "Customer lost due to quoting delay", "Failed compliance check"]
```

---

## 2. Output Structure (`clients/<client-slug>/workaround-audit.md`)

```markdown
# Forensic Workaround & Margin Leak Audit (Pre-Interview Discovery Memo)

**Client:** [Client Name / Legal Entity]  
**Delivery Model:** Solo Productized Engineering Bureau (UnderUndre)  
**Date:** [ISO Timestamp]  
**Mode:** [SMB Operational Plumbing | B2B Services Delivery Economics]  
**Status:** PRE-INTERVIEW HYPOTHESIS REGISTER  
**Primary Suspected Constraint:** [SUSPECTED_CONSTRAINT_NAME] (UNVERIFIED)

---

## 1. Epistemic Horizon & Stakeholder Alignment
- **Economic Buyer (P&L Owner):** [Name, Title, Authority $5k+ Verified: YES/NO (From Gate 1)]
- **Process Sponsor:** [Name, Operational Title]
- **JTBD Trigger Catalyst (90-Day Push):** [Event recorded in Gate 9]
- **Observed Vector of Investment (OSINT Evidence):** [What open signals/vacancies prove regarding resource allocation]
- **Master System of Record:** [System identified in Gate 4]
- **Economic Scale Status:** [VERIFIED_FROM_GATE_8: Band X | UNKNOWN (Guessing Banned)]
- **Observability Status:** [TELEMETRY_DRIVEN | GUT_FEEL_BLINDSPOT | UNVERIFIED_PSA_GAP]
- **Change Capacity Score (1–5):** [Score based on Gate 3 & Section 1.2 Behavioral Rubric]
- **Political Sabotage & Friction Vectors:** [Who loses power, visibility, or overtime if this is automated?]
- **Primary Business Bottleneck (Goldratt TOC):** [CONVERSION_PLUMBING / FULFILLMENT (From Gate 2)]

*(If Primary Bottleneck is Demand Generation Deficit -> Terminate with Section 7: OUT_OF_SCOPE Verdict)*

---

## 2. Evidence Confidence Register & Hypothesis Tree

### Leading Hypothesis Tree
- **Core Hypothesis:** [e.g. Scope Underbidding in Fixed PODs]
  - *Sub-Hypothesis A:* [e.g. SOW understates integration complexity with Kafka]
  - *Sub-Hypothesis B:* [e.g. Client pushes out-of-scope changes as bug fixes]

| Friction Point / Finding | Direction Conf. (Existence) | Magnitude Conf. (Scale) | Primary Evidence (Level 1–5 & Source) | Epistemic Blindspot (Required Telemetry) |
| :--- | :---: | :---: | :--- | :--- |
| **[Candidate Clog 1]** | **XX%** | **YY%** | L4 (Job post) + L3 (Interview claim) | Anonymized CSV exports / system logs |
| **[Candidate Clog 2]** | **XX%** | **YY%** | L2 (Live screen shadow) | SOW vs. Billed actuals delta |

*(Note: Confidence >70% requires ≥2 independent sources. Confidence >90% requires L1/L2 telemetry).*

### Working Competing Hypotheses:
1. **Alt 0 (Healthy Growth Hypothesis):** [The observed friction or hiring burst is a healthy symptom of business expansion and practice scaling, not an operational failure].
2. **Alt 1:** [Operational hypothesis, e.g. Scope Underbidding]
3. **Alt 2:** [Capacity hypothesis, e.g. Bench Oscillation]
4. **Alt 3:** [Contractual hypothesis, e.g. Scope Ambiguity]
5. **Alt 4:** [Support leak hypothesis, e.g. Warranty Spillover]
6. **Alt 5 (Null Hypothesis - $H_0$):** [Operations running cleanly within demonstrated operational tolerance; no intervention required].

### Required Disconfirming Evidence Search:
> *Active search conducted to disprove the leading hypothesis:*  
> **[Document specific logs or questions probed to kill the hypothesis. If omitted, intervention_confidence is downgraded by one tier.]**

### Popperian Falsification Criteria:
> *The leading hypothesis ([NAME]) will be formally FALSIFIED if:*  
> **[Specific verifiable observation, e.g. "Anonymized timesheets show <5% non-billable hours logged across pods, or SOW variance is within demonstrated tolerance on last 10 milestones"].**

---

## 3. Cost of Workaround & Friction Ledger (Calibration Model)

> ⚠️ **EPISTEMIC DISCLAIMER:** This ledger is a **calibrated heuristic stress-test** based on verified scale data and Stage 0 ranges (mandatory evidence weights applied). Without primary database dumps, these figures do NOT constitute verified accounting data.

$$\text{CoW}_{\text{Lite}} = C_{\text{FTE}} + C_{\text{SaaS}} + C_{\text{Scrap}}$$

| Candidate Friction Point | Reported Burden | Evidence Level | Evidence Weight ($W$) | Loaded Rate | Stress-Test CoW | Epistemic Class |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **[Friction Point 1]** | X hrs/wk | Level 3 (Interview) | 0.5 (-50% haircut) | $XX / hr | **$ZZ,ZZZ / yr** | `[HEURISTIC_MODEL]` |
| **[Friction Point 2]** | Direct Cost | Level 1 (Receipts) | 1.0 (Face value) | Flat Fee | **$ZZ,ZZZ / yr** | `[VERIFIED]` |
| **TOTAL INDICATIVE GAP:** | — | — | — | — | **$ZZZ,ZZZ / yr** | `[UNVERIFIED_STRESS_TEST]` |

---

## 4. Pre-Mortem & Constraint Relocation Analysis

### 4.1. The Klein Pre-Mortem (Assuming Failure 6 Months Post-Delivery)
*Imagine this intervention completely failed by Month 6. The top 3 fatal failure vectors are:*
1. **Vector 1 (Political):** [e.g. Senior staff bypassed automated scheduling because it removed dispatch autonomy].
2. **Vector 2 (Operational):** [e.g. Telemetry was corrupted due to lack of enforcement; Goodhart's Law took over].
3. **Vector 3 (Sponsor):** [e.g. Economic Buyer lost interest after initial crisis passed; ownership evaporated].

### 4.2. Constraint Relocation Forecast (Goldratt Step 5)
- **Current Constraint Unblocked:** [e.g. Inbound lead quoting latency reduced from 24h to 5m].
- **Likely Next Constraint:** [e.g. Engineering onboarding capacity chokes; technician scheduling becomes the next hard bottleneck].
- **Mitigation Directive:** [Concrete guardrail to prevent blowing up the downstream pipe].

---

## 5. The Hierarchy of Interventions (Traversal Gate)

- **Reversibility Rating:** `[HIGH (Two-Way Door) | LOW (One-Way Door)]`  
  *(High reversibility permits action at ≥60% intervention confidence; Low reversibility strictly requires ≥90% confidence + L1 telemetry).*
- **Implementation Blindfold Check:**  
  *Query:* "Would the bureau recommend this intervention if legally forbidden from selling implementation work?"  
  *Result:* `[PASS (Unbiased) | FAIL (Audit Compromised)]`

### Level 0: Do Nothing (Status Quo)
- **Verdict:** [UNDER_EVALUATION / ACCEPTED / REJECTED]
- **Economic Reason:** [Contingent on validating Alt 5 (Null Hypothesis) or Alt 0 (Healthy Growth)].

### Level 1: Process / SOP Change ($0 CAPEX)
- **Zero-Software Solution:** [e.g. Focus Day Rule / Delegation Matrix / DoR checklist].
- **Enforceability:** [Can management enforce this based on Change Capacity Score?].
- **Verdict:** [RECOMMENDED AS PRIMARY DIAGNOSTIC ACTION / REJECTED]

### Level 2: Buy COTS SaaS
- **Candidate Tools Checked:** [Tool A ($X/mo), Tool B ($Y/mo)].
- **Verdict:** [RECOMMENDED / HOLD / REJECTED]

### Level 3: Deploy Sovereign Bypass (Sprint B / undreseller / Custom)
*(Evaluated ONLY if Levels 0–2 are non-viable, Change Capacity ≥ 4, Blindfold Check = PASS, and Economic Buyer is aligned)*
- **Target Constraint:** [Single core bottleneck].
- **Default Implementation Route:** [Тиражируемый шаблон `undreseller` (Modular Commerce & Booking Template) / Спринт А (FOSS Office) / Custom].
- **Verdict:** [RECOMMENDED / STRICTLY PROHIBITED]

### 5.1. Productization Opportunities (Product Discovery Lens)
*(Заполняется с позиции Product Discovery Lead: выявление процессов клиента, которые можно стандартизировать, упаковать и тиражировать без изобретения уникального кастомного софта)*
- **Стандартизируемые узлы:** [Какие повторяющиеся процессы клиента можно закрыть тиражируемым модулем (например, модульная запись/каталог/Staff-бот из `undreseller`, регламенты, чек-листы)?]
- **Тиражируемый артефакт:** [Готовый шаблон (`undreseller` FOSS / Modular Commerce) vs Конфигурация SaaS vs Кастомный форк].
- **Потенциал продуктовой масштабируемости:** [Является ли эта боль специфичной только для клиента, или это повторяющаяся системная проблема всего сегмента рынка?]

---

## 6. 🛑 AUTOMATION PROHIBITED LIST (VIA NEGATIVA)
> *Processes audited and explicitly banned from software implementation:*
- **[Process Name]:** [Reason: High political sabotage risk / Solved by $0 SOP / Low frequency / Episodic Fat-Tail].

---

## 7. Final Diagnostic Verdict

```yaml
verdict: LEVEL_0_DO_NOTHING | LEVEL_1_PROCESS_SOP | LEVEL_2_BUY_SAAS | LEVEL_3_BUILD_SPRINT | OUT_OF_SCOPE
primary_defect: UNVERIFIED | VERIFIED_CLOG
suspected_primary_constraint: [NAME_OF_CONSTRAINT]
null_hypothesis_active: true | false
growth_hypothesis_active: true | false
change_capacity_score: 1-5
economic_buyer_aligned: true | false
blindfold_check: PASS | FAIL (AUDIT_COMPROMISED)
evidence_class:
  - L1_TELEMETRY: false
  - L2_OBSERVED: true
  - L3_HEURISTIC: true
  - L4_OSINT: true
  - L5_MARKETING: false
reversibility: HIGH | LOW
direction_confidence: XX% (Capped at 60% if L4/L5 only; requires >=2 sources for >70%)
magnitude_confidence: YY% (Capped at 20% without L1/L2)
intervention_confidence: ZZ%
likely_next_constraint: "[Forecasted downstream bottleneck]"
falsification_criteria: "[Specific metric condition that disproves this verdict]"
pre_mortem_top_risk: "[Single greatest fatal failure vector from Section 4.1]"
recommended_immediate_action: "[Concrete 5-day step to test competing hypotheses and verify/falsify Null Hypothesis]"
```

---

---
description: Perform a forensic Workaround & Process-Friction Audit ($350–$490 Tripwire / Product 0). Quantifies annual manual bypass costs (TDABC Lite with time-haircut), verifies Economic Buyer authority, measures pain variance and change capacity, tests for OUT_OF_SCOPE constraints, and traverses the Hierarchy of Interventions.
handoffs:
  - label: Write Bypass Spec
    agent: speckit.specify
    prompt: Draft the technical specification for the single approved Level 3 (Build) intervention from this audit
    send: true
  - label: Review Workaround Audit
    agent: speckit.workaround-audit-review
    prompt: Independently verify the TDABC math, time evidence haircuts, buyer alignment, and Out-of-Scope triggers
---

## User Input

```text
$ARGUMENTS
```

Optional flags:

- `--client <slug>` — company/client directory (writes `clients/<slug>/workaround-audit.md`)
- `--full-dso` — enable Full mode with DSO capital lock (requires client-provided receivables & cost of debt)
- Free-form context: observed workarounds, tools, headcounts, reported times, stakeholder roles.

ultrathink
> "Худший аудитор — это тот, кто всегда находит повод продать свой софт, верит сотрудникам на слово про 'два часа рутины' и питчит проект менеджеру, у которого нет права подписать даже покупку канцтоваров. Настоящий цифровой сантехник сначала проверяет, есть ли вообще вода в трубе (Out-of-Scope), делит слова персонала на два, и прямо говорит собственнику: 'У вас проблема не в коде, а в регламенте за $0'." — Valera

## Goal

Generate a client-facing 3–5 page Forensic Workaround Diagnostic Memo for an SMB client ($350–$490 Product 0 Tripwire [HYPOTHESIS]).
Operate strictly as a solo practitioner wearing three explicit hats: **Diagnostic Auditor**, **Forensic Process Analyst**, and **Systems Architect**.

Key Mandates:

1. **Stakeholder Triad:** Identify the **Economic Buyer** (budget authority), **Process Sponsor** (day-to-day pain), and **End User** before evaluating solutions.
2. **Goldratt TOC Scope Gate:** If the primary business constraint is Market Demand / Sales Conversion (not Operational Plumbing), issue an official verdict: **`OUT_OF_SCOPE: COMMERCIAL_CONSTRAINT`**.
3. **Anti-TDAGU Time Haircut:** Apply an automatic **50% haircut** to unverified verbal time claims. Strong evidence requires recorded shadowing or system timestamps.
4. **Change Capacity:** Measure organizational change readiness based on the outcome of the last implemented process change.
5. **Hierarchy of Interventions:** Exhaust Level 0 (Do Nothing) and Level 1 (Process/SOP) before considering software.

---

## 1. Constitutional Operational Rules

1. **SOLO DELIVERY REALITY:**
   The bureau operates without corporate staffing theater. All roles (`Lead Diagnostic`, `Process Forensics`, `Technical Architecture`) are executed by the solo principal engineer. Deliverables reflect raw engineering truth, not billable-hour fluff.

2. **STAKEHOLDER TRIAD VERIFICATION:**
   An audit cannot recommend Level 2 (Buy) or Level 3 (Build) without identifying the Economic Buyer.
   - `Economic Buyer`: Has authority to sign $5,000+ checks without board approval.
   - `Process Sponsor`: Suffers daily from the clog; acts as internal champion.
   - `End User / Staff`: Operator whose daily routine is touched.

3. **EVIDENCE DISCIPLINE & TIME HAIRCUT (Anti-TDAGU):**
   - **Level 1 (Hard Telemetry):** Server logs, CSV exports, screen-recorded time logs -> 100% face value.
   - **Level 2 (Observed Shadowing):** Direct 15-minute live screen observation -> 90% face value.
   - **Level 3 (Verbal Interview Claim):** "Takes me 30 mins per case" -> **Apply mandatory 50% haircut** (counted as 15 mins) to account for recall bias and idle time.

4. **THE OUT-OF-SCOPE EXIT VALVE:**
   If the business bottleneck is lack of leads, low sales closing rates, or broken product-market fit, software automation is contraindicated. The audit MUST terminate with:
   `VERDICT: OUT_OF_SCOPE (TOC: Demand / Revenue Bottleneck)`.

5. **CHANGE CAPACITY RATING:**
   Probe: *"What was the last process or tool change implemented in the past 12 months? Who resisted, and how long did full adoption take?"*
   - Score $\le 2/5$: High organizational friction. Level 3 (Build) is STRICTLY PROHIBITED; recommend Level 1 (SOP) only.

---

## 2. Calculation Pipeline (TDABC Lite v2)

$$\text{CoW}_{\text{Lite}} = C_{\text{FTE}} + C_{\text{SaaS}} + C_{\text{Scrap}}$$

Where:
$$C_{\text{FTE}} = \sum \left( \text{Reported Hours} \times \text{Evidence Haircut} \times \text{Loaded Hourly Rate} \times 52 \right)$$

- Haircut: `1.0` for timestamped logs; `0.5` for verbal interview claims.
- Loaded Hourly Rate: Base gross salary + 20–30% local taxes/benefits `[VERIFIED / ESTIMATED]`.

---

## 3. Output Structure (`clients/<client-slug>/workaround-audit.md`)

```markdown
# Forensic Workaround & Process-Friction Audit
**Client:** [Client Name / Legal Entity]  
**Delivery Model:** Solo Productized Engineering Bureau (UnderUndre)  
**Date:** [ISO Timestamp]  
**Primary Finding:** [Level 0: Do Nothing | Level 1: Process SOP | Level 2: Buy SaaS | Level 3: Build Custom | OUT_OF_SCOPE]

---

## 1. Stakeholder & Organizational Alignment
- **Economic Buyer (P&L Owner):** [Name, Title, Authority Verified: YES/NO]
- **Process Sponsor:** [Name, Operational Title]
- **Change Capacity Score (1–5):** [Score based on historical change friction]
- **Primary Business Bottleneck (Goldratt TOC):** [Operations / Fulfillment OR Marketing / Sales Demand]

*(If Primary Bottleneck is Marketing/Demand -> Jump directly to Section 5: OUT_OF_SCOPE Verdict)*

---

## 2. Cost of Workaround Ledger (TDABC Lite with Haircut)

| Workaround / Leak | Reported Time | Evidence Quality | Discounted Time | Loaded Rate | Annual CoW | Class |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [e.g. Manual Booking] | 20 hrs/wk | Verbal (Level 3) | 10 hrs/wk (-50%) | $20 / hr | **$10,400 / yr**| `[HEURISTIC]` |
| [e.g. Broken Tool Dupl.]| Direct Cost | Invoice (Level 1) | N/A | Flat Fee | **$2,400 / yr** | `[VERIFIED]` |

---

## 3. The Hierarchy of Interventions (Traversal Gate)

### Level 0: Do Nothing (Status Quo)
- **Verdict:** [ACCEPTED / REJECTED]
- **Economic Reason:** [CoW threshold vs operational risk].

### Level 1: Process / SOP Change ($0 CAPEX)
- **Zero-Software Solution:** [e.g. Delegation Matrix: staff approves up to 1,500 AED without Owner].
- **Feasibility:** [Can management enforce this? If Change Capacity < 3, why will software be better?]
- **Verdict:** [RECOMMENDED AS PRIMARY / REJECTED (Unenforceable)]

### Level 2: Buy COTS SaaS
- **Candidate Tools Checked:** [Tool A ($X/mo), Tool B ($Y/mo)].
- **Why it Solves / Why it Fails:** [Data sovereignty, rigid FSM, seat taxes].
- **Verdict:** [RECOMMENDED / REJECTED]

### Level 3: Deploy Sovereign Bypass (Sprint B)
*(Evaluated ONLY if Levels 0–2 are documented as non-viable and Economic Buyer is aligned)*
- **Verdict:** [RECOMMENDED / REJECTED]
- **Target Constraint:** [Single core bottleneck].

---

## 4. 🛑 AUTOMATION PROHIBITED LIST (VIA NEGATIVA)
> *Processes audited and explicitly banned from software implementation:*
- **[Process Name]:** [Reason: Low frequency / High political sabotage risk / Solved by SOP].

---

## 5. Final Diagnostic Verdict

```yaml
verdict: LEVEL_0_DO_NOTHING | LEVEL_1_PROCESS_SOP | LEVEL_2_BUY_SAAS | LEVEL_3_BUILD_SPRINT | OUT_OF_SCOPE
primary_bottleneck: OPERATIONS | DEMAND_GENERATION | SALES_CLOSING
change_capacity_score: 1-5
economic_buyer_aligned: true | false
recommended_immediate_action: "[Concrete step for Days 1-7]"
```

---

### ЧАСТЬ 2: ОБНОВЛЕНИЕ РЕВЬЮ-КОМАНДЫ `speckit.workaround-audit-review.md`

Добавляем в контрольный манометр новые линзы: проверку покупателя, проверку дисконта времени (Anti-TDAGU) и проверку Out-of-Scope:

```markdown


### ЧАСТЬ 3: ЧТО МЕНЯЕТСЯ В БИЗНЕС-ПЛАНЕ И КОНСТИТУЦИИ

#### 1. В `undreseller-business-plan.md` (Бамп до v20.1):
* **§2. Продукт 0 (Workaround TCO Audit):**
  * Добавляется **Anti-TDAGU Haircut Law:** *«Все устные оценки времени сотрудников при расчёте CoW делятся на 2 (дисконт 50%). Расчёт по полной ставке допускается только при предоставлении серверных логов или видеозаписи процесса»*.
  * Добавляется **Out-of-Scope Exit:** *«Если экспресс-диагностика показывает, что у клиента пустая воронка продаж или конверсия в сделку < 1%, аудит закрывается вердиктом OUT_OF_SCOPE. Мы не автоматизируем хаос и не строим букинг там, где некому записываться»*.
  * Добавляется **Solo Delivery Reality:** *«UnderUndre позиционируется честно: Productized Solo Engineering Bureau. Один фаундер в трёх ролях (Diagnostic, Forensics, Systems Architecture). Никакого корпоративного надувания щёк»*.
* **§0.1 Assumption Register:**
  * Добавляется гипотеза: `Out-of-Scope Frequency: 15–20% аудитов завершаются без предложения софта [HYPOTHESIS]`.

#### 2. В `constitution.md`:
* Конституция **v1.9.0** в текущем виде держит оборону идеально. 
* Принцип **VII-B (Business Plan Stage)** и Принцип **XIII (Sovereign Capacity & Productization)** уже запрещают брать задачи без проверки мощности и ассетов.
* Единственное точечное микро-уточнение (v1.9.1): в **Принцип VII-B.3** зафиксировать норму Goldratt TOC:  
  *«Product/agency work MUST NOT propose operational software automation if the primary constraint of the commercial unit is top-of-funnel demand generation (Out-of-Scope TOC Valve)»*.

---

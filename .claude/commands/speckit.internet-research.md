---
description: Run an autonomous OSINT & forensic web research workflow based on the master forensic prompt template (Via Negativa, Dorking Engine, Bayesian Base Rate, Citation Grounding).
handoffs:
  - label: Create/Update Business Plan
    agent: speckit.business-plan
    prompt: Update business plan with research findings
  - label: Build Feature Spec
    agent: speckit.specify
    prompt: Create spec based on research findings
---

# /internet-research

Execute a rigorous, adversarial OSINT and forensic internet research pipeline

## User Input

```text
$ARGUMENTS
```

ultrathink

> "Без бумажки — ты какашка, а без сырых данных Level 1 — твои слова просто воздух." — Valera (Digital Plumber & OSINT Investigator)

---

## 🛠️ ARCHITECTURAL PRINCIPLE: SUBTRACTIVE EPISTEMOLOGY & ZERO-TRUST

You **MUST** approach the user input `$ARGUMENTS` in **Zero-Trust Forensic Mode**:

- **Presumption of Falsification**: Every claim by vendors, founders, media, or marketers is assumed FALSE until proven by Level 1 raw data, verifiable code, court records, or independent blind trials.
- **Anti-Sycophancy**: Never agree with flawed user premises. If the user's premise violates physics, Big-O limits, or Bayesian base rates — explicitly uncover and refute it.
- **Via Negativa**: True knowledge progresses by eliminating false hypotheses and identifying hard counterexamples.

---

## 📊 DATA SANITIZATION PYRAMID (PIPELINE GATING)

1. **LEVEL 1 (RAW TRUTH / ТВЕРДЬ)**:
   - Source code, commits, PRs, issue trackers (GitHub, GitLab).
   - Official regulatory registries (SEC EDGAR, PACER, Companies House, ЕГРЮЛ, WIPO/USPTO patents).
   - Peer-reviewed RCT papers and Cochrane systematic reviews with valid DOIs.
   - Raw memory dumps, PCAP network captures, hardware datasheets, CVE databases (NVD NIST).
2. **LEVEL 2 (SECONDARY TECHNICAL DATA)**:
   - Official technical specs (RFC, ISO, IEEE, W3C).
   - Whitepapers with explicit math/proofs.
   - Verified post-mortems with raw log snippets.
3. **LEVEL 3 (NOISE / ИНФОРМАЦИОННЫЙ ШУМ)**:
   - News, Tech media, corporate blogs, Telegram channels, marketing benchmarks, PR releases.
   - **GUARDRAIL**: Using Level 3 data as proof is STRICTLY FORBIDDEN. Mark any Level 3 citations as `[UNRELIABLE: LEVEL 3]`.

---

## 🔄 EXECUTION PIPELINE

Given the input `$ARGUMENTS`, execute the following 5 steps:

### STEP 1: FIRST-PRINCIPLES DECOMPOSITION

1. Deconstruct the query into fundamental physical, mathematical, algorithmic, or economic bounds.
2. Determine theoretical limits: Landauer's principle, Shannon capacity, speed of light in fiber ($c_{\text{glass}} \approx 200,000\text{ km/s}$), Big-O complexity, CAP/PACELC theorems, No-Arbitrage conditions.
3. Establish boundary conditions where claims violate physical or logical laws.

### STEP 2: SUBTRACTIVE DORKING ENGINE

Execute targeted web searches using structured Google Dorks. Avoid deprecated operators (`cache:`, `related:`).

Generate and run 3 vectors of adversarial queries:

- **Vector 1 (Level 1 Registries & Raw Data)**:
  `site:<registry> "<topic>" ("lawsuit" | "enforcement" | "fraud" | "cve") -promo`
  `("<topic>") (filetype:pdf | filetype:log | filetype:json) ("benchmark" | "raw data")`
  `(site:github.com | site:gitlab.com) ("<topic>") ("vulnerability" | "memory leak" | "deadlock")`
- **Vector 2 (Level 2 Standards & Post-mortems)**:
  `("<topic>") (filetype:pdf) intitle:("specification" | "whitepaper" | "architecture")`
  `("<topic>") ("post-mortem" | "root cause" | "failure analysis")`
- **Vector 3 (Sanans Filter)**:
  Apply negative exclusions: `-site:medium.com -site:habr.com -inurl:pricing -inurl:press-release`

### STEP 3: VIA NEGATIVE SCAM & FRAUD DETECTION

Audit all retrieved claims against 4 red-flag markers:

1. **Urgency (FOMO)**: Artificial countdowns, pressure to act before a deadline.
2. **Non-falsifiability**: Hypotheses structured to prevent empirical refutation (Popper's criterion).
3. **Anonymous Authority**: "Leading experts prove", "insiders confirm" without names/DOIs/case numbers.
4. **Asymmetric Yield ("Free Lunch")**: Claims of 10x gains with zero effort or risk.
   _If ANY marker is triggered, immediately flag as `[HIGH SCAM RISK]` and downgrade confidence._

### STEP 4: BAYESIAN BASE RATE CALIBRATION

Calculate posterior probability:
$$P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}$$

- **Base Rate $P(A)$**: What is the historical baseline success rate in this domain? (e.g., 5% for early startups, 0.4% for Alzheimer's drug candidates).
- **Evidence Strength $P(B|A)$**: Are claims backed by Level 1 primary data or vendor PR?
- **Conclusion**: If $P(A)$ is near-zero and evidence is vendor-only, posterior probability $P(A|B) \to 0$.

### STEP 5: FORENSIC AUDIT TABLE & FINAL VERDICT

Format final report as a structured Markdown table:

| Claim | First-Principles Limit | Verification Status           | Source Level    | Identifier (DOI / Case / Commit / URL) |
| :---- | :--------------------- | :---------------------------- | :-------------- | :------------------------------------- |
| ...   | ...                    | Verified / Refuted / Unproven | Level 1 / 2 / 3 | ...                                    |

**FINAL FORENSIC VERDICT**:

- **Expert Status**: `[VIABLE / TECHNICALLY FLAWED / SCAM / INSUFFICIENT DATA]`
- **Bayesian Confidence**: `[Percentage]`
- **Critical Failure Mode / Counterexample**: `[Single killer contradiction]`

---

## 🚨 ABSOLUTE GUARDRAILS

1. **NO SYNTHETIC CITATIONS**: Never invent DOIs, URLs, GitHub commits, or court case numbers. If not found in primary output, write `[IDENTIFIER NOT FOUND]`.
2. **CITATION GROUNDING**: Every claim must be tied to a verified Level 1 or Level 2 artifact.
3. **MARK LEVEL 3**: Any quotation from media or blogs MUST be marked `[UNRELIABLE: LEVEL 3]`.

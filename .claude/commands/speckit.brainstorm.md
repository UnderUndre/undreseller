---
description: Zero-Trust Architectural Exploration — generates orthogonal options with Pre-Mortem analysis and reversibility costs before committing.
---

# /brainstorm — Explore Options

$ARGUMENTS

ultrathink

> "Обрисуй ситуацию. Обрисуй персонажей." — Valera wants context first.
> "Тема мутная, надо покачать." — When the request is vague, state assumptions and show the boring path first.
> "Пока не доказано — не ебёт что сказано." — Reject buzzwords without operational trade-offs.

## Behavior

This command invokes the **`brainstorming` skill in `zero-trust explore` mode**.
It balances divergent exploration with strict engineering realism (Via Negativa).

### Rules

1. **Adaptive Socratic Gate (No Deadlocks)**:
   - If constraints are missing, do NOT just halt. State explicit **Baseline Assumptions** (e.g., scale, SLA, existing stack) and proceed, while listing the 2–3 questions that could alter the decision.
2. **Orthogonal Options (Must include Option 0)**:
   - **Option 0 (The Boring / In-Situ Choice)**: Dan McKinley’s "Choose Boring Technology". Simplest implementation using existing stack/monolith/Postgres/stdlib. No new dependencies.
   - **Option 1 (Mainstream Modern)**: Standard industry solution for this architectural boundary.
   - **Option 2 (Structural Divergence)**: Radically different paradigm (e.g., event-driven vs polling, client-side vs worker-offloaded, compile-time vs runtime), NOT toy tech.
3. **Via Negativa & Pre-Mortem (No Fake Cons)**:
   - For every option, identify the **Day-2 Nightmare**: How does it fail in production under pressure? (Data loss, deadlock, vendor pricing spike, migration trap).
   - Evaluate **Reversibility (Type 1 vs Type 2)**: Is it a one-way door (hard to migrate off) or a two-way door (trivial to replace)?
4. **Conditional Recommendation Matrix**:
   - Never recommend blindly. Provide:
     - _Pick Option X if optimizing for:_ [e.g., Time-to-Market / Zero Ops]
     - _Pick Option Y if optimizing for:_ [e.g., P99 Latency / Strict Consistency]
     - _Valera's Pragmatic Pick:_ The default choice with the lowest regret score.
5. **Architectural Guardrails**:
   - Zero code snippets. Focus purely on data contracts, state boundaries, operational complexity, and failure modes.

---

### Output format

```markdown
## 🧠 Brainstorm: [Topic]

### Context & Baseline Assumptions

- **Understood Goal:** [1–2 sentences]
- **Assumed Constraints:** [Scale, latency, stack assumptions used for this analysis]
- **Clarification Vectors:** [Optional: 2–3 questions that would change the trade-offs if assumptions are wrong]

---

### Option 0: [Name] (The Boring / Zero-New-Deps Choice)

_Dan McKinley Principle — solve with existing tools._

- **Mechanism:** [Brief explanation]
- ✅ **Pros:** [Simplicity, known failure modes]
- ❌ **Day-2 Nightmare (Pre-Mortem):** [Where it breaks at scale or under edge cases]
- 🔄 **Reversibility:** Low Risk (Two-way door) | High Risk (One-way door)
- 📊 **Cognitive & Ops Overhead:** Low | Medium | High

### Option 1: [Name] (Mainstream Pattern)

- **Mechanism:** [Brief explanation]
- ✅ **Pros:** […]
- ❌ **Day-2 Nightmare (Pre-Mortem):** […]
- 🔄 **Reversibility:** Low Risk | High Risk
- 📊 **Cognitive & Ops Overhead:** Low | Medium | High

### Option 2: [Name] (Structural Alternative)

- **Mechanism:** [Radical paradigm shift]
- ✅ **Pros:** […]
- ❌ **Day-2 Nightmare (Pre-Mortem):** […]
- 🔄 **Reversibility:** Low Risk | High Risk
- 📊 **Cognitive & Ops Overhead:** Low | Medium | High

---

## ⚖️ Trade-off Decision Matrix

| Option                  | Primary Strength  | Fatal Weakness      | Best Fit When...    |
| :---------------------- | :---------------- | :------------------ | :------------------ |
| **Opt 0 (Boring)**      | Zero tech debt    | Scale ceiling       | Speed & MVP first   |
| **Opt 1 (Mainstream)**  | Ecosystem support | Ops footprint       | Standard team scale |
| **Opt 2 (Alternative)** | High performance  | High cognitive load | Specific bottleneck |

---

## 💡 Recommendation

- **If you optimize for [Criterion A]:** Go with **Option [X]**.
- **If you optimize for [Criterion B]:** Go with **Option [Y]**.
- **Valera's Pragmatic Pick:** **Option [X]** because _[lowest operational regret / least unforced errors]_.

**Which direction fits your constraints, or what assumptions do we need to adjust?**
```

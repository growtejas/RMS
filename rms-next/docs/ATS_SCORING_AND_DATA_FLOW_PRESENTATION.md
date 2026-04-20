# ATS scoring and data flow — presentation deck

**Audience:** technical review, internal demo, architecture validation  
**Scope:** scoring mechanics and data flow only (no code or file references)

---

## Slide 1 — ATS scoring overview

**Title:** What is ATS scoring, and why do we need it?

- **ATS scoring** ranks and prioritizes candidates against a role using structured signals—not a single keyword count.
- It supports **fairer triage**: multiple dimensions (fit, rules, context) reduce over-reliance on one noisy input.
- **Traditional keyword-only ATS** misses synonyms, context, and pipeline reality; scores are hard to defend in review.
- **Bias and opacity** grow when users cannot see *why* someone ranked high or low.
- This design uses **layered scores** so results stay explainable and tunable over time.

**Diagram — why “one number” is not enough:**

```
Keyword-only          Layered ATS scoring
─────────────         ─────────────────────
Resume text    →      Ingest → Parse → Structure
     ↓                      ↓
Match %        →      Phase 5 + Rules + (optional) AI
     ↓                      ↓
Opaque rank    →      Score + reasons + weights
```

**Example:** Two candidates both mention “React.” One led a production migration; the other listed it once. Layered scoring separates **term overlap**, **meaning fit**, **pipeline stage**, and **rule checks** instead of treating both as equal.

---

## Slide 2 — Data flow overview (high level)

**Title:** End-to-end path from candidate input to final score

- Every candidate enters through **ingestion** (applications, uploads, or internal entry).
- **Parsing** turns documents into text and extracted fields.
- **Structured data** normalizes skills and facts for consistent comparison.
- **Ranking (Phase 5)** combines keyword, semantic, and business signals.
- **ATS V1** applies deterministic business rules (experience, notice, education, seniority).
- **AI evaluation** (optional) adds narrative dimensions; results **blend** with the deterministic score when enabled.

**Diagram:**

```
Resume / Candidate Input
        ↓
   Ingestion Layer
        ↓
   Parsing Layer
        ↓
   Structured Data Layer
        ↓
   Ranking Engine (Phase 5)
        ↓
   ATS V1 (Business Rules)
        ↓
   AI Evaluation Layer  (optional)
        ↓
   Final Score (+ explanation)
```

**Example:** A public applicant uploads a PDF; the same path applies if a recruiter attaches a resume manually—the downstream stages stay identical.

---

## Slide 3 — Ingestion layer

**Title:** Where data enters the system

- **Sources:** public job apply flows, manual recruiter entry; external networks (e.g. LinkedIn) can follow the same pattern when integrated.
- **Resume uploads** land in **object storage** (cloud or local), with a stable reference on the candidate or application record.
- **Inbound events** capture a **raw payload** (who applied, when, and what was submitted) for traceability and replays.
- This layer does **not** score; it **persists** and **hands off** to parsing.

**Diagram:**

```
Apply / upload / API
        ↓
   Store file  ──────────→  blob storage (URI)
        ↓
   Record event ─────────→  inbound_events (raw snapshot)
        ↓
   Trigger parse pipeline
```

**Example:** Candidate applies with `resume.pdf` → file stored at `s3://…/resume.pdf` → event row records submission metadata for auditing.

---

## Slide 4 — Parsing layer

**Title:** From files and text to extracted facts

- Resumes become **plain text** (and optionally structured sections) for downstream use.
- Extracted **skills** feed keyword and semantic comparisons.
- **Experience** (roles, dates) supports years-of-experience and seniority signals.
- **Projects** and **education** enrich ATS rules and optional AI context.

**Diagram:**

```
PDF / DOCX / paste
        ↓
   Text extraction
        ↓
   Field extraction  ──→  skills, experience, projects, education
```

**Example — raw line vs parsed:**

Raw (snippet):  
`"Worked on React, AWS EC2, built healthcare app"`

Parsed (illustrative):

```
skills:        ["react", "aws ec2"]
projects:      ["healthcare app"]
experience_years: 3    ← from career history, not this sentence alone
```

---

## Slide 5 — Structured data layer

**Title:** Normalize, clean, and store comparable facts

- **Skills** are normalized (aliases, casing, punctuation) so “React.js” and “react” match reliably.
- **Inconsistent or partial** data is cleaned or flagged; gaps affect confidence and rule outcomes—not silent wrong matches.
- A **structured profile** (JSON-shaped facts) is stored for ranking, reporting, and optional AI payloads.
- **Raw text** alone is hard to score fairly; **structured data** enables repeatable comparisons.

**Diagram:**

```
messy text / duplicates          structured profile
───────────────────────        ───────────────────
"JS, javascript, ReactJS"   →    skills: ["javascript", "react"]
random headings             →    experience[], education[]
```

| Raw text (weak) | Structured data (strong) |
|-----------------|---------------------------|
| Unstable matching | Consistent tokens |
| Hidden gaps | Explicit missing fields |
| One-off strings | Versioned, testable transforms |

**Example:** Candidate types “Mgr” in one place and “Manager” in another → normalized to one job level for seniority alignment.

---

## Slide 6 — Phase 5 scoring (core ranking engine)

**Title:** Three pillars — keyword, semantic, business

- **Keyword score (~40%)** — overlap between **required / JD terms** and **candidate terms** (term-level matching).
- **Semantic score (~25%)** — **embeddings / meaning similarity** between job text and candidate text so synonyms and paraphrases count.
- **Business score (~35%)** — **pipeline stage**, **interview outcomes** (pass / fail / hold), and light **profile completeness** signals—not JD fit (that lives in keyword/semantic/ATS).

**Formula (default weights):**

```
Phase5 Score =
  0.40 × keyword +
  0.25 × semantic +
  0.35 × business
```

**Diagram:**

```
JD text + required terms          Candidate text + stage
           \                            /
            →  Keyword  ──┐
            →  Semantic ──┼→  Phase5 (0–100)
            →  Business ──┘
```

**Example:** Strong interview passes and late-stage status **raise business**; a thin keyword match still limits the overall Phase 5 score.

---

## Slide 7 — ATS V1 scoring (rule engine)

**Title:** Deterministic rules on top of text fit

- **Experience match** — candidate years vs role requirement.
- **Notice period** — availability vs hiring urgency.
- **Education** — meets stated requirement where configured.
- **Seniority** — alignment between job level and inferred candidate level.
- Optional **skills alignment** can tighten the score when structured required skills exist on the requisition.

**Diagram:**

```
Signals: exp, notice, education, seniority (+ skills alignment if present)
                              ↓
                    ATS V1 score (0–100)
```

**Example:**

| Field | Candidate | Job |
|-------|-----------|-----|
| Experience | 2 years | 3 years required |
| Notice | 30 days | — |

**ATS V1** might land around **60** — moderate fit: below target experience pulls the score; notice is acceptable. (Illustrative; exact value depends on configured weights and data completeness.)

---

## Slide 8 — Hybrid deterministic score

**Title:** Combining Phase 5 with ATS V1

- **Phase 5** captures text fit + pipeline context.
- **ATS V1** captures **policy-like** constraints (experience, notice, education, seniority).
- **Hybrid mode** blends both so neither dominates by accident.

**Formula (default):**

```
Final Deterministic Score =
  0.65 × Phase5 +
  0.35 × ATS V1
```

*(Configurable in deployment; defaults shown here.)*

**Example:**

- Phase5 = **70**  
- ATS V1 = **50**

```
Final deterministic = 0.65 × 70 + 0.35 × 50 = 45.5 + 17.5 = 63
```

---

## Slide 9 — AI evaluation layer

**Title:** Optional LLM layer — judgment on top of facts

- Evaluates **project complexity**, **growth trajectory**, **company reputation**, and **JD alignment** (each 0–100).
- Outputs also include **confidence** and short **risks** for reviewer judgment.
- Runs **after** deterministic ranking is defined; it **augments** display scores when cached evaluation exists and blending is on.

**Composite AI score:**

```
AI Score =
  0.30 × project_complexity +
  0.25 × growth_trajectory +
  0.15 × company_reputation +
  0.30 × jd_alignment
```

**Diagram:**

```
Normalized job + candidate summary
              ↓
         LLM (structured JSON)
              ↓
   dimensions + confidence → ai_score (0–100)
```

**Example:** Strong projects but weak JD alignment → several dimensions mid-range; confidence drives how much the UI trusts the AI portion.

---

## Slide 10 — Final score blending (deterministic + AI)

**Title:** How the UI score mixes rule-based and AI scores

- Start from the **deterministic** score (Phase 5 [+ ATS V1 hybrid] [+ skill adjustments] as configured).
- Blend in **AI score** using weight **w** derived from **model confidence**.

**Formula:**

```
Final Score = (1 − w) × deterministic + w × AI_score
```

**Weight rule:**

- If **confidence ≥ 0.5** → **w = 0.30**
- Else → **w = 0.10**  
- If no AI evaluation applies → **w = 0** (deterministic only)

**Example:**

- Deterministic = **70**  
- AI = **47.5**  
- Confidence high → **w = 0.3**

```
Final = 0.7 × 70 + 0.3 × 47.5 = 49 + 14.25 = 63.25
```

---

## Slide 11 — End-to-end example (full journey)

**Title:** One candidate — from resume snippet to final score

**Step 1 — Resume input (snippet)**

```
Skills: React, AWS
Experience: 2 years
Projects: Healthcare app
```

**Step 2 — Parsed / structured**

```
skills = ["react", "aws"]
experience_years = 2
projects = ["healthcare app"]
```

**Step 3 — Phase 5**

| Pillar | Score |
|--------|------:|
| Keyword | 70 |
| Semantic | 60 |
| Business | ~58.3 |

```
Phase5 = 0.40×70 + 0.25×60 + 0.35×58.3 ≈ 63.4
```

**Step 4 — ATS V1** → **50** (illustrative: e.g. experience gap vs requirement)

**Step 5 — Deterministic hybrid**

```
= 0.65 × 63.4 + 0.35 × 50 ≈ 58.7
```

**Step 6 — AI score** → **47.5** (with confidence ≥ 0.5)

**Step 7 — Final blended score**

```
= 0.70 × 58.7 + 0.30 × 47.5 ≈ 55.34
```

**Diagram (journey):**

```
Snippet → Parse → Phase5 → ATS V1 → Hybrid → AI → Final
```

---

## Slide 12 — Data flow (detailed)

**Title:** Detailed pipeline for scoring

- **Resume** enters ingestion and storage.
- **Parser** produces text and extracted fields.
- **Structured profile** feeds keyword + semantic engines and ATS signals.
- **Business logic** (stage, interviews, profile bonuses) feeds Phase 5.
- **ATS rules** apply on structured signals.
- **AI evaluation** optionally enriches the ranked list.
- Output: **final score** plus **human-readable reasons** for review.

**Diagram:**

```
Resume
  ↓
Parser
  ↓
Structured Profile
  ↓
Keyword + Semantic Engine
  ↓
Business Logic (stage / interviews / profile)
  ↓        \
  ↓         → Phase 5 composite
ATS Rules  /
  ↓
Deterministic hybrid (Phase 5 + ATS V1)
  ↓
AI Evaluation (optional)
  ↓
Final Score + Explanation
```

**Example:** Reviewers see both “semantic fit” and “experience vs requirement” called out in the same row.

---

## Slide 13 — Edge cases

**Title:** What happens when data is missing or messy?

- **Missing experience** — ATS V1 may apply **partial-data** handling; scores are damped, not guessed as “perfect.”
- **Bad skill parsing** — keyword match drops; semantic may partially recover; normalization reduces duplicate-token noise.
- **Empty or thin JD** — required-term extraction may be weak; semantic still uses available text; operations should enrich JD for stable ranking.
- **Duplicate resumes** — deduplication and caching avoid double-counting the same person; latest structured profile wins for scoring.
- **Very low required-skill match** — a **skill gate** can reduce the deterministic score when structured requirements exist but the match is thin.

**Diagram:**

```
gap detected  →  flag + penalty / clamp  →  visible in explanation
```

**Example:** No graduation field → education dimension flagged; score moves conservatively instead of assuming a degree.

---

## Slide 14 — Final takeaways

**Title:** Principles for stakeholders

- Scoring is **layered**, not a single black-box number—each layer has a clear job.
- The system is **deterministic-first**; **AI** is an optional, confidence-weighted overlay.
- **Explainability** is a first-class output: reasons travel with the score for demos and audits.
- **Data quality upstream** (JD completeness, parsing quality, deduplication) directly drives ranking stability.
- Tuning **weights** shifts behavior without rewriting the whole pipeline—useful for pilots and enterprise policy.

**Diagram:**

```
Quality in  →  Clear layers  →  Explainable score out
```

**Example:** Improving the JD text and required skills often lifts keyword and semantic scores faster than tweaking AI prompts alone.

---

## Appendix — slide count

| # | Section |
|---|---------|
| 1 | ATS scoring overview |
| 2 | Data flow (high level) |
| 3 | Ingestion |
| 4 | Parsing |
| 5 | Structured data |
| 6 | Phase 5 |
| 7 | ATS V1 |
| 8 | Hybrid deterministic |
| 9 | AI evaluation |
| 10 | Final blending |
| 11 | End-to-end example |
| 12 | Detailed data flow |
| 13 | Edge cases |
| 14 | Takeaways |

**Total: 14 slides** (within the 12–15 target).

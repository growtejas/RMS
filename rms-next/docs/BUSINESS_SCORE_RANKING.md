# Business score (ranking)

The **business score** is one of three inputs to the **Phase 5** composite (with keyword and semantic). It reflects **pipeline stage**, **interview outcomes**, and a few **light resume/contact signals**—not JD fit or skills (those live in keyword, semantic, ATS V1, and the skill gate).

**Implementation:** [`src/lib/services/ranking-service.ts`](../src/lib/services/ranking-service.ts) (`stageBaseScore`, then adjustments in `buildRankingForRequisitionItem`).

---

## 1. Stage base (0–100 scale, before modifiers)

| `current_stage` | Base score |
|-----------------|------------|
| Hired           | 95         |
| Offered         | 85         |
| Interviewing    | 75         |
| Shortlisted     | 65         |
| Sourced         | 50         |
| Rejected        | 10         |
| *(anything else)* | 45      |

Stage comes from the **`candidates.current_stage`** value for that row.

---

## 2. Interview adjustments

Uses **`interviews`** rows for the candidate (`result` field):

| Outcome | Effect (per interview) | Cap / note |
|---------|------------------------|------------|
| **Pass**  | **+8**  | Total pass bonus capped at **+16** (`min(passCount × 8, 16)`) |
| **Fail**  | **−12** | No cap in code (can pull score down hard) |
| **Hold**  | **+2**  | Per hold |

Scheduled or incomplete rounds without a Pass/Fail/Hold result do not contribute.

---

## 3. Small profile bonuses

| Condition | Bonus |
|-----------|------:|
| `phone` present | +2 |
| `resume_path` present | +4 |
| `current_company` present | +3 |

These are **boolean checks** on the candidate record (non-empty after normal DB shape).

---

## 4. Final business score

1. Start at **stage base**.
2. Add/subtract **interview** deltas.
3. Add **phone / resume / company** bonuses.
4. **Clamp** to **0–100** (`clamp(businessScore)`).

The value returned in ranking JSON is `score.business_score` (same number, rounded for display where applicable).

---

## 5. How it enters the overall rank score

Phase 5 composite (before hybrid / ATS V1 / skill gate):

```text
phase5Final = keywordScore × RANKING_KEYWORD_WEIGHT
            + semanticScore × RANKING_SEMANTIC_WEIGHT
            + businessScore × RANKING_BUSINESS_WEIGHT
```

Defaults (see `.env.example`): keyword **0.40**, semantic **0.25**, business **0.35**.

So business is **not** the majority alone, but at default weights it is the **largest single pillar** of Phase 5.

---

## 6. Why many “Sourced” profiles look identical

Example: **Sourced (50)** + phone (+2) + resume (+4), no company, no interviews → **56** for everyone in that situation. Differentiation then comes from **keyword**, **semantic**, **ATS V1** (hybrid), and the **skill gate**—not from business unless stage, interviews, or profile fields differ.

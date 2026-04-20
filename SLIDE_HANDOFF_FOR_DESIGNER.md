# Slide deck handoff — Phase 2 checkpoint (for designer)

**From:** Rahul — House Flipper Scouts / NY county ZHVI project  
**What to use:** This document for **on-slide text and numbers**. Pair it with the **image files** in `slide_assets/` (project root).

**Share as a bundle:**

- This file: `SLIDE_HANDOFF_FOR_DESIGNER.md`
- Folder: `slide_assets/` — `top_counties_predicted_growth.png`, `ny_counties_predicted_growth_map.png`, optional `roi_summary.txt`

**Aligning numbers with code:** Metrics in **Slide 1** match the **last executed** `02_merge_and_model.ipynb` (section 5: linear baselines; section 6: tuned nonlinear models). **Slide 4** uses the **tuned XGBoost** holdout MAE from that same run. If `model_dataset.csv` was not saved after retraining, `roi_summary.txt` may still show an older MAE — re-run the notebook **save** cell, then `python scripts/generate_checkpoint_slide_assets.py`, and refresh `roi_summary.txt` if you want file-based ROI to match exactly.

**Design notes (optional):** 16:9 slides, high-res PNGs (exported at 300 DPI). Keep tables readable; map may need a slightly larger title.

---

## Image checklist (insert into slides)

| # | File name | Suggested slide | What it shows |
|---|-----------|-----------------|---------------|
| A | `top_counties_predicted_growth.png` | Slide 2 (or 5) | Horizontal bar — top 15 NY counties by **predicted 1-year price growth %** |
| B | `ny_counties_predicted_growth_map.png` | Slide 2 (or 5) | NY state **choropleth** — same metric by county |
| C | *(notebook export)* | Slide 1 (optional) | **Grouped bar chart** — MAE and RMSE for **six** models (Linear, Ridge, tuned XGBoost, RF, HistGradientBoosting, LightGBM) from section 6 |

**Paths (relative to project root `bigdataproj`):**

- `slide_assets/top_counties_predicted_growth.png`
- `slide_assets/ny_counties_predicted_growth_map.png`

---

## Numbers for Slide 4 (ROI) — tuned XGBoost on 2025 holdout

*(From notebook section 6 test metrics; median `zhvi` on those rows ≈ **$232,743**.)*

| Metric | Value |
|--------|--------|
| MAE (next-year price, `zhvi_next`) | **~$6,623** |
| Median current `zhvi` (same 2025 test rows) | **~$232,743** |
| MAE ÷ median `zhvi` | **~**2.8% |

*If `roi_summary.txt` still shows ~**$8,058** MAE, that reflects an older `predicted_zhvi_next` in `model_dataset.csv`; re-save outputs after training to sync.*

---

## Slide 1 — The Boost (tuned models vs linear baseline)

**Section label:** Phase 2 — Model performance  

**Title:** From linear baselines to tuned gradient boosting  

**Setup (one line for speaker notes):** Train **2022–2024** (186 county-years), test **2025** (62 counties). Features scaled with `StandardScaler` fit on train only. **Nonlinear models** use **RandomizedSearchCV** (optimizes **MAE**, **25** random trials) with **5-fold GroupKFold by county** (a county never appears in both train and validation in the same fold), then refit on all training rows. Metrics below are **2025 holdout**.

**On-slide table:**

| Model | MAE ($) | RMSE ($) | R² |
|-------|---------|----------|-----|
| Linear Reg | 8,912 | 13,479 | 0.9962 |
| Ridge (α=1) | 9,907 | 15,174 | 0.9952 |
| XGBoost *(tuned)* | **6,623** | **9,625** | **0.9981** |
| Random Forest *(tuned)* | 12,516 | 30,456 | 0.9808 |
| HistGradientBoosting *(tuned)* | 8,285 | 12,365 | 0.9968 |
| LightGBM *(tuned)* | 16,864 | 38,305 | 0.9696 |

**Bullets:**

- Baselines = **Linear Regression** and **Ridge** on the same temporal split (**62** NYS counties in the test year).
- **Best holdout error:** **XGBoost** after hyperparameter search — **~$2,289** lower MAE than linear and **~$3,854** lower RMSE on 2025 in this run.
- **HistGradientBoosting** sits between linear and XGB on MAE; **Random Forest** and **LightGBM** did **not** beat linear on this test fold after tuning (use as context, not as the “hero” model).

**Visual:** Table above; optional **image C** (six-model MAE/RMSE bar chart from notebook section 6).

---

## Slide 2 — The Value (Phase 2 / expansion)

**Section label:** Phase 2 — Where to look next  

**Title:** Where growth is predicted — NY county view  

**Bullets:**

- Counties are ranked using **predicted 1-year % change** in ZHVI (modeled next-year price vs current).
- **`opportunity_score`** highlights places where the model expects **more upside** relative to recent realized growth (screening signal).
- Use case: **shortlist counties** for deeper research (comps, MLS, fundamentals) — **not** a standalone buy recommendation.

**Visuals:**

1. Insert image **A** — `top_counties_predicted_growth.png`
2. Insert image **B** — `ny_counties_predicted_growth_map.png`

---

## Slide 3 — The AI (force multiplier)

**Title:** How AI sped up the work  

**Bullets — Rahul to customize (placeholder until you paste a real example):**

- **Prompt (example):** *“Given a county-year panel with `zhvi`, `zhvi_next`, and census features, set up a time-based split, `StandardScaler` on train only, linear baselines, and `RandomizedSearchCV` with `GroupKFold` by county for XGBoost, Random Forest, HistGradientBoosting, and LightGBM — report MAE, RMSE, R² on the 2025 holdout.”*
- **Outcome:** Faster scaffolding for splits, metrics, tuning grids, and the **six-model** comparison — less boilerplate, more interpretation.

**Designer note:** Leave space for a **screenshot** (prompt + short AI reply) if Rahul supplies one later.

---

## Slide 4 — The ROI (business impact)

**Title:** What error means in dollars  

**Subtitle / context:** County-level **ZHVI index** prediction error — illustrative only, not an appraisal.

**On-slide mini-table (tuned XGBoost, 2025 holdout — align with notebook):**

| | |
|--|--|
| Typical absolute error (MAE) | **~$6,600** per county-year forecast of next-year index |
| Median county price level (benchmark) | **~$233k** |
| Error as % of that benchmark | **~2.8%** |

**Bullets:**

- MAE answers: “How far off is the **typical** one-year-ahead **county index** forecast?”
- **Illustration:** For a **$350k** hypothetical benchmark home, **~2.8%** is about **$10k** valuation slack (order of magnitude only).
- **Disclaimer:** Portfolio and model risk remain; not transaction advice.

**Disclaimer (footer, small):** For educational / project use; not investment or valuation advice.

---

## Slide 5 — The Finale (story arc)

**Title / headline (lead with this):**

> **Tuned XGBoost beat linear and other tree models on next-year NYS county price levels — maps turn the model into a geographic shortlist.**

**Bullets:**

- **Evidence:** Best **MAE / RMSE** and **R² (0.9981)** on **2025** with **tuned XGBoost** after **county-grouped** cross-validation (see Slide 1).
- **So what:** **Bar chart + map** link the math to **where** investors should dig next.

**Visuals:** Optionally repeat **A** and/or **B**, or a single strong graphic + pointer “See Slide 2.”

---

## One-line project context (speaker notes / appendix)

**House Flipper Scouts:** Merge **Zillow ZHVI** with **Census** (income, rent, education, age mix), predict **next-year county home value index** (`zhvi_next`), rank NY counties for **screening** — backtested with train **2022–2024** and test **2025**, **GroupKFold by county** for tuning, scaler fit on train only.

---

*End of handoff. Regenerate figures and ROI file after re-training: from project root, run `python scripts/generate_checkpoint_slide_assets.py` (after `pip install -r requirements.txt` and saving `model_dataset.csv` / `opportunity_rankings.csv` from the notebook).*

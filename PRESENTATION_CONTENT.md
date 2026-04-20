# House Flipper Scouts — Backtesting Pipeline
## NY County Housing Price Prediction

---

## SLIDE 1: Intro

**Title:** Predicting NY County Housing Growth — A Backtesting Pipeline

**Content:**
- **Problem:** Which NY counties will see the highest 1-year home price growth?
- **Data:** Zillow ZHVI (62 NY counties, 2021–2026) + Census (income, rent, education, age)
- **Approach:** Train on Year X → Predict Year X+1 (temporal backtest)
- **Output:** Opportunity rankings for real estate investors

**Visual:** 
- Map of NY state with 62 counties highlighted
- Or: Simple flowchart: Zillow + Census → Merge → Target (YoY growth) → Model → Opportunity Score

---

## SLIDE 2: Setup (Strategy)

**Title:** Setup — Model, Target & Split

**Content:**

| Component | Choice |
|-----------|--------|
| **Target** | 1-year ZHVI growth: `(ZHVI_t+1 - ZHVI_t) / ZHVI_t` |
| **Features** | Census (income, rent, education, age) + ZHVI + seasonality + **lagged_growth** |
| **Model** | Linear Regression (full), Ridge, **Lagged-Only** (momentum) |
| **Split** | Train: 2024 → Test: 2025 (62 counties each) |
| **No leakage** | Features known at start of year; target is next year's growth |

**Visual:**
- Diagram: `2024 data → Train → Predict 2025 growth → Compare to actual`
- Or: Table above as a clean slide table

---

## SLIDE 3: Score (Evaluation)

**Title:** Score — Baseline vs Naive

**Content:**

```
=== SCORE (Evaluation) ===
Model                    MAE     RMSE       R²
--------------------------------------------------
Baseline (Naive)       0.0170   0.0197  -1.8645
Lagged-Only           0.0110   0.0151  -0.6865   ← Best
Linear Reg            0.0207   0.0263  -4.0966
Ridge (alpha=1)       0.0196   0.0253  -3.6971
```

**Takeaway:** Lagged-Only (momentum: last year's growth) beats Naive. Full models overfit.

**Visual:**
- Bar chart: R² by model (Lagged-Only highest / least negative)
- Or: MAE/RMSE comparison bar chart

---

## SLIDE 4: Drivers (Features)

**Title:** Drivers — What Predicts Growth?

**Content:**

**Top 5 features (Full Linear Regression):**
1. **seasonality_score** — Back-to-school vs winter price gap
2. **zhvi** — Current price level
3. **pct_bachelors_plus** — Education level
4. **median_income** — Purchasing power
5. **median_rent** — Affordability signal

**Reality check:** Despite these drivers, the full model underperforms. **Lagged growth alone** (momentum) wins — past growth predicts future growth better than demographics.

**Visual:**
- Horizontal bar chart: |Coefficient| for top 5 features (from your notebook)
- Caption: "Full model drivers — but Lagged-Only (1 feature) beats all"

---

## SLIDE 5: Pivot (Phase 2 Proposal)

**Title:** Pivot — Entrepreneurial Expansion

**Content:**

**One-sentence pitch:**

> Extend House Flipper Scouts into a live Streamlit dashboard + API that lets real estate investors screen NY counties by predicted growth and opportunity score, then drill into neighborhood-level Zillow + Census signals to prioritize deals before they hit MLS.

**Value:** Actionable county rankings (2025→2026) for investors; budget-aware (opportunity_score) vs growth-focused (predicted_growth).

**Visual:**
- Mockup: Dashboard with county dropdown, opportunity score table, map
- Or: Screenshot of opportunity_rankings.csv top 10

---

## SLIDE 6: Next (Improvement)

**Title:** Next — Steps to Beat the Baseline

**Content:**

1. **Add interaction terms** — e.g. `pct_age_25_34 × median_income` (demographics × purchasing power)
2. **Try gradient boosting** — XGBoost/LightGBM for non-linear patterns
3. **Expand temporal window** — Train on 2022–2024 with year fixed effects
4. **Feature engineering** — `price_to_rent_ratio`, 2-year lagged growth
5. **More data** — Add 2020–2021 if Census available; try multi-state

**Visual:**
- Numbered checklist or roadmap diagram
- Or: Simple "Before vs After" — current R² vs target

---

## Visual Assets to Create

| Slide | Visual | Source |
|-------|--------|--------|
| 1 | NY county map | Use folium/geopandas or static map |
| 2 | Pipeline diagram | Draw.io / Mermaid |
| 3 | Bar chart (MAE, RMSE, R²) | From notebook `plt.bar()` |
| 4 | Feature importance chart | Already in notebook |
| 5 | Dashboard mockup / rankings table | Screenshot or Figma |
| 6 | Checklist / roadmap | Simple list or diagram |

# NY County Housing Forecast — Risk vs Reward Viewer

**Live site:** [https://rahulrb99.github.io/ny-county-housing-forecast/](https://rahulrb99.github.io/ny-county-housing-forecast/)

An interactive data visualization tool for exploring housing market risk and predicted growth across all 62 New York State counties. Built on a machine-learning backtesting pipeline that fuses Zillow home value data with U.S. Census socioeconomic indicators to forecast 1-year county-level home price growth.

---

## What It Shows

The dashboard has three synchronized panels:

### 1. Quadrant Scatter Plot
- **X-axis (Risk):** Historical price volatility — the sample standard deviation of year-over-year ZHVI returns from 2021 to 2025, expressed in percentage points.
- **Y-axis (Reward):** Predicted 1-year ZHVI growth (%) for 2025 → 2026, output by a tuned XGBoost model.
- Dashed lines split the chart at the **median** of each axis into four quadrants:

| Quadrant | Color | Meaning |
|---|---|---|
| High Reward / Low Risk | Green | Best investment profile |
| High Reward / High Risk | Blue | High upside, but volatile |
| Low Reward / Low Risk | Yellow | Stable but slow growth |
| Low Reward / High Risk | Red | Worst profile |

### 2. Choropleth Map
- All 62 NY counties colored on a red → green gradient by **predicted growth**.
- Hover for a tooltip with county name and predicted growth %.
- Click to select a county and sync the details panel.

### 3. County Details Panel
Clicking any county (on either the scatter or map) shows:
- **Predicted growth (2025 → 2026):** Model forecast in %.
- **Actual growth (2025 → 2026):** Real Zillow data for backtesting comparison.
- **Prediction error:** How far off the model was, in percentage points.
- **Risk (volatility):** Std dev of YoY ZHVI returns, 2021–2025.
- **ZHVI level (2025):** Current median home value.
- **Actual vs. Predicted 2026 ZHVI level.**
- **Opportunity Score:** `predicted_growth / (zhvi / 100,000)` — growth per $100k of home value. Higher = more appreciation per dollar invested (favors undervalued counties).
- **ZHVI Trend chart:** Historical actual values (2021–2025) plus the predicted 2026 data point.

### Controls
- **County search box:** Type-ahead search to jump to any county.
- **Labels toggle:** Show/hide all county labels on the scatter plot.
- **Click-to-select:** Synced between map and scatter; selected point is enlarged.

---

## Data Pipeline

The analysis runs across two Jupyter notebooks before the static site is built.

### Notebook 1 — `01_zillow_cleaning.ipynb`

**Part A: Zillow ZHVI Cleaning**

- Source: Zillow Home Value Index (ZHVI) for all 62 NY counties, monthly from 2000–2026 (322 monthly columns, wide format).
- Converted from wide → long format (~19,400 rows).
- Filtered to 2021–2026 and aggregated to **county-year level** by taking the mean of monthly ZHVI.
- Computed a **seasonality score** per county per year: the percent by which average home values in back-to-school months (Aug–Oct) exceed winter months (Dec–Feb). Range: −4.1% to +9.7%.
- Output: `zillow_county_yearly.csv` (248 rows × 4 columns).

**Part B: Census ACS Data Cleaning**

- Source: U.S. Census Bureau ACS 5-Year Estimates, 2022–2024, for all 62 NY counties.
- Tables loaded:

| Table | Variable | Description |
|---|---|---|
| B19013 | `median_income` | Median household income ($) |
| B25064 | `median_rent` | Median gross rent ($/month) |
| B01001 | `pct_age_25_34` | Share of population aged 25–34 (prime first-time buyer cohort) |
| B15003 | `pct_bachelors_plus` | Share of adults with a bachelor's degree or higher |

- County names normalized (e.g. "St. Lawrence" → "Saint Lawrence") for consistent merging.
- Output: `census_cleaned.csv` (186 rows × 7 columns).

---

### Notebook 2 — `02_merge_and_model.ipynb`

**Merge**
- Zillow and Census joined on `county` × `year`.
- Census years 2022–2024 forward-filled for 2025 and 2026 rows where exact year unavailable.

**Target Variable**
- `target_growth = (zhvi_{t+1} − zhvi_t) / zhvi_t`
- Represents actual 1-year percent change in home values.
- `lagged_growth` (prior year growth) added as a feature.

**Feature Set**

| Feature | Source |
|---|---|
| `zhvi` | Zillow (current year home value) |
| `lagged_growth` | Zillow (prior year YoY growth) |
| `seasonality_score` | Zillow (derived) |
| `median_income` | Census B19013 |
| `median_rent` | Census B25064 |
| `pct_age_25_34` | Census B01001 |
| `pct_bachelors_plus` | Census B15003 |

**Train / Test Split**
- Temporal split to prevent data leakage:
  - **Train:** 2022–2024 (county-years with known next-year prices)
  - **Test:** 2025 (holdout — predict 2026 prices)
- Cross-validation: **5-fold GroupKFold by county** (same county never in both train and validation in a fold).

**Models Compared**

All models predict `zhvi_next` (next year's price level). Metrics are on the **2025 holdout set** (62 counties):

| Model | Test MAE ($) | Test RMSE ($) | R² |
|---|---|---|---|
| Linear Regression | 9,907 | 15,174 | 0.9952 |
| Ridge (α=1) | 9,907 | 15,174 | 0.9952 |
| **XGBoost (tuned)** | **6,623** | **9,625** | **0.9981** |
| HistGradientBoosting (tuned) | 8,285 | 12,365 | 0.9968 |
| Random Forest (tuned) | 12,516 | 30,456 | 0.9808 |
| LightGBM (tuned) | 16,864 | 38,305 | 0.9696 |

XGBoost hyperparameters (selected via RandomizedSearchCV optimizing MAE):
`n_estimators=500, max_depth=4, learning_rate=0.05, subsample=0.85, colsample_bytree=1.0, min_child_weight=3, reg_lambda=10.0`

**Final Outputs**
- `predicted_zhvi_next`: XGBoost predicted next-year home value.
- `predicted_growth`: `(predicted_zhvi_next − zhvi) / zhvi`
- `opportunity_score`: `predicted_growth / (zhvi / 100,000)` — growth per $100k invested.
- Output file: `docs/data/model_dataset.csv`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Data cleaning | Python, pandas |
| Modeling | scikit-learn, XGBoost, LightGBM |
| Frontend charts | [Plotly.js](https://plotly.com/javascript/) v2.30 |
| Frontend map | [Leaflet.js](https://leafletjs.com/) v1.9.4 + OpenStreetMap tiles |
| CSV parsing | [PapaParse](https://www.papaparse.com/) v5.4.1 |
| Hosting | GitHub Pages (static, zero build step) |

The frontend is **pure HTML/CSS/JS** — no framework, no bundler, no Node.js required.

---

## Project Structure

```
bigdataproj/
├── 01_zillow_cleaning.ipynb      # Data cleaning: Zillow + Census ACS
├── 02_merge_and_model.ipynb      # Merge, modeling, output generation
├── docs/
│   ├── index.html                # Single-page app entry point
│   ├── app.js                    # All frontend logic (~600 lines)
│   ├── styles.css                # Dark-theme styles
│   └── data/
│       ├── model_dataset.csv     # Model predictions (one row per county-year)
│       ├── zillow_county_yearly.csv  # Historical ZHVI by county and year
│       └── ny_counties.geojson   # NY county boundaries for the choropleth
└── README.md
```

---

## Run Locally

Because `app.js` loads data files via `fetch()`, the site must be served over HTTP (not opened as `file://`).

```bash
cd docs
python -m http.server 8000
```

Then open: [http://localhost:8000](http://localhost:8000)

No dependencies to install — all JS libraries are loaded from CDN.

---

## Data Sources

| Dataset | Source |
|---|---|
| Zillow Home Value Index (ZHVI) | [Zillow Research](https://www.zillow.com/research/data/) — county-level, NY State, 2000–2026 |
| Median Household Income (B19013) | [U.S. Census Bureau ACS 5-Year](https://data.census.gov/), 2022–2024 |
| Median Gross Rent (B25064) | U.S. Census Bureau ACS 5-Year, 2022–2024 |
| Age by Sex (B01001) | U.S. Census Bureau ACS 5-Year, 2022–2024 |
| Educational Attainment (B15003) | U.S. Census Bureau ACS 5-Year, 2022–2024 |
| NY County Boundaries | GeoJSON (public domain) |

---

## Key Definitions

- **ZHVI (Zillow Home Value Index):** Zillow's estimate of the median home value for a given region and time period, in dollars.
- **Historical Volatility:** Sample standard deviation of year-over-year ZHVI percentage returns from 2021 to 2025. Higher = more price swings = more risk.
- **Predicted Growth:** XGBoost model forecast of the percent change in county median home values from 2025 to 2026.
- **Opportunity Score:** `predicted_growth / (zhvi / 100,000)`. Captures growth per $100k of home value — favoring affordable counties where the same dollar gets you more appreciation.
- **Backtesting:** The model is trained on data from 2022–2024 and evaluated on 2025 predictions against actual 2026 Zillow data — simulating a real forecast made one year in advance.

# House Flipper Scouts: NY County Housing Forecast

**Live dashboard:** [https://rahulrb99.github.io/ny-county-housing-forecast/](https://rahulrb99.github.io/ny-county-housing-forecast/)

This project supports **Team 4: The House Flipper Scouts**, acting as an acquisitions team for a short-term investment fund. The fund buys homes, renovates them, and sells them within 12 months. The goal is to identify New York counties that look undervalued today but show signals of near-term appreciation.

The mandate is to use Zillow home value history and Census demographics to predict the **1-year percent change in home values**, then use those forecasts to screen counties for acquisition opportunities.

---

## Business Problem

For a buy-renovate-resell strategy, the best target market is not simply the county with the highest current home value or the fastest historic growth. The acquisition team needs counties with:

- Lower current entry prices
- Strong predicted 12-month appreciation
- Manageable historical volatility
- Demand signals from demographics and rents
- A clear opportunity score that favors appreciation per dollar invested

The project therefore focuses on county-level screening, not individual property selection.

---

## Dashboard

The live dashboard is a static GitHub Pages app built with plain HTML, CSS, and JavaScript. It lets users compare all 62 New York counties by risk, predicted appreciation, and opportunity score.

### 1. Risk vs Reward Scatter Plot

- **X-axis:** Historical volatility, measured as the sample standard deviation of year-over-year ZHVI returns from 2021 to 2025.
- **Y-axis:** Predicted 1-year home value growth for 2025 to 2026.
- Dashed median lines divide counties into four investment profiles:

| Quadrant | Interpretation |
|---|---|
| High reward / Low risk | Strongest investment profile |
| High reward / High risk | Upside, but more volatile |
| Low reward / Low risk | Stable but slower appreciation |
| Low reward / High risk | Weakest profile |

Clicking a county in the scatter plot updates the map and details panel.

### 2. NY County Choropleth Map

- Colors each county by predicted 1-year growth.
- Hover shows county name and forecast.
- Click selects a county and syncs with the scatter plot and details panel.

### 3. County Details Panel

For the selected county, the dashboard shows:

- Predicted 1-year growth
- Actual 1-year growth for the backtest period
- Prediction error
- Historical volatility
- 2025 ZHVI home value level
- Actual vs. predicted 2026 ZHVI
- Opportunity score
- ZHVI trend from 2021 to 2026

### Controls

- County search box
- Scatter label toggle
- Click-to-select behavior across scatter and map

---

## Opportunity Score

The dashboard ranks affordability-adjusted upside using:

```text
opportunity_score = predicted_growth / (zhvi / 100,000)
```

This means the score measures predicted appreciation per $100,000 of current home value. A higher score favors counties where the same acquisition dollar has more forecasted upside.

This is useful for the House Flipper Scouts role because short-term acquisition teams care about both growth and entry price.

---

## Data Pipeline

The analysis is built from two notebooks.

### Notebook 1: `01_zillow_cleaning.ipynb`

**Zillow ZHVI cleaning**

- Source: Zillow Home Value Index (ZHVI), county level, New York State.
- Converts monthly wide-format data into county-year rows.
- Filters and aggregates Zillow data to annual county-level home values.
- Computes a seasonality score using back-to-school months versus winter months.
- Output: `zillow_county_yearly.csv`

**Census ACS cleaning**

Uses ACS 5-Year estimates for New York counties:

| Census Table | Feature | Meaning |
|---|---|---|
| B19013 | `median_income` | Median household income |
| B25064 | `median_rent` | Median gross rent |
| B01001 | `pct_age_25_34` | Share of population aged 25 to 34 |
| B15003 | `pct_bachelors_plus` | Share of adults with bachelor's degree or higher |

Output: `census_cleaned.csv`

---

### Notebook 2: `02_merge_and_model.ipynb`

**Merge**

- Joins Zillow and Census data by county and year.
- Forward-fills Census features where needed for forecast years.

**Target variable**

```text
target_growth = (zhvi_next - zhvi) / zhvi
```

This represents the actual 1-year percent change in home values.

**Model features**

| Feature | Source |
|---|---|
| `zhvi` | Zillow current home value |
| `lagged_growth` | Prior year Zillow growth |
| `seasonality_score` | Zillow-derived seasonal pattern |
| `median_income` | Census ACS |
| `median_rent` | Census ACS |
| `pct_age_25_34` | Census ACS |
| `pct_bachelors_plus` | Census ACS |

**Train / test design**

- Train: 2022 to 2024 county-years
- Test: 2025 holdout set predicting 2026 values
- Cross-validation: GroupKFold by county

This avoids mixing the same county into both training and validation folds.

---

## Models Compared

Models were compared on the 2025 holdout set of 62 counties.

| Model | Test MAE ($) | Test RMSE ($) | R2 |
|---|---:|---:|---:|
| Linear Regression | 9,907 | 15,174 | 0.9952 |
| Ridge | 9,907 | 15,174 | 0.9952 |
| XGBoost tuned | 6,623 | 9,625 | 0.9981 |
| HistGradientBoosting tuned | 8,285 | 12,365 | 0.9968 |
| Random Forest tuned | 12,516 | 30,456 | 0.9808 |
| LightGBM tuned | 16,864 | 38,305 | 0.9696 |

The tuned XGBoost model performed best on MAE and RMSE, so its outputs power the dashboard.

---

## Final Outputs

The dashboard uses the bundled files in `docs/data/`:

| File | Purpose |
|---|---|
| `model_dataset.csv` | Model predictions and county-year features |
| `zillow_county_yearly.csv` | Historical annual ZHVI by county |
| `ny_counties.geojson` | County boundaries for the map |

Key output fields include:

- `predicted_zhvi_next`
- `predicted_growth`
- `target_growth`
- `opportunity_score`
- `zhvi`
- Census demographic fields

---

## Tech Stack

| Layer | Technology |
|---|---|
| Data cleaning | Python, pandas |
| Modeling | scikit-learn, XGBoost, LightGBM |
| Frontend charts | Plotly.js |
| Frontend map | Leaflet.js and OpenStreetMap tiles |
| CSV parsing | PapaParse |
| Hosting | GitHub Pages |

The frontend is pure static HTML, CSS, and JavaScript. There is no framework, bundler, or server-side app.

---

## Project Structure

```text
bigdataproj/
|-- 01_zillow_cleaning.ipynb
|-- 02_merge_and_model.ipynb
|-- census_cleaned.csv
|-- README.md
|-- requirements.txt
|-- docs/
|   |-- index.html
|   |-- app.js
|   |-- styles.css
|   |-- data/
|       |-- model_dataset.csv
|       |-- zillow_county_yearly.csv
|       |-- ny_counties.geojson
```

---

## Run Locally

Because the dashboard loads CSV and GeoJSON files with `fetch()`, open it through a local HTTP server instead of opening `index.html` directly.

```bash
cd docs
python -m http.server 8000
```

Then open:

[http://localhost:8000](http://localhost:8000)

No local JavaScript dependencies are required.

---

## Data Sources

| Dataset | Source |
|---|---|
| Zillow Home Value Index | Zillow Research |
| Median household income | U.S. Census Bureau ACS 5-Year |
| Median gross rent | U.S. Census Bureau ACS 5-Year |
| Age by sex | U.S. Census Bureau ACS 5-Year |
| Educational attainment | U.S. Census Bureau ACS 5-Year |
| NY county boundaries | GeoJSON boundary file |

---

## Key Definitions

- **ZHVI:** Zillow Home Value Index, used as the county-level home value measure.
- **Predicted growth:** Model forecast of the 1-year percent change in home values.
- **Historical volatility:** Standard deviation of year-over-year ZHVI returns from 2021 to 2025.
- **Opportunity score:** Forecasted growth per $100,000 of current home value.
- **Backtesting:** Testing the model on a holdout year where actual next-year Zillow values are available.

---

## Important Limitation

This project screens counties, not individual properties. Before making an acquisition decision, an investor would still need to validate property-level renovation cost, inventory, days on market, permits, taxes, financing, and resale comps.

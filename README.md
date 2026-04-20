# NY County Housing “Risk vs Reward” Viewer

This project builds a simple **static GitHub Pages** site that visualizes New York counties on a **risk vs reward** quadrant:

- **Risk (x-axis):** historical ZHVI year-over-year volatility (std dev of YoY % returns, 2021–2025)
- **Reward (y-axis):** predicted 1-year growth for **forecast year 2025** (interpreted as predicting **2026**)
- **Map + scatter are synced:** click a county on either view to see details
- **Details show predicted vs actual (2026)** plus a ZHVI trend chart

## Web Demo (GitHub Pages)

After enabling Pages for this repo:

- GitHub → **Settings** → **Pages**
- Source: **Deploy from a branch**
- Branch: `main`
- Folder: `/docs`

Your site URL will look like:

`https://<your-username>.github.io/<your-repo>/`

## Run Locally

GitHub Pages features like `fetch()` won’t work from `file://` URLs. Run a local server:

```bash
cd docs
python -m http.server 8000
```

Then open:

`http://localhost:8000`

## Data Notes

The frontend loads data directly (no build step) from:

- `docs/data/model_dataset.csv`
- `docs/data/zillow_county_yearly.csv`
- `docs/data/ny_counties.geojson`

These are copies of the project outputs so the Pages site is self-contained.


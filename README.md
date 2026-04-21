# NY County Housing Forecast — Risk vs Reward Viewer

Live site:

`https://rahulrb99.github.io/ny-county-housing-forecast/`

This repo is intentionally kept **minimal** and focused on the deployed visualization:

- **4‑quadrant scatter:** risk = historical volatility (2021–2025), reward = predicted growth (forecast year 2025 → 2026)
- **NY map synced with scatter:** click either view to select a county
- **Details panel:** predicted vs actual growth + ZHVI trend

## Run Locally

Because the app loads CSV/GeoJSON via `fetch()`, it must be served over HTTP:

```bash
cd docs
python -m http.server 8000
```

Open:

`http://localhost:8000`

## Data Used by the Site

The static frontend reads (no build step):

- `docs/data/model_dataset.csv`
- `docs/data/zillow_county_yearly.csv`
- `docs/data/ny_counties.geojson`

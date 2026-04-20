"""
Generate checkpoint slide assets: bar chart, NY county choropleth, ROI summary.

Install: pip install -r requirements.txt
Run from project root (bigdataproj): python scripts/generate_checkpoint_slide_assets.py

Uses U.S. county polygons (Plotly/geojson-counties-fips, public domain /
Census-derived), keeps NY (STATE FIPS 36), caches to data/ny_counties.geojson
after first download.
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SLIDE_DIR = PROJECT_ROOT / "slide_assets"
DATA_DIR = PROJECT_ROOT / "data"
GEOJSON_CACHE = DATA_DIR / "ny_counties.geojson"

COUNTIES_GEOJSON_URL = (
    "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"
)

# Rankings "X County" short name -> Census county NAME (see cb_2020_us_county NAME)
COUNTY_ALIASES: dict[str, str] = {
    "Saint Lawrence": "St. Lawrence",
}


def load_ny_counties_gdf():
    import geopandas as gpd

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if GEOJSON_CACHE.exists():
        return gpd.read_file(GEOJSON_CACHE)

    print(f"Downloading county boundaries (one-time): {COUNTIES_GEOJSON_URL}", file=sys.stderr)
    gdf = gpd.read_file(COUNTIES_GEOJSON_URL)
    ny = gdf[gdf["STATE"] == "36"].copy()
    if len(ny) != 62:
        print(f"Warning: expected 62 NY counties; got {len(ny)}", file=sys.stderr)
    if ny.empty:
        raise RuntimeError("No NY counties found (STATE=36).")
    ny.to_file(GEOJSON_CACHE, driver="GeoJSON")
    return ny


def rankings_join_key(county_full: str) -> str:
    s = county_full.replace(" County", "").strip()
    return COUNTY_ALIASES.get(s, s)


def plot_top_counties_bar(df: pd.DataFrame, out_path: Path, top_n: int = 15) -> None:
    d = df.sort_values("predicted_growth", ascending=False).head(top_n).copy()
    d["pct"] = d["predicted_growth"] * 100.0
    d = d.sort_values("pct", ascending=True)

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.barh(d["county"], d["pct"], color="steelblue", alpha=0.9)
    ax.set_xlabel("Predicted 1-year price change (%)")
    ax.set_title(f"Top {top_n} NY counties by predicted growth (rankings file)")
    ax.axvline(0, color="gray", linewidth=0.8)
    fig.tight_layout()
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"Wrote {out_path}")


def plot_ny_choropleth(rankings: pd.DataFrame, gdf, out_path: Path) -> None:
    r = rankings.copy()
    r["NAME"] = r["county"].map(rankings_join_key)

    merged = gdf.merge(r[["NAME", "predicted_growth"]], on="NAME", how="left")
    missing = merged["predicted_growth"].isna().sum()
    if missing:
        names = merged.loc[merged["predicted_growth"].isna(), "NAME"].tolist()
        print(
            f"Warning: {missing} counties without ranking match: {names[:10]}...",
            file=sys.stderr,
        )

    # Use percent on the map so the color scale matches the bar chart (same units).
    merged["predicted_growth_pct"] = merged["predicted_growth"] * 100.0

    fig, ax = plt.subplots(figsize=(9, 8))
    merged.plot(
        column="predicted_growth_pct",
        ax=ax,
        legend=True,
        cmap="YlOrRd",
        missing_kwds={"color": "lightgray", "label": "No data"},
        legend_kwds={"label": "Predicted growth (%)"},
        edgecolor="0.4",
        linewidth=0.3,
    )
    ax.set_title("NY counties: predicted 1-year ZHVI growth (%) — model rankings")
    ax.axis("off")
    fig.tight_layout()
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"Wrote {out_path}")


def write_roi_summary(out_path: Path) -> None:
    model_path = PROJECT_ROOT / "model_dataset.csv"
    if not model_path.exists():
        print(f"No {model_path.name}; skipping ROI summary.", file=sys.stderr)
        return

    df = pd.read_csv(model_path)
    test = df[df["year"] == 2025]
    if test.empty:
        print("No 2025 rows in model_dataset; skipping ROI summary.", file=sys.stderr)
        return

    y = test["zhvi_next"].values
    pred = test["predicted_zhvi_next"].values
    zhvi = test["zhvi"].values
    mae = float(np.mean(np.abs(y - pred)))
    med_zhvi = float(np.median(zhvi))
    pct = 100.0 * mae / med_zhvi if med_zhvi else float("nan")

    lines = [
        "ROI summary (2025 test rows, model_dataset.csv)",
        f"MAE on zhvi_next (vs predicted_zhvi_next): ${mae:,.2f}",
        f"Median zhvi (same rows): ${med_zhvi:,.2f}",
        f"MAE / median zhvi: {pct:.2f}%",
        "",
        "Use Slide 4: typical dollar error on next-year county-level index;",
        "not a substitute for property-level appraisal.",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path}")


def main() -> None:
    SLIDE_DIR.mkdir(parents=True, exist_ok=True)

    rankings_path = PROJECT_ROOT / "opportunity_rankings.csv"
    if not rankings_path.exists():
        raise FileNotFoundError(f"Missing {rankings_path}")

    df = pd.read_csv(rankings_path)

    plot_top_counties_bar(df, SLIDE_DIR / "top_counties_predicted_growth.png")

    gdf = load_ny_counties_gdf()
    plot_ny_choropleth(df, gdf, SLIDE_DIR / "ny_counties_predicted_growth_map.png")

    write_roi_summary(SLIDE_DIR / "roi_summary.txt")


if __name__ == "__main__":
    main()

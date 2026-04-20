"""
Risk vs upside quadrant charts (NY counties).

X-axis: historical ZHVI YoY volatility (std of annual % changes, 2021–2025).
Y-axis: either predicted 1-year growth (%) or opportunity score (×100).

Reads: zillow_county_yearly.csv, model_dataset.csv
Writes: slide_assets/quadrant_predicted_growth_vs_volatility.png
         slide_assets/quadrant_opportunity_score_vs_volatility.png

Run from project root: python scripts/generate_quadrant_charts.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

try:
    from adjustText import adjust_text
except ImportError:
    adjust_text = None  # type: ignore[misc, assignment]

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SLIDE_DIR = PROJECT_ROOT / "slide_assets"
YEARLY_PATH = PROJECT_ROOT / "zillow_county_yearly.csv"
MODEL_PATH = PROJECT_ROOT / "model_dataset.csv"


def county_display_name(full_name: str) -> str:
    """User-friendly label: drop ' County'; common NYC / NY aliases."""
    s = full_name.replace(" County", "").strip()
    aliases = {
        "St. Lawrence": "St. Lawrence",
        "New York": "Manhattan",  # New York County = Manhattan
    }
    return aliases.get(s, s)


def compute_county_volatility(df_yearly: pd.DataFrame) -> pd.DataFrame:
    """Std dev of year-over-year ZHVI % change per county (recent history only)."""
    d = df_yearly.copy()
    d = d[d["year"] <= 2025].sort_values(["county", "year"])
    d["yoy_return"] = d.groupby("county")["zhvi"].pct_change()
    # At least 2 YoY points to get a spread (4 returns for 2021–2025 span)
    vol = (
        d.groupby("county", as_index=False)["yoy_return"]
        .agg(volatility="std")
        .dropna(subset=["volatility"])
    )
    return vol


def merge_latest_predictions(vol: pd.DataFrame, forecast_year: int = 2025) -> pd.DataFrame:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Missing {MODEL_PATH}")
    m = pd.read_csv(MODEL_PATH)
    m = m[m["year"] == forecast_year].copy()
    if m.empty:
        raise ValueError(f"No rows for year=={forecast_year} in model_dataset.csv")

    out = m.merge(vol, on="county", how="inner")
    if len(out) < len(m):
        missing = set(m["county"]) - set(out["county"])
        print(f"Warning: {len(missing)} counties dropped (no volatility): {sorted(missing)}", file=sys.stderr)
    return out


def add_quadrant_guides(ax, x_med: float, y_med: float) -> None:
    ax.axvline(x_med, color="0.45", linewidth=1.0, linestyle="--", zorder=0)
    ax.axhline(y_med, color="0.45", linewidth=1.0, linestyle="--", zorder=0)

    xl, xr = ax.get_xlim()
    yb, yt = ax.get_ylim()
    pad_x = (xr - xl) * 0.02
    pad_y = (yt - yb) * 0.02

    # Low vol = left; high vol = right
    fs = 9
    ax.text(
        xl + pad_x,
        yt - pad_y,
        "Higher upside, calmer market",
        fontsize=fs,
        color="0.35",
        va="top",
        ha="left",
    )
    ax.text(
        xr - pad_x,
        yt - pad_y,
        "Higher upside,\nmore volatile history",
        fontsize=fs,
        color="0.35",
        va="top",
        ha="right",
    )
    ax.text(
        xl + pad_x,
        yb + pad_y,
        "Lower upside, calmer market",
        fontsize=fs,
        color="0.35",
        va="bottom",
        ha="left",
    )
    ax.text(
        xr - pad_x,
        yb + pad_y,
        "Lower upside,\nmore volatile history",
        fontsize=fs,
        color="0.35",
        va="bottom",
        ha="right",
    )


def plot_quadrant(
    df: pd.DataFrame,
    y_col: str,
    y_title: str,
    y_pct_scale: float,
    out_path: Path,
) -> None:
    df = df.copy()
    df["vol_pct"] = df["volatility"] * 100.0  # YoY return std as % points
    df["y_plot"] = df[y_col] * y_pct_scale
    df["label"] = df["county"].map(county_display_name)

    x_med = float(df["vol_pct"].median())
    y_med = float(df["y_plot"].median())

    x_min, x_max = float(df["vol_pct"].min()), float(df["vol_pct"].max())
    y_min, y_max = float(df["y_plot"].min()), float(df["y_plot"].max())
    x_pad = max((x_max - x_min) * 0.12, 0.4)
    y_pad = max((y_max - y_min) * 0.15, (abs(y_max) + abs(y_min)) * 0.05 + 0.2)

    fig, ax = plt.subplots(figsize=(11, 8.5))
    ax.set_xlim(x_min - x_pad, x_max + x_pad)
    ax.set_ylim(y_min - y_pad, y_max + y_pad)

    ax.scatter(
        df["vol_pct"],
        df["y_plot"],
        s=52,
        c="#2c5282",
        alpha=0.75,
        edgecolors="white",
        linewidths=0.6,
        zorder=3,
    )

    add_quadrant_guides(ax, x_med, y_med)

    ax.set_xlabel("Historical price volatility (std of YoY ZHVI change, 2021–2025, % points)")
    ax.set_ylabel(y_title)
    ax.set_title("NY counties — risk vs upside (median split quadrants)")

    texts = []
    for _, row in df.iterrows():
        texts.append(
            ax.text(
                row["vol_pct"],
                row["y_plot"],
                row["label"],
                fontsize=7.5,
                color="#1a202c",
                ha="center",
                va="center",
            )
        )

    if adjust_text is not None:
        adjust_text(
            texts,
            ax=ax,
            expand_points=(1.3, 1.4),
            expand_text=(1.2, 1.3),
            arrowprops=dict(
                arrowstyle="-",
                color="0.55",
                lw=0.45,
                alpha=0.65,
                shrinkA=2,
                shrinkB=2,
            ),
        )
    else:
        print(
            "Tip: pip install adjustText for non-overlapping labels.",
            file=sys.stderr,
        )

    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"Wrote {out_path}")


def main() -> None:
    if not YEARLY_PATH.exists():
        raise FileNotFoundError(f"Missing {YEARLY_PATH}")

    ydf = pd.read_csv(YEARLY_PATH)
    vol = compute_county_volatility(ydf)
    merged = merge_latest_predictions(vol, forecast_year=2025)

    plot_quadrant(
        merged,
        y_col="predicted_growth",
        y_title="Predicted 1-year ZHVI growth (%)",
        y_pct_scale=100.0,
        out_path=SLIDE_DIR / "quadrant_predicted_growth_vs_volatility.png",
    )
    plot_quadrant(
        merged,
        y_col="opportunity_score",
        y_title="Opportunity score (×100)\ngrowth per $100k of current ZHVI",
        y_pct_scale=100.0,
        out_path=SLIDE_DIR / "quadrant_opportunity_score_vs_volatility.png",
    )


if __name__ == "__main__":
    main()

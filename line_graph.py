"""
Monthly ZHVI line chart: top 5 counties by predicted_growth (last 36 months).
Reads opportunity_rankings.csv + zillow_data_ny_full.csv (wide monthly ZHVI).
Output: slide_assets/top_growing_zhvi_trend.png

Run from project root: python line_graph.py
"""

from pathlib import Path

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent
RANKINGS = PROJECT_ROOT / "opportunity_rankings.csv"
ZILLOW_WIDE = PROJECT_ROOT / "zillow_data_ny_full.csv"
OUT = PROJECT_ROOT / "slide_assets" / "top_growing_zhvi_trend.png"

TOP_N = 5
MONTHS_BACK = 36  # ~3 years of monthly points


def _date_column_names(columns) -> list[str]:
    out = []
    for c in columns:
        s = str(c)
        if len(s) == 10 and s[2] == "-" and s[5] == "-":
            out.append(c)
    return out


def main() -> None:
    rank = pd.read_csv(RANKINGS)
    top = rank.nlargest(TOP_N, "predicted_growth")["county"].tolist()

    wide = pd.read_csv(ZILLOW_WIDE)
    id_vars = [c for c in wide.columns if c not in _date_column_names(wide.columns)]
    long = wide.melt(id_vars=id_vars, var_name="date_str", value_name="zhvi")
    long["date"] = pd.to_datetime(long["date_str"], format="%d-%m-%Y", errors="coerce")
    long = long.dropna(subset=["date", "zhvi"])

    county_col = "RegionName" if "RegionName" in long.columns else "county"
    long = long[long[county_col].isin(top)]

    end = long["date"].max()
    start = end - pd.DateOffset(months=MONTHS_BACK)
    long = long[long["date"] >= start].sort_values("date")

    fig, ax = plt.subplots(figsize=(12, 6))
    for county in top:
        sub = long[long[county_col] == county]
        if sub.empty:
            print(f"Warning: no monthly rows for {county}")
            continue
        short = county.replace(" County", "")
        ax.plot(sub["date"], sub["zhvi"], marker="o", markersize=3, linewidth=1.8, label=short)

    ax.set_xlabel("Month")
    ax.set_ylabel("ZHVI ($)")
    ax.set_title(
        f"Monthly ZHVI — top {TOP_N} counties by predicted growth "
        f"(last {MONTHS_BACK} months to {end.strftime('%Y-%m')})"
    )
    ax.legend(loc="best", fontsize=9)
    ax.grid(axis="y", alpha=0.3)
    ax.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    fig.autofmt_xdate(rotation=35)
    fig.tight_layout()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT, dpi=200, bbox_inches="tight")
    plt.close(fig)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()

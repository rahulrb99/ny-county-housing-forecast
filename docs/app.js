/* global Papa, Plotly, L */

const DATA_DIR = "./data";
const FORECAST_YEAR = 2025;
const VOL_MAX_YEAR = 2025;

const state = {
  modelRows: [],
  yearlyRows: [],
  volatilityByCounty: new Map(),
  countyStatsByCounty: new Map(),
  geojson: null,
  selectedCounty: null,
  scatter: {
    counties: [],
    x: [],
    y: [],
    xMedian: 0,
    yMedian: 0,
    pointIndexByCounty: new Map(),
  },
  map: {
    leaflet: null,
    layer: null,
    featureLayerByCounty: new Map(),
    growthRange: { min: 0, max: 0 },
  },
};

function normalizeCountyName(name) {
  if (!name) return "";
  let s = String(name).toLowerCase().trim();
  s = s.replace(/\s+county$/, "");
  s = s.replace(/^saint\s+/, "st ");
  s = s.replace(/\./g, "");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function formatPct(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

function formatPctPoints(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return `${x.toFixed(digits)}%`;
}

function formatNumber(x, digits = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return Number(x).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function parseCSV(text) {
  const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  if (parsed.errors?.length) {
    // eslint-disable-next-line no-console
    console.warn("CSV parse errors:", parsed.errors.slice(0, 3));
  }
  return parsed.data;
}

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status} ${res.statusText}`);
  return await res.text();
}

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status} ${res.statusText}`);
  return await res.json();
}

function computeVolatilityByCounty(yearlyRows) {
  // 1) build county->(year->zhvi)
  const map = new Map();
  for (const row of yearlyRows) {
    const year = Number(row.year);
    if (!Number.isFinite(year) || year > VOL_MAX_YEAR) continue;
    const county = row.county;
    if (!county) continue;
    const k = normalizeCountyName(county);
    if (!map.has(k)) map.set(k, new Map());
    map.get(k).set(year, Number(row.zhvi));
  }

  // 2) compute YoY returns and std dev (sample)
  const volByCounty = new Map();
  for (const [k, yearToZhvi] of map.entries()) {
    const years = Array.from(yearToZhvi.keys()).sort((a, b) => a - b);
    const returns = [];
    for (let i = 1; i < years.length; i++) {
      const yPrev = years[i - 1];
      const yCur = years[i];
      const zPrev = yearToZhvi.get(yPrev);
      const zCur = yearToZhvi.get(yCur);
      if (!Number.isFinite(zPrev) || !Number.isFinite(zCur) || zPrev === 0) continue;
      returns.push(zCur / zPrev - 1);
    }
    if (returns.length < 2) continue;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const varSample =
      returns.reduce((sum, r) => sum + (r - mean) * (r - mean), 0) / (returns.length - 1);
    volByCounty.set(k, Math.sqrt(varSample));
  }
  return volByCounty;
}

function buildCountyStats(modelRows, volatilityByCounty) {
  const stats = new Map();
  for (const row of modelRows) {
    if (Number(row.year) !== FORECAST_YEAR) continue;
    const county = row.county;
    if (!county) continue;
    const k = normalizeCountyName(county);
    const vol = volatilityByCounty.get(k);
    if (!Number.isFinite(vol)) continue;
    stats.set(k, { ...row, volatility: vol });
  }
  return stats;
}

function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  if (v.length % 2 === 1) return v[mid];
  return (v[mid - 1] + v[mid]) / 2;
}

function quadrantLabel(volPct, growthPct, xMed, yMed) {
  const risk = volPct <= xMed ? "Low risk" : "High risk";
  const reward = growthPct >= yMed ? "High reward" : "Low reward";
  return `${reward} / ${risk}`;
}

function quadrantColor(label) {
  // Keep consistent and readable on dark background.
  const colors = {
    "High reward / Low risk": "#35d07f",
    "High reward / High risk": "#59b7ff",
    "Low reward / Low risk": "#ffcc66",
    "Low reward / High risk": "#ff6b6b",
  };
  return colors[label] || "#b7c4e0";
}

function renderScatter() {
  const counties = [];
  const xVolPct = [];
  const yPredPct = [];
  const oppScore = [];

  for (const [k, row] of state.countyStatsByCounty.entries()) {
    counties.push(row.county);
    xVolPct.push(row.volatility * 100);
    yPredPct.push(row.predicted_growth * 100);
    oppScore.push(row.opportunity_score);
    state.scatter.pointIndexByCounty.set(k, counties.length - 1);
  }

  const xMed = median(xVolPct);
  const yMed = median(yPredPct);
  state.scatter = { ...state.scatter, counties, x: xVolPct, y: yPredPct, xMedian: xMed, yMedian: yMed };

  const labels = counties.map((c, idx) => quadrantLabel(xVolPct[idx], yPredPct[idx], xMed, yMed));
  const colors = labels.map((l) => quadrantColor(l));

  const trace = {
    type: "scatter",
    mode: "markers+text",
    x: xVolPct,
    y: yPredPct,
    text: counties.map((c) => c.replace(/ County$/, "")),
    textposition: "middle center",
    textfont: { size: 9, color: "rgba(233,238,248,0.90)" },
    marker: {
      size: 10,
      color: colors,
      line: { color: "rgba(255,255,255,0.65)", width: 1 },
      opacity: 0.85,
    },
    customdata: counties.map((c, idx) => ({
      county: c,
      volatilityPct: xVolPct[idx],
      predictedGrowthPct: yPredPct[idx],
      opportunityScore: oppScore[idx],
      quadrant: labels[idx],
    })),
    hovertemplate:
      "<b>%{customdata.county}</b><br>" +
      "Volatility: %{customdata.volatilityPct:.2f}% pts<br>" +
      "Predicted growth: %{customdata.predictedGrowthPct:.2f}%<br>" +
      "Opportunity score: %{customdata.opportunityScore:.4f}<br>" +
      "%{customdata.quadrant}<extra></extra>",
  };

  const layout = {
    margin: { l: 55, r: 20, t: 10, b: 55 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    xaxis: {
      title: "Historical volatility (std of YoY change, 2021–2025, % points)",
      gridcolor: "rgba(233,238,248,0.10)",
      zerolinecolor: "rgba(233,238,248,0.18)",
    },
    yaxis: {
      title: "Predicted 1-year growth (%)",
      gridcolor: "rgba(233,238,248,0.10)",
      zerolinecolor: "rgba(233,238,248,0.18)",
    },
    shapes: [
      {
        type: "line",
        x0: xMed,
        x1: xMed,
        y0: Math.min(...yPredPct) - 2,
        y1: Math.max(...yPredPct) + 2,
        line: { color: "rgba(233,238,248,0.35)", width: 1, dash: "dash" },
      },
      {
        type: "line",
        x0: Math.min(...xVolPct) - 1,
        x1: Math.max(...xVolPct) + 1,
        y0: yMed,
        y1: yMed,
        line: { color: "rgba(233,238,248,0.35)", width: 1, dash: "dash" },
      },
    ],
    showlegend: false,
  };

  const config = { responsive: true, displayModeBar: false };

  Plotly.newPlot("scatter", [trace], layout, config);

  const scatterDiv = document.getElementById("scatter");
  scatterDiv.on("plotly_click", (evt) => {
    const pt = evt?.points?.[0];
    if (!pt) return;
    const county = pt.customdata?.county;
    if (!county) return;
    selectCounty(county);
  });

  document.getElementById("scatterHint").textContent =
    "Tip: click a point to see county details and highlight it on the NY map.";
}

function growthColorScale(value, min, max) {
  if (!Number.isFinite(value)) return "#2b3a5a";
  const lo = min;
  const hi = max;
  const t = hi === lo ? 0.5 : Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  // HSL: red (0) -> green (130)
  const hue = 8 + t * 125;
  const sat = 80;
  const light = 45;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function renderMap() {
  const map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: false,
  }).setView([42.9, -75.5], 6.3);

  // Basemap (no key needed)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Determine growth range for choropleth.
  const growthValues = [];
  for (const row of state.countyStatsByCounty.values()) {
    if (Number.isFinite(row.predicted_growth)) growthValues.push(row.predicted_growth * 100);
  }
  const min = Math.min(...growthValues);
  const max = Math.max(...growthValues);
  state.map.growthRange = { min, max };

  function baseStyle(feature) {
    const name = `${feature?.properties?.NAME ?? ""} ${feature?.properties?.LSAD ?? ""}`.trim();
    const k = normalizeCountyName(name);
    const row = state.countyStatsByCounty.get(k);
    const value = row ? row.predicted_growth * 100 : NaN;
    return {
      fillColor: growthColorScale(value, min, max),
      weight: 1,
      opacity: 1,
      color: "rgba(255,255,255,0.35)",
      fillOpacity: 0.75,
    };
  }

  function onEachFeature(feature, layer) {
    const name = `${feature?.properties?.NAME ?? ""} ${feature?.properties?.LSAD ?? ""}`.trim();
    const k = normalizeCountyName(name);
    state.map.featureLayerByCounty.set(k, layer);

    const row = state.countyStatsByCounty.get(k);
    const predicted = row ? row.predicted_growth * 100 : null;
    layer.bindTooltip(
      `${name}<br/>Predicted growth: ${predicted === null ? "—" : predicted.toFixed(2) + "%"}`,
      { sticky: true }
    );

    layer.on("click", () => {
      if (row?.county) selectCounty(row.county);
      else selectCounty(name);
    });

    layer.on("mouseover", () => {
      layer.setStyle({ weight: 2, color: "rgba(255,255,255,0.7)" });
    });
    layer.on("mouseout", () => {
      if (normalizeCountyName(state.selectedCounty) === k) return;
      layer.setStyle({ weight: 1, color: "rgba(255,255,255,0.35)" });
    });
  }

  const layer = L.geoJSON(state.geojson, { style: baseStyle, onEachFeature }).addTo(map);
  state.map = { ...state.map, leaflet: map, layer };

  renderMapLegend(min, max);
}

function renderMapLegend(min, max) {
  const legend = document.getElementById("mapLegend");
  const steps = 6;
  const items = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const v = min + (max - min) * t;
    const color = growthColorScale(v, min, max);
    items.push(
      `<span class="swatch" style="background:${color};"></span>${v.toFixed(1)}%`
    );
  }
  legend.innerHTML =
    `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">` +
    `<span class="muted">Predicted growth scale:</span>` +
    items.join("") +
    `</div>`;
}

function updateScatterSelection(countyKey) {
  const idx = state.scatter.pointIndexByCounty.get(countyKey);
  if (idx === undefined) return;
  Plotly.restyle("scatter", {
    "marker.size": [state.scatter.x.map((_, i) => (i === idx ? 16 : 10))],
    "marker.opacity": [state.scatter.x.map((_, i) => (i === idx ? 1.0 : 0.75))],
  });
}

function updateMapSelection(countyKey) {
  for (const [k, layer] of state.map.featureLayerByCounty.entries()) {
    if (!layer?.setStyle) continue;
    const isSelected = k === countyKey;
    layer.setStyle({
      weight: isSelected ? 3 : 1,
      color: isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
      fillOpacity: isSelected ? 0.92 : 0.75,
    });
  }
}

function renderKPIs(row, volatility) {
  const kpis = document.getElementById("kpis");
  const predictedGrowth = row?.predicted_growth;
  const actualGrowth = row?.target_growth; // next-year actual growth (2026)

  const zhvi = row?.zhvi;
  const zhviNext = row?.zhvi_next;
  const predictedNext = row?.predicted_zhvi_next;
  const opp = row?.opportunity_score;

  const items = [
    {
      label: "Predicted growth (2025 → 2026)",
      value: formatPct(predictedGrowth, 2),
      sub: `Opportunity score: ${opp === null || opp === undefined ? "—" : Number(opp).toFixed(4)}`,
    },
    {
      label: "Actual growth (2025 → 2026)",
      value: formatPct(actualGrowth, 2),
      sub:
        predictedGrowth === null || predictedGrowth === undefined || actualGrowth === null || actualGrowth === undefined
          ? "—"
          : `Prediction error: ${(predictedGrowth - actualGrowth >= 0 ? "+" : "")}${((predictedGrowth - actualGrowth) * 100).toFixed(2)}% pts`,
    },
    {
      label: "Risk (volatility, 2021–2025)",
      value: formatPct(volatility, 2),
      sub: "Std dev of YoY ZHVI returns",
    },
    {
      label: "ZHVI level (2025)",
      value: `$${formatNumber(zhvi, 0)}`,
      sub: `Actual 2026: $${formatNumber(zhviNext, 0)} • Predicted 2026: $${formatNumber(predictedNext, 0)}`,
    },
  ];

  kpis.innerHTML = items
    .map(
      (it) =>
        `<div class="kpi"><div class="kpi__label">${it.label}</div><div class="kpi__value">${it.value}</div><div class="kpi__sub">${it.sub}</div></div>`
    )
    .join("");
}

function renderTrend(countyKey, row) {
  const countyName = row?.county || state.selectedCounty || "Selected county";
  const series = state.yearlyRows
    .filter((r) => normalizeCountyName(r.county) === countyKey)
    .map((r) => ({ year: Number(r.year), zhvi: Number(r.zhvi) }))
    .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.zhvi))
    .sort((a, b) => a.year - b.year);

  const years = series.map((p) => p.year);
  const zhvi = series.map((p) => p.zhvi);

  const predictedNext = Number(row?.predicted_zhvi_next);
  const nextYear = FORECAST_YEAR + 1;

  const traces = [
    {
      type: "scatter",
      mode: "lines+markers",
      x: years,
      y: zhvi,
      name: "Actual ZHVI",
      line: { color: "rgba(233,238,248,0.85)", width: 2 },
      marker: { size: 6, color: "rgba(233,238,248,0.9)" },
      hovertemplate: "%{x}: $%{y:,.0f}<extra></extra>",
    },
  ];

  if (Number.isFinite(predictedNext)) {
    traces.push({
      type: "scatter",
      mode: "markers+text",
      x: [nextYear],
      y: [predictedNext],
      name: "Predicted 2026",
      marker: { size: 12, color: "#59b7ff", line: { color: "white", width: 1 } },
      text: ["Predicted"],
      textposition: "top center",
      textfont: { size: 10, color: "rgba(89,183,255,0.95)" },
      hovertemplate: `Predicted ${nextYear}: $%{y:,.0f}<extra></extra>`,
    });
  }

  const layout = {
    margin: { l: 55, r: 20, t: 10, b: 40 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    xaxis: { title: "Year", dtick: 1, gridcolor: "rgba(233,238,248,0.10)" },
    yaxis: { title: "ZHVI ($)", gridcolor: "rgba(233,238,248,0.10)" },
    showlegend: true,
    legend: { orientation: "h", y: -0.25, font: { color: "rgba(233,238,248,0.85)" } },
    annotations: [
      {
        x: 0,
        y: 1.1,
        xref: "paper",
        yref: "paper",
        showarrow: false,
        text: `<b>${countyName}</b>`,
        font: { color: "rgba(233,238,248,0.92)" },
      },
    ],
  };
  const config = { responsive: true, displayModeBar: false };
  Plotly.newPlot("trend", traces, layout, config);
}

function selectCounty(countyName) {
  const countyKey = normalizeCountyName(countyName);
  const row = state.countyStatsByCounty.get(countyKey);
  if (!row) {
    // eslint-disable-next-line no-console
    console.warn("No model row found for county:", countyName);
    return;
  }

  state.selectedCounty = row.county;
  document.getElementById("selectedCountyLabel").textContent = row.county;

  updateScatterSelection(countyKey);
  updateMapSelection(countyKey);
  renderKPIs(row, row.volatility);
  renderTrend(countyKey, row);
}

async function main() {
  const [modelText, yearlyText, geojson] = await Promise.all([
    fetchText(`${DATA_DIR}/model_dataset.csv`),
    fetchText(`${DATA_DIR}/zillow_county_yearly.csv`),
    fetchJSON(`${DATA_DIR}/ny_counties.geojson`),
  ]);

  state.modelRows = parseCSV(modelText);
  state.yearlyRows = parseCSV(yearlyText);
  state.geojson = geojson;

  state.volatilityByCounty = computeVolatilityByCounty(state.yearlyRows);
  state.countyStatsByCounty = buildCountyStats(state.modelRows, state.volatilityByCounty);

  renderScatter();
  renderMap();

  // Pick a sensible default selection: highest predicted growth.
  let best = null;
  for (const row of state.countyStatsByCounty.values()) {
    if (!best || row.predicted_growth > best.predicted_growth) best = row;
  }
  if (best?.county) selectCounty(best.county);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const label = document.getElementById("selectedCountyLabel");
  if (label) label.textContent = "Error loading data";
  const kpis = document.getElementById("kpis");
  if (kpis) {
    kpis.innerHTML =
      `<div class="kpi"><div class="kpi__label">Load error</div><div class="kpi__value">Check console</div><div class="kpi__sub">${String(
        err?.message || err
      )}</div></div>`;
  }
});


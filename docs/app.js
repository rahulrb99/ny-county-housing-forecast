/* global Papa, Plotly, L */

const DATA_DIR = "./data";
const FORECAST_YEAR = 2025;
const VOL_MAX_YEAR = 2025;

const FILTERS = [
  { id: "undervalued", label: "Undervalued" },
  { id: "highAppreciation", label: "High Appreciation" },
  { id: "lowerVolatility", label: "Lower Volatility" },
  { id: "youngBuyer", label: "Young Buyer Signal" },
  { id: "rentalDemand", label: "Rental Demand Signal" },
];

const state = {
  modelRows: [],
  yearlyRows: [],
  geojson: null,
  volatilityByCounty: new Map(),
  countyStatsByCounty: new Map(),
  selectedCounty: null,
  showAllLabels: false,
  activeFilters: new Set(),
  medians: {},
  topTargets: [],
  scatter: {
    counties: [],
    x: [],
    y: [],
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

function shortCountyLabel(name) {
  return String(name || "").replace(/\s+County$/, "").trim();
}

function parseCSV(text) {
  const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  if (parsed.errors?.length) console.warn("CSV parse errors:", parsed.errors.slice(0, 3));
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

function formatPct(x, digits = 2) {
  if (!Number.isFinite(Number(x))) return "-";
  return `${(Number(x) * 100).toFixed(digits)}%`;
}

function formatPctPoints(x, digits = 2) {
  if (!Number.isFinite(Number(x))) return "-";
  return `${Number(x).toFixed(digits)}%`;
}

function formatNumber(x, digits = 0) {
  if (!Number.isFinite(Number(x))) return "-";
  return Number(x).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function median(values) {
  const v = values.filter((x) => Number.isFinite(Number(x))).map(Number).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function computeVolatilityByCounty(yearlyRows) {
  const byCounty = new Map();
  for (const row of yearlyRows) {
    const year = Number(row.year);
    if (!Number.isFinite(year) || year > VOL_MAX_YEAR) continue;
    const key = normalizeCountyName(row.county);
    if (!key) continue;
    if (!byCounty.has(key)) byCounty.set(key, new Map());
    byCounty.get(key).set(year, Number(row.zhvi));
  }

  const volatility = new Map();
  for (const [key, yearToZhvi] of byCounty.entries()) {
    const years = Array.from(yearToZhvi.keys()).sort((a, b) => a - b);
    const returns = [];
    for (let i = 1; i < years.length; i++) {
      const prev = yearToZhvi.get(years[i - 1]);
      const cur = yearToZhvi.get(years[i]);
      if (Number.isFinite(prev) && Number.isFinite(cur) && prev !== 0) returns.push(cur / prev - 1);
    }
    if (returns.length < 2) continue;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const sampleVar = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
    volatility.set(key, Math.sqrt(sampleVar));
  }
  return volatility;
}

function buildCountyStats(modelRows, volatilityByCounty) {
  const stats = new Map();
  for (const row of modelRows) {
    if (Number(row.year) !== FORECAST_YEAR) continue;
    const key = normalizeCountyName(row.county);
    const vol = volatilityByCounty.get(key);
    if (!key || !Number.isFinite(vol)) continue;
    stats.set(key, { ...row, volatility: vol });
  }
  return stats;
}

function computeDerivedMetrics() {
  const rows = Array.from(state.countyStatsByCounty.values());
  state.medians = {
    zhvi: median(rows.map((r) => r.zhvi)),
    appreciation: median(rows.map((r) => r.predicted_growth)),
    volatility: median(rows.map((r) => r.volatility)),
    age25_34: median(rows.map((r) => r.pct_age_25_34)),
    rent: median(rows.map((r) => r.median_rent)),
  };
  state.topTargets = rows
    .slice()
    .sort((a, b) => Number(b.opportunity_score) - Number(a.opportunity_score))
    .slice(0, 5);
}

function getBadges(row) {
  const badges = [];
  if (Number(row.zhvi) < state.medians.zhvi) badges.push({ id: "undervalued", label: "Affordable Entry" });
  if (Number(row.predicted_growth) > state.medians.appreciation) badges.push({ id: "highAppreciation", label: "High Appreciation" });
  if (Number(row.volatility) < state.medians.volatility) badges.push({ id: "lowerVolatility", label: "Lower Volatility" });
  if (Number(row.pct_age_25_34) > state.medians.age25_34) badges.push({ id: "youngBuyer", label: "Young Buyer Signal" });
  if (Number(row.median_rent) > state.medians.rent) badges.push({ id: "rentalDemand", label: "Rental Demand Signal" });
  return badges;
}

function passesFilters(row) {
  if (!state.activeFilters.size) return true;
  const badgeIds = new Set(getBadges(row).map((b) => b.id));
  return Array.from(state.activeFilters).every((id) => badgeIds.has(id));
}

function visibleRows() {
  const selectedKey = normalizeCountyName(state.selectedCounty || "");
  return Array.from(state.countyStatsByCounty.values()).filter((row) => {
    return passesFilters(row) || normalizeCountyName(row.county) === selectedKey;
  });
}

function quadrantLabel(volPct, appreciationPct) {
  const lowRisk = volPct <= state.medians.volatility * 100;
  const highAppreciation = appreciationPct >= state.medians.appreciation * 100;
  if (highAppreciation && lowRisk) return "Best Flip Targets";
  if (highAppreciation && !lowRisk) return "Speculative Upside";
  if (!highAppreciation && lowRisk) return "Stable but Slow";
  return "Low Priority / Avoid";
}

function quadrantColor(label) {
  const colors = {
    "Best Flip Targets": "#35d07f",
    "Speculative Upside": "#59b7ff",
    "Stable but Slow": "#ffcc66",
    "Low Priority / Avoid": "#ff6b6b",
  };
  return colors[label] || "#b7c4e0";
}

function rowByCounty(county) {
  return state.countyStatsByCounty.get(normalizeCountyName(county));
}

function renderTargetCards() {
  const el = document.getElementById("targetCards");
  el.innerHTML = state.topTargets
    .map((row, index) => {
      const active = normalizeCountyName(row.county) === normalizeCountyName(state.selectedCounty);
      return `
        <button class="target-card ${active ? "is-selected" : ""}" data-county="${row.county}">
          <span class="target-card__rank">#${index + 1}</span>
          <span class="target-card__county">${shortCountyLabel(row.county)}</span>
          <span class="target-card__grid">
            <span class="target-card__metric"><span>2025 value</span><strong>$${formatNumber(row.zhvi, 0)}</strong></span>
            <span class="target-card__metric"><span>12M appreciation</span><strong>${formatPct(row.predicted_growth, 1)}</strong></span>
            <span class="target-card__metric"><span>Opportunity</span><strong>${Number(row.opportunity_score).toFixed(3)}</strong></span>
            <span class="target-card__metric"><span>Risk</span><strong>${formatPct(row.volatility, 1)}</strong></span>
          </span>
        </button>`;
    })
    .join("");

  el.querySelectorAll("[data-county]").forEach((button) => {
    button.addEventListener("click", () => selectCounty(button.dataset.county));
  });
}

function renderFilters() {
  const el = document.getElementById("filterButtons");
  el.innerHTML = FILTERS.map((filter) => {
    const active = state.activeFilters.has(filter.id);
    return `<button class="filter-button ${active ? "is-active" : ""}" data-filter="${filter.id}">${filter.label}</button>`;
  }).join("");
  el.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.filter;
      if (state.activeFilters.has(id)) state.activeFilters.delete(id);
      else state.activeFilters.add(id);
      refreshFilteredViews();
    });
  });
}

function renderDemoControls() {
  const el = document.getElementById("demoControls");
  const risky = Array.from(state.countyStatsByCounty.values())
    .filter((row) => row.volatility > state.medians.volatility && row.predicted_growth < state.medians.appreciation)
    .sort((a, b) => b.volatility - a.volatility)[0];
  const controls = [
    { label: "Show Top Target", action: () => selectCounty(state.topTargets[0]?.county) },
    { label: "Show Broome", action: () => selectCounty("Broome County") },
    { label: "Show Cortland", action: () => selectCounty("Cortland County") },
    { label: "High Risk Example", action: () => risky && selectCounty(risky.county) },
    {
      label: "Reset Filters",
      action: () => {
        state.activeFilters.clear();
        refreshFilteredViews();
      },
    },
  ];

  el.innerHTML = controls.map((c, i) => `<button class="demo-button" data-demo="${i}">${c.label}</button>`).join("");
  el.querySelectorAll("[data-demo]").forEach((button) => {
    button.addEventListener("click", () => controls[Number(button.dataset.demo)]?.action());
  });
}

function setupHeaderControls() {
  const list = document.getElementById("countyList");
  if (list) {
    list.innerHTML = Array.from(state.countyStatsByCounty.values())
      .map((r) => r.county)
      .sort((a, b) => a.localeCompare(b))
      .map((county) => `<option value="${county}"></option>`)
      .join("");
  }

  const search = document.getElementById("countySearch");
  if (search) {
    const onCommit = () => {
      const value = String(search.value || "").trim();
      if (!value) return;
      const direct = rowByCounty(value);
      if (direct) return selectCounty(direct.county);
      const hit = Array.from(state.countyStatsByCounty.values()).find((row) =>
        normalizeCountyName(row.county).includes(normalizeCountyName(value))
      );
      if (hit) selectCounty(hit.county);
    };
    search.addEventListener("change", onCommit);
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onCommit();
      if (e.key === "Escape") search.value = "";
    });
  }

  const toggle = document.getElementById("toggleLabels");
  if (toggle) {
    toggle.checked = Boolean(state.showAllLabels);
    toggle.addEventListener("change", () => {
      state.showAllLabels = Boolean(toggle.checked);
      applyScatterLabelMode();
    });
  }
}

function renderScatter() {
  const rows = visibleRows();
  const counties = [];
  const xVolPct = [];
  const yPredPct = [];
  const oppScore = [];
  state.scatter.pointIndexByCounty = new Map();

  for (const row of rows) {
    const key = normalizeCountyName(row.county);
    counties.push(row.county);
    xVolPct.push(row.volatility * 100);
    yPredPct.push(row.predicted_growth * 100);
    oppScore.push(row.opportunity_score);
    state.scatter.pointIndexByCounty.set(key, counties.length - 1);
  }

  const xMed = state.medians.volatility * 100;
  const yMed = state.medians.appreciation * 100;
  const xMin = Math.min(...xVolPct, xMed) - 1;
  const xMax = Math.max(...xVolPct, xMed) + 1;
  const yMin = Math.min(...yPredPct, yMed) - 2;
  const yMax = Math.max(...yPredPct, yMed) + 2;
  const labels = counties.map((c, idx) => quadrantLabel(xVolPct[idx], yPredPct[idx]));

  state.scatter = { ...state.scatter, counties, x: xVolPct, y: yPredPct };

  const trace = {
    type: "scatter",
    mode: "markers+text",
    x: xVolPct,
    y: yPredPct,
    text: counties.map(() => ""),
    textposition: "middle center",
    textfont: { size: 9, color: "rgba(233,238,248,0.90)" },
    marker: {
      size: 10,
      color: labels.map((label) => quadrantColor(label)),
      line: { color: "rgba(255,255,255,0.65)", width: 1 },
      opacity: 0.86,
    },
    customdata: counties.map((county, idx) => ({
      county,
      volatilityPct: xVolPct[idx],
      predictedAppreciationPct: yPredPct[idx],
      opportunityScore: oppScore[idx],
      quadrant: labels[idx],
    })),
    hovertemplate:
      "<b>%{customdata.county}</b><br>" +
      "Risk / volatility: %{customdata.volatilityPct:.2f}% pts<br>" +
      "Predicted 12M Appreciation: %{customdata.predictedAppreciationPct:.2f}%<br>" +
      "Opportunity score: %{customdata.opportunityScore:.4f}<br>" +
      "%{customdata.quadrant}<extra></extra>",
  };

  const layout = {
    margin: { l: 58, r: 20, t: 10, b: 58 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    hovermode: "closest",
    xaxis: {
      title: "Risk / Volatility (std of YoY change, 2021-2025, % points)",
      gridcolor: "rgba(233,238,248,0.10)",
      zerolinecolor: "rgba(233,238,248,0.18)",
    },
    yaxis: {
      title: "Predicted 12M Appreciation (%)",
      gridcolor: "rgba(233,238,248,0.10)",
      zerolinecolor: "rgba(233,238,248,0.18)",
    },
    shapes: [
      { type: "line", x0: xMed, x1: xMed, y0: yMin, y1: yMax, line: { color: "rgba(233,238,248,0.35)", width: 1, dash: "dash" } },
      { type: "line", x0: xMin, x1: xMax, y0: yMed, y1: yMed, line: { color: "rgba(233,238,248,0.35)", width: 1, dash: "dash" } },
    ],
    showlegend: false,
  };

  Plotly.newPlot("scatter", [trace], layout, { responsive: true, displayModeBar: false });
  document.getElementById("scatter").on("plotly_click", (evt) => {
    const county = evt?.points?.[0]?.customdata?.county;
    if (county) selectCounty(county);
  });

  document.getElementById("scatterHint").textContent =
    "Tip: hover for acquisition metrics, click to inspect. Active filters keep the selected county visible.";
  applyScatterLabelMode();
}

function applyScatterLabelMode() {
  if (!document.getElementById("scatter")?.data) return;
  const selectedKey = normalizeCountyName(state.selectedCounty || "");
  const selectedIdx = selectedKey ? state.scatter.pointIndexByCounty.get(selectedKey) : undefined;
  const text = state.scatter.counties.map((county, idx) => {
    if (state.showAllLabels) return shortCountyLabel(county);
    if (selectedIdx !== undefined && idx === selectedIdx) return shortCountyLabel(county);
    return "";
  });
  Plotly.restyle("scatter", { text: [text], "textfont.size": state.showAllLabels ? 8 : 10 });
}

function growthColorScale(value, min, max) {
  if (!Number.isFinite(value)) return "#2b3a5a";
  const t = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const hue = 8 + t * 125;
  return `hsl(${hue} 80% 45%)`;
}

function renderMap() {
  const map = L.map("map", { zoomControl: true, scrollWheelZoom: false }).setView([42.9, -75.5], 6.3);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const values = Array.from(state.countyStatsByCounty.values()).map((row) => row.predicted_growth * 100);
  const min = Math.min(...values);
  const max = Math.max(...values);
  state.map.growthRange = { min, max };

  function styleFeature(feature) {
    const name = `${feature?.properties?.NAME ?? ""} ${feature?.properties?.LSAD ?? ""}`.trim();
    const row = rowByCounty(name);
    return mapStyleForRow(row);
  }

  function onEachFeature(feature, layer) {
    const name = `${feature?.properties?.NAME ?? ""} ${feature?.properties?.LSAD ?? ""}`.trim();
    const key = normalizeCountyName(name);
    state.map.featureLayerByCounty.set(key, layer);
    const row = rowByCounty(name);
    const appreciation = row ? row.predicted_growth * 100 : null;
    layer.bindTooltip(
      `${name}<br/>Predicted 12M Appreciation: ${appreciation === null ? "-" : appreciation.toFixed(2) + "%"}`,
      { sticky: true }
    );
    layer.on("click", () => row?.county && selectCounty(row.county));
    layer.on("mouseover", () => layer.setStyle({ weight: 2, color: "rgba(255,255,255,0.8)" }));
    layer.on("mouseout", () => refreshMapStyles());
  }

  state.map.layer = L.geoJSON(state.geojson, { style: styleFeature, onEachFeature }).addTo(map);
  state.map.leaflet = map;
  renderMapLegend(min, max);
}

function mapStyleForRow(row) {
  const selected = row && normalizeCountyName(row.county) === normalizeCountyName(state.selectedCounty);
  const visible = row ? passesFilters(row) || selected : false;
  return {
    fillColor: growthColorScale(row ? row.predicted_growth * 100 : NaN, state.map.growthRange.min, state.map.growthRange.max),
    weight: selected ? 3 : 1,
    opacity: 1,
    color: selected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
    fillOpacity: selected ? 0.92 : visible ? 0.75 : 0.14,
  };
}

function refreshMapStyles() {
  for (const [key, layer] of state.map.featureLayerByCounty.entries()) {
    const row = state.countyStatsByCounty.get(key);
    if (layer?.setStyle) layer.setStyle(mapStyleForRow(row));
  }
}

function renderMapLegend(min, max) {
  const legend = document.getElementById("mapLegend");
  const steps = 6;
  const items = [];
  for (let i = 0; i < steps; i++) {
    const value = min + (max - min) * (i / (steps - 1));
    items.push(`<span class="swatch" style="background:${growthColorScale(value, min, max)};"></span>${value.toFixed(1)}%`);
  }
  legend.innerHTML = `<div class="legend-row"><span class="muted">Predicted 12M Appreciation:</span>${items.join("")}</div>`;
}

function updateScatterSelection(countyKey) {
  const idx = state.scatter.pointIndexByCounty.get(countyKey);
  if (idx === undefined) return;
  Plotly.restyle("scatter", {
    "marker.size": [state.scatter.x.map((_, i) => (i === idx ? 16 : 10))],
    "marker.opacity": [state.scatter.x.map((_, i) => (i === idx ? 1.0 : 0.75))],
  });
  applyScatterLabelMode();
}

function renderKPIs(row) {
  const predictedGrowth = Number(row.predicted_growth);
  const actualGrowth = Number(row.target_growth);
  const error = predictedGrowth - actualGrowth;
  const items = [
    {
      label: "Predicted 12M Appreciation",
      value: formatPct(predictedGrowth, 2),
      sub: `Opportunity score: ${Number(row.opportunity_score).toFixed(4)}`,
    },
    {
      label: "Backtest Check",
      value: formatPct(actualGrowth, 2),
      sub: Number.isFinite(error) ? `Prediction error: ${(error >= 0 ? "+" : "")}${(error * 100).toFixed(2)}% pts` : "-",
    },
    {
      label: "Risk / Volatility",
      value: formatPct(row.volatility, 2),
      sub: "Std dev of YoY home value returns",
    },
    {
      label: "Current Entry Price",
      value: `$${formatNumber(row.zhvi, 0)}`,
      sub: `Actual 2026: $${formatNumber(row.zhvi_next, 0)} | Predicted 2026: $${formatNumber(row.predicted_zhvi_next, 0)}`,
    },
  ];
  document.getElementById("kpis").innerHTML = items
    .map((it) => `<div class="kpi"><div class="kpi__label">${it.label}</div><div class="kpi__value">${it.value}</div><div class="kpi__sub">${it.sub}</div></div>`)
    .join("");
}

function renderFit(row) {
  const badges = getBadges(row);
  document.getElementById("fitBadges").innerHTML = badges.length
    ? badges.map((b) => `<span class="fit-badge fit-badge--${b.id}">${b.label}</span>`).join("")
    : `<span class="fit-badge">No above-median target signals</span>`;

  const reasons = [];
  reasons.push(
    Number(row.zhvi) < state.medians.zhvi
      ? "below-median entry price"
      : "above-median entry price"
  );
  reasons.push(
    Number(row.predicted_growth) > state.medians.appreciation
      ? "above-median predicted appreciation"
      : "below-median predicted appreciation"
  );
  reasons.push(
    Number(row.volatility) < state.medians.volatility
      ? "lower-than-median volatility"
      : "higher-than-median volatility"
  );

  document.getElementById("whyCounty").innerHTML =
    `<strong>Why this county?</strong> ${shortCountyLabel(row.county)} combines ${reasons.join(", ")}. ` +
    `Use this as a county-level screen before deal-level underwriting.`;
}

function renderTrend(countyKey, row) {
  const series = state.yearlyRows
    .filter((r) => normalizeCountyName(r.county) === countyKey)
    .map((r) => ({ year: Number(r.year), zhvi: Number(r.zhvi) }))
    .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.zhvi))
    .sort((a, b) => a.year - b.year);
  const years = series.map((p) => p.year);
  const zhvi = series.map((p) => p.zhvi);
  const nextYear = FORECAST_YEAR + 1;
  const predictedNext = Number(row.predicted_zhvi_next);

  const traces = [
    {
      type: "scatter",
      mode: "lines+markers",
      x: years,
      y: zhvi,
      name: "Actual home value",
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
      text: ["Forecast"],
      textposition: "top center",
      textfont: { size: 10, color: "rgba(89,183,255,0.95)" },
      hovertemplate: `Predicted ${nextYear}: $%{y:,.0f}<extra></extra>`,
    });
  }

  Plotly.newPlot(
    "trend",
    traces,
    {
      margin: { l: 55, r: 20, t: 10, b: 40 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      xaxis: { title: "Year", dtick: 1, gridcolor: "rgba(233,238,248,0.10)" },
      yaxis: { title: "Home value ($)", gridcolor: "rgba(233,238,248,0.10)" },
      showlegend: true,
      legend: { orientation: "h", y: -0.25, font: { color: "rgba(233,238,248,0.85)" } },
      annotations: [
        { x: 0, y: 1.1, xref: "paper", yref: "paper", showarrow: false, text: `<b>${row.county}</b>`, font: { color: "rgba(233,238,248,0.92)" } },
      ],
    },
    { responsive: true, displayModeBar: false }
  );
}

function refreshFilteredViews() {
  renderFilters();
  renderScatter();
  refreshMapStyles();
  updateScatterSelection(normalizeCountyName(state.selectedCounty || ""));
}

function selectCounty(countyName) {
  const row = rowByCounty(countyName);
  if (!row) return console.warn("No model row found for county:", countyName);
  const countyKey = normalizeCountyName(row.county);
  state.selectedCounty = row.county;
  document.getElementById("selectedCountyLabel").textContent = row.county;
  const search = document.getElementById("countySearch");
  if (search) search.value = row.county;

  if (!state.scatter.pointIndexByCounty.has(countyKey)) renderScatter();
  updateScatterSelection(countyKey);
  refreshMapStyles();
  renderKPIs(row);
  renderFit(row);
  renderTrend(countyKey, row);
  renderTargetCards();
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
  computeDerivedMetrics();

  setupHeaderControls();
  renderTargetCards();
  renderFilters();
  renderDemoControls();
  renderScatter();
  renderMap();

  if (state.topTargets[0]?.county) selectCounty(state.topTargets[0].county);
}

main().catch((err) => {
  console.error(err);
  const label = document.getElementById("selectedCountyLabel");
  if (label) label.textContent = "Error loading data";
  const kpis = document.getElementById("kpis");
  if (kpis) {
    kpis.innerHTML = `<div class="kpi"><div class="kpi__label">Load error</div><div class="kpi__value">Check console</div><div class="kpi__sub">${String(
      err?.message || err
    )}</div></div>`;
  }
});

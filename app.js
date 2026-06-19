const MAP_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const STORAGE_KEY = "world-map-coloring-state-v1";
const DEFAULT_FILL = "#eef3f8";
const WIDTH = 1200;
const HEIGHT = 680;

const paletteColors = [
  "#ef4444", "#f97316", "#facc15", "#22c55e",
  "#14b8a6", "#38bdf8", "#5b8def", "#8b5cf6",
  "#ec4899", "#a855f7", "#64748b", "#111827",
  "#ffffff", "#fde68a", "#bbf7d0", "#fecaca"
];

const state = {
  mode: "paint",
  selectedColor: "#5b8def",
  colorsById: new Map(),
  countries: [],
  focusedCountryId: null
};

const els = {
  svg: d3.select("#worldMap"),
  mapLayer: d3.select("#mapLayer"),
  colorPicker: document.querySelector("#colorPicker"),
  palette: document.querySelector("#palette"),
  paintModeBtn: document.querySelector("#paintModeBtn"),
  eraseModeBtn: document.querySelector("#eraseModeBtn"),
  pickModeBtn: document.querySelector("#pickModeBtn"),
  resetViewBtn: document.querySelector("#resetViewBtn"),
  countrySearch: document.querySelector("#countrySearch"),
  countryInfo: document.querySelector("#countryInfo"),
  statusText: document.querySelector("#statusText"),
  modeText: document.querySelector("#modeText"),
  downloadSvgBtn: document.querySelector("#downloadSvgBtn"),
  downloadPngBtn: document.querySelector("#downloadPngBtn"),
  saveStateBtn: document.querySelector("#saveStateBtn"),
  loadStateBtn: document.querySelector("#loadStateBtn"),
  exportJsonBtn: document.querySelector("#exportJsonBtn"),
  importJsonInput: document.querySelector("#importJsonInput"),
  clearBtn: document.querySelector("#clearBtn"),
  toastTemplate: document.querySelector("#toastTemplate"),
  toastStack: document.querySelector("#toastStack")
};

const projection = d3.geoNaturalEarth1()
  .scale(215)
  .translate([WIDTH / 2, HEIGHT / 2 + 28]);
const pathGenerator = d3.geoPath(projection);

const zoom = d3.zoom()
  .scaleExtent([1, 8])
  .translateExtent([[-200, -120], [WIDTH + 200, HEIGHT + 120]])
  .on("zoom", (event) => {
    els.mapLayer.attr("transform", event.transform);
  });

els.svg.call(zoom);

init();

async function init() {
  createPalette();
  bindEvents();
  await loadMap();
  loadSavedState({ silent: true });
}

function createPalette() {
  els.palette.innerHTML = "";
  paletteColors.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.style.backgroundColor = color;
    button.title = color;
    button.setAttribute("aria-label", `${color}を選択`);
    if (color.toLowerCase() === state.selectedColor.toLowerCase()) {
      button.classList.add("selected");
    }
    button.addEventListener("click", () => setSelectedColor(color));
    els.palette.appendChild(button);
  });
}

function bindEvents() {
  els.colorPicker.addEventListener("input", (event) => setSelectedColor(event.target.value));
  els.paintModeBtn.addEventListener("click", () => setMode("paint"));
  els.eraseModeBtn.addEventListener("click", () => setMode("erase"));
  els.pickModeBtn.addEventListener("click", () => setMode("pick"));
  els.resetViewBtn.addEventListener("click", resetView);
  els.countrySearch.addEventListener("input", handleSearch);
  els.downloadSvgBtn.addEventListener("click", downloadSvg);
  els.downloadPngBtn.addEventListener("click", downloadPng);
  els.saveStateBtn.addEventListener("click", saveState);
  els.loadStateBtn.addEventListener("click", () => loadSavedState({ silent: false }));
  els.exportJsonBtn.addEventListener("click", exportJson);
  els.importJsonInput.addEventListener("change", importJson);
  els.clearBtn.addEventListener("click", clearAllColors);
}

async function loadMap() {
  try {
    const topology = await d3.json(MAP_URL);
    state.countries = topojson.feature(topology, topology.objects.countries).features
      .filter((feature) => feature.geometry)
      .sort((a, b) => getCountryName(a).localeCompare(getCountryName(b)));

    els.mapLayer.selectAll("path")
      .data(state.countries, (d) => getCountryId(d))
      .join("path")
      .attr("class", "country")
      .attr("d", pathGenerator)
      .attr("data-id", (d) => getCountryId(d))
      .attr("data-name", (d) => getCountryName(d))
      .attr("fill", (d) => state.colorsById.get(getCountryId(d)) || DEFAULT_FILL)
      .on("click", (event, country) => handleCountryClick(country))
      .on("mouseenter", (event, country) => showCountryInfo(country))
      .on("mouseleave", () => {
        if (!state.focusedCountryId) {
          els.countryInfo.textContent = "国をクリックするとここに表示されます。";
        }
      });

    els.statusText.textContent = `${state.countries.length}の国・地域を読み込みました`;
  } catch (error) {
    console.error(error);
    els.statusText.textContent = "地図データの読み込みに失敗しました";
    showToast("地図データを読み込めませんでした。インターネット接続を確認してください。");
  }
}

function handleCountryClick(country) {
  const id = getCountryId(country);
  const name = getCountryName(country);

  if (state.mode === "pick") {
    const picked = state.colorsById.get(id) || DEFAULT_FILL;
    setSelectedColor(picked);
    setMode("paint");
    showToast(`${name}の色 ${picked} を選択しました`);
    return;
  }

  if (state.mode === "erase") {
    state.colorsById.delete(id);
  } else {
    state.colorsById.set(id, state.selectedColor);
  }

  state.focusedCountryId = id;
  updateCountryStyles();
  showCountryInfo(country);
}

function showCountryInfo(country) {
  const id = getCountryId(country);
  const name = getCountryName(country);
  const color = state.colorsById.get(id) || DEFAULT_FILL;
  els.countryInfo.innerHTML = `
    <strong>${escapeHtml(name)}</strong><br>
    ID: ${escapeHtml(id)}<br>
    色: <code>${escapeHtml(color)}</code>
  `;
}

function setSelectedColor(color) {
  state.selectedColor = color;
  els.colorPicker.value = color;
  document.querySelectorAll(".swatch").forEach((swatch) => {
    swatch.classList.toggle(
      "selected",
      rgbToHex(swatch.style.backgroundColor).toLowerCase() === color.toLowerCase()
    );
  });
}

function setMode(mode) {
  state.mode = mode;
  els.paintModeBtn.classList.toggle("active", mode === "paint");
  els.eraseModeBtn.classList.toggle("active", mode === "erase");
  els.pickModeBtn.classList.toggle("active", mode === "pick");
  const label = mode === "paint" ? "塗る" : mode === "erase" ? "消す" : "色を拾う";
  els.modeText.textContent = `モード: ${label}`;
}

function handleSearch(event) {
  const query = event.target.value.trim().toLowerCase();
  if (!query) {
    state.focusedCountryId = null;
    updateCountryStyles();
    els.countryInfo.textContent = "国をクリックするとここに表示されます。";
    return;
  }

  const matched = state.countries.find((country) => getCountryName(country).toLowerCase().includes(query));
  state.focusedCountryId = matched ? getCountryId(matched) : null;
  updateCountryStyles(query);

  if (matched) {
    showCountryInfo(matched);
    zoomToCountry(matched);
  } else {
    els.countryInfo.textContent = "該当する国が見つかりません。英語名で検索してください。";
  }
}

function updateCountryStyles(query = "") {
  els.mapLayer.selectAll(".country")
    .attr("fill", (d) => state.colorsById.get(getCountryId(d)) || DEFAULT_FILL)
    .classed("focused", (d) => getCountryId(d) === state.focusedCountryId)
    .classed("dimmed", (d) => query && !getCountryName(d).toLowerCase().includes(query.toLowerCase()));
}

function zoomToCountry(country) {
  const [[x0, y0], [x1, y1]] = pathGenerator.bounds(country);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const x = (x0 + x1) / 2;
  const y = (y0 + y1) / 2;
  const scale = Math.max(1, Math.min(5, 0.82 / Math.max(dx / WIDTH, dy / HEIGHT)));
  const translate = [WIDTH / 2 - scale * x, HEIGHT / 2 - scale * y];

  els.svg.transition()
    .duration(550)
    .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
}

function resetView() {
  state.focusedCountryId = null;
  els.countrySearch.value = "";
  updateCountryStyles();
  els.svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
  showToast("配色をブラウザに保存しました");
}

function loadSavedState({ silent }) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    if (!silent) showToast("保存された配色がありません");
    return;
  }

  try {
    applySerializedState(JSON.parse(raw));
    if (!silent) showToast("保存済みの配色を復元しました");
  } catch (error) {
    console.error(error);
    showToast("保存データの読み込みに失敗しました");
  }
}

function serializeState() {
  return {
    version: 1,
    selectedColor: state.selectedColor,
    colorsById: Object.fromEntries(state.colorsById)
  };
}

function applySerializedState(data) {
  state.colorsById = new Map(Object.entries(data.colorsById || {}));
  setSelectedColor(data.selectedColor || state.selectedColor);
  updateCountryStyles();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(serializeState(), null, 2)], { type: "application/json" });
  downloadBlob(blob, "world-map-colors.json");
}

function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      applySerializedState(data);
      showToast("JSONから配色を読み込みました");
    } catch (error) {
      console.error(error);
      showToast("JSONを読み込めませんでした");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function clearAllColors() {
  const ok = confirm("すべての国の色をクリアしますか？");
  if (!ok) return;
  state.colorsById.clear();
  updateCountryStyles();
  showToast("すべての色をクリアしました");
}

function getExportSvgString() {
  const originalSvg = document.querySelector("#worldMap");
  const clone = originalSvg.cloneNode(true);

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(WIDTH));
  clone.setAttribute("height", String(HEIGHT));
  clone.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .ocean { fill: #dcecff; }
    .country { stroke: #ffffff; stroke-width: 0.7; vector-effect: non-scaling-stroke; }
  `;
  clone.insertBefore(style, clone.firstChild);

  clone.querySelector("#mapLayer")?.removeAttribute("transform");

  clone.querySelectorAll(".country").forEach((path) => {
    const id = path.getAttribute("data-id");
    path.setAttribute("fill", state.colorsById.get(id) || DEFAULT_FILL);
    path.classList.remove("focused", "dimmed");
    path.removeAttribute("filter");
  });

  return new XMLSerializer().serializeToString(clone);
}

function downloadSvg() {
  const svgString = getExportSvgString();
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, "colored-world-map.svg");
}

function downloadPng() {
  const svgString = getExportSvgString();
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();

  image.onload = () => {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH * scale;
    canvas.height = HEIGHT * scale;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, "colored-world-map.png");
    }, "image/png");
  };

  image.onerror = () => {
    URL.revokeObjectURL(url);
    showToast("PNGの作成に失敗しました");
  };

  image.src = url;
}

function downloadBlob(blob, fileName) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function getCountryId(country) {
  return String(country.id ?? country.properties?.id ?? country.properties?.name);
}

function getCountryName(country) {
  return country.properties?.name || `Country ${getCountryId(country)}`;
}

function showToast(message) {
  const toast = els.toastTemplate.content.firstElementChild.cloneNode(true);
  toast.textContent = message;
  els.toastStack.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function rgbToHex(value) {
  if (value.startsWith("#")) return value;
  const match = value.match(/\d+/g);
  if (!match) return value;
  return `#${match.slice(0, 3).map((number) => Number(number).toString(16).padStart(2, "0")).join("")}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const { DeckGL, FlyToInterpolator, GeoJsonLayer, WebMercatorViewport } = deck;
const {
  createLayersFromGeoJSON,
  escapeHtml,
  getGeoJsonBounds,
  getVisibleFeatures,
  normalizeGeoJSON,
} = GeoJsonUtils;

const dropZone = document.getElementById("dropZone");
const statusEl = document.getElementById("status");
const layersListEl = document.getElementById("layersList");
const legendModalEl = document.getElementById("legendModal");
const legendListEl = document.getElementById("legendList");
const resetViewEl = document.getElementById("resetView");
const themeToggleEl = document.getElementById("themeToggle");
const tooltipEl = document.getElementById("tooltip");

const layerRegistry = [];
const MAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};
const STORAGE_KEY = "map-dashboard-state";
const THEME_STORAGE_KEY = "map-dashboard-theme";
const DEFAULT_THEME = "dark";
const DEFAULT_VIEW_STATE = {
  longitude: 134.5,
  latitude: -25.5,
  zoom: 3.6,
  pitch: 0,
  bearing: 0,
};
let draggedLayerIndex = null;
let expandedLayerId = null;
let currentViewState = { ...DEFAULT_VIEW_STATE };
let layerListRenderToken = null;
let persistStateToken = null;
let deckRefreshToken = null;
let externalDragDepth = 0;
let metrics = {
  layerListRenders: 0,
  legendRenders: 0,
  persistWrites: 0,
  deckRefreshes: 0,
};

window.__mapDashboardMetrics = metrics;
window.__resetMapDashboardMetrics = () => {
  Object.keys(metrics).forEach((key) => {
    metrics[key] = 0;
  });
};
window.__getMapDashboardMetrics = () => ({ ...metrics });

const deckgl = new DeckGL({
  container: "map",
  map: maplibregl,
  mapStyle: MAP_STYLES.light,
  controller: true,
  initialViewState: currentViewState,
  getCursor: ({ isDragging }) => (isDragging ? "grabbing" : "grab"),
  onViewStateChange: ({ viewState }) => {
    currentViewState = {
      longitude: viewState.longitude,
      latitude: viewState.latitude,
      zoom: viewState.zoom,
      pitch: viewState.pitch,
      bearing: viewState.bearing,
    };
    schedulePersistState();
  },
  layers: [],
});

resetViewEl.innerHTML = `<span class="theme-toggle-icon" aria-hidden="true">${resetIcon()}</span>`;

const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
applyTheme(savedTheme);

themeToggleEl.addEventListener("click", () => {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
});

resetViewEl.addEventListener("click", () => {
  resetToDefaults();
});

if (!restorePersistedState()) {
  loadDefaultLayers();
}

["dragenter", "dragover"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    if (eventName === "dragenter") {
      externalDragDepth += 1;
    }
    dropZone.classList.add("active");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    if (eventName === "dragleave" && event.relatedTarget) {
      return;
    }
    if (eventName === "dragleave") {
      externalDragDepth = Math.max(0, externalDragDepth - 1);
      if (externalDragDepth > 0) {
        return;
      }
    }
    if (eventName === "drop") {
      externalDragDepth = 0;
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length > 0) {
        loadFiles(files);
      }
    }
    dropZone.classList.remove("active");
  });
});

layersListEl.addEventListener("click", handleLayerListClick);
layersListEl.addEventListener("change", handleLayerListChange);
layersListEl.addEventListener("input", handleLayerListInput);
layersListEl.addEventListener("dragstart", handleLayerDragStart);
layersListEl.addEventListener("dragend", handleLayerDragEnd);
layersListEl.addEventListener("dragover", handleLayerDragOver);
layersListEl.addEventListener("dragleave", handleLayerDragLeave);
layersListEl.addEventListener("drop", handleLayerDrop);

async function loadFiles(files) {
  statusEl.textContent = `Loading ${files.length} file${files.length === 1 ? "" : "s"}...`;
  let addedLayerCount = 0;

  for (const file of files) {
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      const geojson = normalizeGeoJSON(parsed);
      const generatedLayers = createLayersFromGeoJSON(geojson, file.name).map(
        (layer, index) => ({
          ...layer,
          id: `${layer.id}-${Date.now()}-${index}`,
        }),
      );

      if (generatedLayers.length === 0) {
        statusEl.textContent = `Skipped ${file.name}: no supported features found.`;
        continue;
      }

      layerRegistry.push(...generatedLayers);
      addedLayerCount += generatedLayers.length;
    } catch (error) {
      statusEl.textContent = `Could not load ${file.name}: ${error.message}`;
    }
  }

  tooltipEl.hidden = true;
  refreshDeckLayers();
  fitToAllLayers();
  scheduleLayerListRender();
  schedulePersistState();

  if (addedLayerCount > 0) {
    statusEl.textContent = `Added ${addedLayerCount} layer${addedLayerCount === 1 ? "" : "s"}.`;
  }
}

async function loadDefaultLayers() {
  try {
    layerRegistry.length = 0;
    expandedLayerId = null;
    const defaults = await Promise.all([
      fetch("./samples/australian-cities.geojson").then((response) =>
        response.json(),
      ),
      fetch("./samples/australian-rivers.geojson").then((response) =>
        response.json(),
      ),
    ]);

    const generatedLayers = defaults.flatMap((geojson, datasetIndex) =>
      createLayersFromGeoJSON(
        geojson,
        datasetIndex === 0
          ? "australian-cities.geojson"
          : "australian-rivers.geojson",
      ).map((layer, index) => ({
        ...layer,
        id: `${layer.id}-default-${datasetIndex}-${index}`,
      })),
    );

    layerRegistry.push(...generatedLayers);
    tooltipEl.hidden = true;
    refreshDeckLayers();
    fitToAllLayers();
    scheduleLayerListRender();
    schedulePersistState();
  } catch (error) {
    statusEl.textContent = "";
  }
}

function buildLayers() {
  return layerRegistry
    .slice()
    .reverse()
    .filter((entry) => entry.visible)
    .map(
      (entry) =>
        new GeoJsonLayer({
          id: entry.id,
          data: entry.data,
          pickable: true,
          stroked: true,
          filled: true,
          pointType: "circle",
          lineWidthUnits: "pixels",
          lineWidthMinPixels: 1,
          pointRadiusUnits: "pixels",
          pointRadiusMinPixels: 1,
          pointRadiusMaxPixels: 24,
          pointRadiusScale: 1,
          getPointRadius: entry.style.pointRadius,
          getFillColor: () => entry.style.fillColor,
          getLineColor: () => entry.style.lineColor,
          getLineWidth: () => entry.style.lineWidth,
          updateTriggers: {
            getPointRadius: [entry.style.pointRadius],
            getFillColor: entry.style.fillColor,
            getLineColor: entry.style.lineColor,
            getLineWidth: [entry.style.lineWidth],
          },
          onHover: handleFeatureHover,
          onClick: handleFeatureHover,
        }),
    );
}

function refreshDeckLayers() {
  if (deckRefreshToken !== null) {
    return;
  }

  deckRefreshToken = window.requestAnimationFrame(() => {
    deckRefreshToken = null;
    metrics.deckRefreshes += 1;
    deckgl.setProps({ layers: buildLayers() });
    renderLegend();
  });
}

function fitToAllLayers() {
  const visibleFeatures = getVisibleFeatures(layerRegistry);

  if (visibleFeatures.length === 0) {
    return;
  }

  const fittedView = getFittedViewState(
    { type: "FeatureCollection", features: visibleFeatures },
    deckgl.width,
    deckgl.height,
  );

  if (fittedView) {
    animateToViewState(fittedView);
  }
}

function animateToViewState(viewState) {
  currentViewState = {
    ...viewState,
    transitionInterpolator: new FlyToInterpolator(),
    transitionDuration: 900,
  };

  deckgl.setProps({ initialViewState: currentViewState });
}

function handleFeatureHover(info) {
  const feature = info.object || null;

  if (!feature) {
    tooltipEl.hidden = true;
    return;
  }

  tooltipEl.hidden = false;
  tooltipEl.innerHTML = buildTooltipContent(feature);
  tooltipEl.style.left = `${Math.min(info.x + 16, window.innerWidth - 340)}px`;
  tooltipEl.style.top = `${Math.max(info.y + 16, 20)}px`;
}

function renderLegend() {
  metrics.legendRenders += 1;
  const visibleLayers = layerRegistry.filter((entry) => entry.visible);
  legendModalEl.hidden = visibleLayers.length === 0;

  if (visibleLayers.length === 0) {
    legendListEl.innerHTML = '<p class="legend-empty">No visible layers.</p>';
    return;
  }

  legendListEl.innerHTML = visibleLayers
    .map(
      (entry) => `
        <div class="legend-item">
          <span
            class="legend-symbol legend-symbol-${escapeHtml(entry.geometryLabel)}"
            style="--legend-color: rgb(${entry.style.lineColor.slice(0, 3).join(",")});"
            aria-hidden="true"
          ></span>
          <span class="legend-copy">
            <span class="legend-title">${escapeHtml(entry.label)}</span>
          </span>
        </div>
      `,
    )
    .join("");
}

function buildTooltipContent(feature) {
  const properties = feature.properties || {};
  const entries = Object.entries(properties).slice(0, 8);

  if (entries.length === 0) {
    return `<strong>${escapeHtml(feature.geometry?.type || "Feature")}</strong><div>No properties</div>`;
  }

  const rows = entries
    .map(([key, value]) => {
      const safeValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      return `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(safeValue)}</td></tr>`;
    })
    .join("");

  return `<strong>${escapeHtml(feature.geometry?.type || "Feature")}</strong><table class="popup-table">${rows}</table>`;
}

function renderLayerList() {
  layerListRenderToken = null;
  metrics.layerListRenders += 1;

  if (layerRegistry.length === 0) {
    layersListEl.innerHTML = '<p class="layers-empty">No layers loaded.</p>';
    return;
  }

  layersListEl.innerHTML = layerRegistry
    .map(
      (entry, index) => `
        <div class="layer-item" data-layer-index="${index}">
          <span class="layer-handle" draggable="true" data-layer-index="${index}" aria-label="Drag to reorder" title="Drag to reorder">⋮⋮</span>
          <span class="layer-swatch" style="background: rgb(${entry.style.lineColor.slice(0, 3).join(",")});"></span>
          <span class="layer-copy">
            <span class="layer-topline">
              <span class="layer-name">${escapeHtml(entry.label)}</span>
              <button class="layer-expand" type="button" data-layer-index="${index}" aria-expanded="${expandedLayerId === entry.id ? "true" : "false"}" aria-label="${expandedLayerId === entry.id ? "Hide style options" : "Show style options"}">${styleToggleIcon(expandedLayerId === entry.id)}</button>
            </span>
            <span class="layer-meta">${entry.featureCount} feature${entry.featureCount === 1 ? "" : "s"} · ${escapeHtml(entry.geometryLabel)}</span>
          </span>
          <button class="layer-delete" type="button" data-layer-index="${index}" aria-label="Delete layer">×</button>
          <input class="layer-toggle" type="checkbox" data-layer-index="${index}" ${entry.visible ? "checked" : ""} />
          <div class="layer-controls" ${expandedLayerId === entry.id ? "" : "hidden"}>
            <div class="layer-control">
              <label for="line-color-${index}">Color</label>
              <input id="line-color-${index}" class="layer-style-input" type="color" data-style-key="lineColor" data-layer-index="${index}" value="${rgbToHex(entry.style.lineColor)}" />
            </div>
            <div class="layer-control">
              <label for="line-width-${index}">Width</label>
              <input id="line-width-${index}" class="layer-style-input" type="range" min="1" max="12" step="1" data-style-key="lineWidth" data-layer-index="${index}" value="${entry.style.lineWidth}" />
            </div>
            ${
              entry.geometryLabel === "points"
                ? `
              <div class="layer-control">
                <label for="point-radius-${index}">Radius</label>
                <input id="point-radius-${index}" class="layer-style-input" type="range" min="2" max="24" step="1" data-style-key="pointRadius" data-layer-index="${index}" value="${entry.style.pointRadius}" />
              </div>
            `
                : ""
            }
          </div>
        </div>`,
    )
    .join("");
}

function scheduleLayerListRender() {
  if (layerListRenderToken !== null) {
    return;
  }

  layerListRenderToken = window.requestAnimationFrame(() => {
    renderLayerList();
  });
}

function handleLayerListClick(event) {
  const expandButton = event.target.closest(".layer-expand");
  if (expandButton) {
    event.preventDefault();
    event.stopPropagation();
    const layer = layerRegistry[Number(expandButton.dataset.layerIndex)];
    if (!layer) {
      return;
    }
    expandedLayerId = expandedLayerId === layer.id ? null : layer.id;
    schedulePersistState();
    scheduleLayerListRender();
    return;
  }

  const deleteButton = event.target.closest(".layer-delete");
  if (deleteButton) {
    event.preventDefault();
    event.stopPropagation();
    deleteLayer(Number(deleteButton.dataset.layerIndex));
  }
}

function handleLayerListChange(event) {
  const toggle = event.target.closest(".layer-toggle");
  if (!toggle) {
    return;
  }

  const layerIndex = Number(toggle.dataset.layerIndex);
  const layer = layerRegistry[layerIndex];
  if (!layer) {
    return;
  }

  layer.visible = toggle.checked;
  tooltipEl.hidden = true;
  refreshDeckLayers();
  fitToAllLayers();
  schedulePersistState();
}

function handleLayerListInput(event) {
  const input = event.target.closest(".layer-style-input");
  if (!input) {
    return;
  }

  event.stopPropagation();
  updateLayerStyle(
    Number(input.dataset.layerIndex),
    input.dataset.styleKey,
    input.value,
    input.closest(".layer-item"),
  );
}

function handleLayerDragStart(event) {
  const handle = event.target.closest(".layer-handle");
  if (!handle) {
    return;
  }

  const item = handle.closest(".layer-item");
  draggedLayerIndex = Number(handle.dataset.layerIndex);
  item?.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(draggedLayerIndex));
}

function handleLayerDragEnd(event) {
  const handle = event.target.closest(".layer-handle");
  if (!handle) {
    return;
  }

  const item = handle.closest(".layer-item");
  draggedLayerIndex = null;
  item?.classList.remove("dragging");
  clearLayerDragState();
}

function handleLayerDragOver(event) {
  const item = event.target.closest(".layer-item");
  if (!item || draggedLayerIndex === null) {
    return;
  }

  event.preventDefault();
  item.classList.add("drag-over");
  event.dataTransfer.dropEffect = "move";
}

function handleLayerDragLeave(event) {
  const item = event.target.closest(".layer-item");
  if (!item) {
    return;
  }

  if (event.relatedTarget && item.contains(event.relatedTarget)) {
    return;
  }

  item.classList.remove("drag-over");
}

function handleLayerDrop(event) {
  const item = event.target.closest(".layer-item");
  if (!item) {
    return;
  }

  event.preventDefault();
  item.classList.remove("drag-over");
  moveLayer(draggedLayerIndex, Number(item.dataset.layerIndex));
}

function clearLayerDragState() {
  layersListEl.querySelectorAll(".layer-item.drag-over").forEach((row) => {
    row.classList.remove("drag-over");
  });
}

function moveLayer(fromIndex, toIndex) {
  if (
    fromIndex === null ||
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= layerRegistry.length ||
    toIndex >= layerRegistry.length
  ) {
    return;
  }

  const [entry] = layerRegistry.splice(fromIndex, 1);
  layerRegistry.splice(toIndex, 0, entry);
  tooltipEl.hidden = true;
  refreshDeckLayers();
  fitToAllLayers();
  schedulePersistState();
  scheduleLayerListRender();
}

function deleteLayer(index) {
  if (index < 0 || index >= layerRegistry.length) {
    return;
  }

  layerRegistry.splice(index, 1);
  if (
    expandedLayerId &&
    !layerRegistry.some((entry) => entry.id === expandedLayerId)
  ) {
    expandedLayerId = null;
  }
  tooltipEl.hidden = true;
  refreshDeckLayers();
  fitToAllLayers();
  schedulePersistState();
  scheduleLayerListRender();
}

function updateLayerStyle(index, styleKey, value, layerItemEl) {
  const layer = layerRegistry[index];
  if (!layer) {
    return;
  }

  if (styleKey === "lineColor") {
    const rgb = hexToRgb(value);
    layer.style.lineColor = [...rgb, layer.style.lineColor[3] ?? 230];
    if (layer.geometryLabel !== "lines") {
      layer.style.fillColor = [...rgb, layer.style.fillColor[3] ?? 155];
    }
  } else if (styleKey === "lineWidth") {
    layer.style.lineWidth = Number(value);
  } else if (styleKey === "pointRadius") {
    layer.style.pointRadius = Number(value);
  }

  refreshDeckLayers();
  schedulePersistState();
  syncLayerItemUI(layer, layerItemEl);
}

function syncLayerItemUI(layer, layerItemEl) {
  if (!layerItemEl) {
    return;
  }

  const swatchEl = layerItemEl.querySelector(".layer-swatch");
  if (swatchEl) {
    swatchEl.style.background = `rgb(${layer.style.lineColor.slice(0, 3).join(",")})`;
  }

  const colorInput = layerItemEl.querySelector('[data-style-key="lineColor"]');
  if (colorInput) {
    colorInput.value = rgbToHex(layer.style.lineColor);
  }

  const lineWidthInput = layerItemEl.querySelector(
    '[data-style-key="lineWidth"]',
  );
  if (lineWidthInput) {
    lineWidthInput.value = String(layer.style.lineWidth);
  }

  const pointRadiusInput = layerItemEl.querySelector(
    '[data-style-key="pointRadius"]',
  );
  if (pointRadiusInput) {
    pointRadiusInput.value = String(layer.style.pointRadius);
  }
}

function getFittedViewState(geojson, width, height) {
  const bounds = getGeoJsonBounds(geojson);
  if (!bounds) {
    return null;
  }

  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const viewport = new WebMercatorViewport({
    width: Math.max(width || window.innerWidth, 1),
    height: Math.max(height || window.innerHeight, 1),
  });

  return viewport.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding: 48 },
  );
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error("Failed to read the selected file."));
    reader.readAsText(file);
  });
}

function isFileDrag(event) {
  const types = event.dataTransfer?.types;
  return Array.isArray(types)
    ? types.includes("Files")
    : typeof types?.includes === "function"
      ? types.includes("Files")
      : false;
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  deckgl.setProps({ mapStyle: MAP_STYLES[theme] || MAP_STYLES.light });
  themeToggleEl.innerHTML = `<span class="theme-toggle-icon" aria-hidden="true">${theme === "dark" ? sunIcon() : moonIcon()}</span>`;
  themeToggleEl.setAttribute(
    "aria-label",
    `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
  );
}

function resetToDefaults() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(THEME_STORAGE_KEY);
  applyTheme(DEFAULT_THEME);
  currentViewState = { ...DEFAULT_VIEW_STATE };
  expandedLayerId = null;
  layerRegistry.length = 0;
  statusEl.textContent = "";
  tooltipEl.hidden = true;
  deckgl.setProps({ initialViewState: currentViewState, layers: [] });
  renderLegend();
  renderLayerList();
  loadDefaultLayers();
}

function schedulePersistState() {
  if (persistStateToken !== null) {
    return;
  }

  const schedule =
    window.requestIdleCallback ||
    ((callback) => window.setTimeout(callback, 120));
  persistStateToken = schedule(() => {
    persistStateToken = null;
    persistStateNow();
  });
}

function persistStateNow() {
  try {
    metrics.persistWrites += 1;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currentViewState,
        expandedLayerId,
        layerRegistry,
      }),
    );
  } catch (_error) {
    // Ignore quota or serialization issues and keep the app usable.
  }
}

function restorePersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed.layerRegistry) &&
      parsed.layerRegistry.length > 0
    ) {
      layerRegistry.push(...parsed.layerRegistry);
    } else {
      return false;
    }

    if (parsed.currentViewState) {
      currentViewState = {
        longitude:
          parsed.currentViewState.longitude ?? currentViewState.longitude,
        latitude: parsed.currentViewState.latitude ?? currentViewState.latitude,
        zoom: parsed.currentViewState.zoom ?? currentViewState.zoom,
        pitch: parsed.currentViewState.pitch ?? currentViewState.pitch,
        bearing: parsed.currentViewState.bearing ?? currentViewState.bearing,
      };
      deckgl.setProps({ initialViewState: currentViewState });
    }

    expandedLayerId = parsed.expandedLayerId ?? null;
    refreshDeckLayers();
    renderLayerList();
    return true;
  } catch (_error) {
    return false;
  }
}

function styleToggleIcon(isExpanded) {
  return isExpanded
    ? `
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" aria-hidden="true">
        <path d="M3 8h10"></path>
      </svg>
    `
    : `
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" aria-hidden="true">
        <path d="M3 8h10"></path>
        <path d="M8 3v10"></path>
      </svg>
    `;
}

function moonIcon() {
  return `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.8 1.8a5.9 5.9 0 1 0 3.4 10.7A6.5 6.5 0 0 1 10.8 1.8z"></path>
    </svg>
  `;
}

function sunIcon() {
  return `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="8" r="3"></circle>
      <path d="M8 1.5v2"></path>
      <path d="M8 12.5v2"></path>
      <path d="M1.5 8h2"></path>
      <path d="M12.5 8h2"></path>
      <path d="M3.4 3.4l1.4 1.4"></path>
      <path d="M11.2 11.2l1.4 1.4"></path>
      <path d="M11.2 4.8l1.4-1.4"></path>
      <path d="M3.4 12.6l1.4-1.4"></path>
    </svg>
  `;
}

function resetIcon() {
  return `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M13 3v4H9"></path>
      <path d="M13 7A5 5 0 1 0 8 13"></path>
    </svg>
  `;
}

function rgbToHex(color) {
  return `#${color
    .slice(0, 3)
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

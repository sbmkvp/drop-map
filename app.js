const { DeckGL, FlyToInterpolator, GeoJsonLayer, WebMercatorViewport } = deck;
const {
  createLayersFromGeoJSON,
  escapeHtml,
  getGeoJsonBounds,
  getVisibleFeatures,
  normalizeGeoJSON,
} = GeoJsonUtils;

const dropZone = document.getElementById("dropZone");
const languageToggleEl = document.getElementById("languageToggle");
const languageOptionEls = Array.from(
  languageToggleEl.querySelectorAll(".language-option"),
);
const statusEl = document.getElementById("status");
const layersListEl = document.getElementById("layersList");
const legendModalEl = document.getElementById("legendModal");
const legendListEl = document.getElementById("legendList");
const resetViewEl = document.getElementById("resetView");
const themeToggleEl = document.getElementById("themeToggle");
const tooltipEl = document.getElementById("tooltip");
const brandSubtitleEl = document.getElementById("brandSubtitle");
const layersHeadingEl = document.getElementById("layersHeading");
const dropMessageTitleEl = document.getElementById("dropMessageTitle");
const dropMessageSubtitleEl = document.getElementById("dropMessageSubtitle");
const legendHeadingEl = document.getElementById("legendHeading");
const mapEl = document.getElementById("map");

const layerRegistry = [];
const MAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};
const STORAGE_KEY = "map-dashboard-state";
const THEME_STORAGE_KEY = "map-dashboard-theme";
const LANGUAGE_STORAGE_KEY = "map-dashboard-language";
const DEFAULT_THEME = "dark";
const DEFAULT_LANGUAGE = "en";
const LANGUAGE_META = {
  en: { documentLang: "en", index: 0 },
  zh: { documentLang: "zh-CN", index: 1 },
  es: { documentLang: "es", index: 2 },
};
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
let currentLanguage =
  localStorage.getItem(LANGUAGE_STORAGE_KEY) || DEFAULT_LANGUAGE;
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

const I18N = {
  en: {
    appTitle: "DropMap",
    subtitle: "Drag, Drop, Map",
    layers: "Layers",
    legend: "Legend",
    mapAria: "Map",
    dropTitle: "Drop GeoJSON to load it",
    dropSubtitle: "The map will style and fit it automatically.",
    noLayers: "No layers loaded.",
    noVisibleLayers: "No visible layers.",
    loadingFiles: ({ count }) =>
      `Loading ${count} file${count === 1 ? "" : "s"}...`,
    skippedFile: ({ file }) => `Skipped ${file}: no supported features found.`,
    couldNotLoad: ({ file, message }) => `Could not load ${file}: ${message}`,
    addedLayers: ({ count }) =>
      `Added ${count} layer${count === 1 ? "" : "s"}.`,
    noProperties: "No properties",
    featureSuffix: ({ count }) => `feature${count === 1 ? "" : "s"}`,
    color: "Color",
    width: "Width",
    radius: "Radius",
    points: "points",
    lines: "lines",
    polygons: "polygons",
    dragToReorder: "Drag to reorder",
    showStyle: "Show style options",
    hideStyle: "Hide style options",
    deleteLayer: "Delete layer",
    switchToDark: "Switch to dark mode",
    switchToLight: "Switch to light mode",
    resetDefault: "Reset to default",
    switchLanguage: "Switch language",
  },
  zh: {
    appTitle: "DropMap",
    subtitle: "拖放即成图",
    layers: "图层",
    legend: "图例",
    mapAria: "地图",
    dropTitle: "拖放 GeoJSON 以加载",
    dropSubtitle: "地图将自动完成样式与视野适配。",
    noLayers: "暂无图层。",
    noVisibleLayers: "没有可见图层。",
    loadingFiles: ({ count }) => `正在加载 ${count} 个文件...`,
    skippedFile: ({ file }) => `已跳过 ${file}：未找到受支持的要素。`,
    couldNotLoad: ({ file, message }) => `无法加载 ${file}：${message}`,
    addedLayers: ({ count }) => `已添加 ${count} 个图层。`,
    noProperties: "无属性",
    featureSuffix: () => "个要素",
    color: "颜色",
    width: "宽度",
    radius: "半径",
    points: "点",
    lines: "线",
    polygons: "面",
    dragToReorder: "拖动以重排",
    showStyle: "显示样式选项",
    hideStyle: "隐藏样式选项",
    deleteLayer: "删除图层",
    switchToDark: "切换为深色模式",
    switchToLight: "切换为浅色模式",
    resetDefault: "重置为默认",
    switchLanguage: "切换语言",
  },
  es: {
    appTitle: "DropMap",
    subtitle: "Arrastra, suelta y mapea",
    layers: "Capas",
    legend: "Leyenda",
    mapAria: "Mapa",
    dropTitle: "Suelta un GeoJSON para cargarlo",
    dropSubtitle: "El mapa aplicara estilo y ajuste automaticamente.",
    noLayers: "No hay capas cargadas.",
    noVisibleLayers: "No hay capas visibles.",
    loadingFiles: ({ count }) =>
      `Cargando ${count} archivo${count === 1 ? "" : "s"}...`,
    skippedFile: ({ file }) =>
      `Se omitio ${file}: no se encontraron entidades compatibles.`,
    couldNotLoad: ({ file, message }) =>
      `No se pudo cargar ${file}: ${message}`,
    addedLayers: ({ count }) =>
      `Se agregaron ${count} capa${count === 1 ? "" : "s"}.`,
    noProperties: "Sin propiedades",
    featureSuffix: ({ count }) => `elemento${count === 1 ? "" : "s"}`,
    color: "Color",
    width: "Ancho",
    radius: "Radio",
    points: "puntos",
    lines: "lineas",
    polygons: "poligonos",
    dragToReorder: "Arrastra para reordenar",
    showStyle: "Mostrar opciones de estilo",
    hideStyle: "Ocultar opciones de estilo",
    deleteLayer: "Eliminar capa",
    switchToDark: "Cambiar a modo oscuro",
    switchToLight: "Cambiar a modo claro",
    resetDefault: "Restablecer valores predeterminados",
    switchLanguage: "Cambiar idioma",
  },
};

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
applyLanguage(currentLanguage);
applyTheme(savedTheme);

languageToggleEl.addEventListener("click", (event) => {
  const option = event.target.closest(".language-option");
  if (!option) {
    return;
  }

  currentLanguage = option.dataset.language;
  applyLanguage(currentLanguage);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
});

themeToggleEl.addEventListener("click", () => {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
});

resetViewEl.addEventListener("click", () => {
  resetToDefaults();
});

if (!restorePersistedState()) {
  renderLegend();
  renderLayerList();
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
  statusEl.textContent = t("loadingFiles", { count: files.length });
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
        statusEl.textContent = t("skippedFile", { file: file.name });
        continue;
      }

      layerRegistry.push(...generatedLayers);
      addedLayerCount += generatedLayers.length;
    } catch (error) {
      statusEl.textContent = t("couldNotLoad", {
        file: file.name,
        message: error.message,
      });
    }
  }

  tooltipEl.hidden = true;
  refreshDeckLayers();
  fitToAllLayers();
  scheduleLayerListRender();
  schedulePersistState();

  if (addedLayerCount > 0) {
    statusEl.textContent = t("addedLayers", { count: addedLayerCount });
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
    legendListEl.innerHTML = `<p class="legend-empty">${escapeHtml(t("noVisibleLayers"))}</p>`;
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
    return `<strong>${escapeHtml(feature.geometry?.type || "Feature")}</strong><div>${escapeHtml(t("noProperties"))}</div>`;
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
    layersListEl.innerHTML = `<p class="layers-empty">${escapeHtml(t("noLayers"))}</p>`;
    return;
  }

  layersListEl.innerHTML = layerRegistry
    .map(
      (entry, index) => `
        <div class="layer-item" data-layer-index="${index}">
          <span class="layer-handle" draggable="true" data-layer-index="${index}" aria-label="${escapeHtml(t("dragToReorder"))}" title="${escapeHtml(t("dragToReorder"))}">⋮⋮</span>
          <span class="layer-swatch" style="background: rgb(${entry.style.lineColor.slice(0, 3).join(",")});"></span>
          <span class="layer-copy">
            <span class="layer-topline">
              <span class="layer-name">${escapeHtml(entry.label)}</span>
              <button class="layer-expand" type="button" data-layer-index="${index}" aria-expanded="${expandedLayerId === entry.id ? "true" : "false"}" aria-label="${escapeHtml(expandedLayerId === entry.id ? t("hideStyle") : t("showStyle"))}">${styleToggleIcon(expandedLayerId === entry.id)}</button>
            </span>
            <span class="layer-meta">${featureCountLabel(entry.featureCount)} · ${escapeHtml(t(entry.geometryLabel))}</span>
          </span>
          <button class="layer-delete" type="button" data-layer-index="${index}" aria-label="${escapeHtml(t("deleteLayer"))}">×</button>
          <input class="layer-toggle" type="checkbox" data-layer-index="${index}" ${entry.visible ? "checked" : ""} />
          <div class="layer-controls" ${expandedLayerId === entry.id ? "" : "hidden"}>
            <div class="layer-control">
              <label for="line-color-${index}">${escapeHtml(t("color"))}</label>
              <input id="line-color-${index}" class="layer-style-input" type="color" data-style-key="lineColor" data-layer-index="${index}" value="${rgbToHex(entry.style.lineColor)}" />
            </div>
            <div class="layer-control">
              <label for="line-width-${index}">${escapeHtml(t("width"))}</label>
              <input id="line-width-${index}" class="layer-style-input" type="range" min="1" max="12" step="1" data-style-key="lineWidth" data-layer-index="${index}" value="${entry.style.lineWidth}" />
            </div>
            ${
              entry.geometryLabel === "points"
                ? `
              <div class="layer-control">
                <label for="point-radius-${index}">${escapeHtml(t("radius"))}</label>
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
    theme === "dark" ? t("switchToLight") : t("switchToDark"),
  );
}

function applyLanguage(language) {
  currentLanguage = I18N[language] ? language : DEFAULT_LANGUAGE;
  const languageMeta = LANGUAGE_META[currentLanguage] || LANGUAGE_META.en;
  document.documentElement.lang = languageMeta.documentLang;
  document.title = t("appTitle");
  brandSubtitleEl.textContent = t("subtitle");
  layersHeadingEl.textContent = t("layers");
  legendHeadingEl.textContent = t("legend");
  dropMessageTitleEl.textContent = t("dropTitle");
  dropMessageSubtitleEl.textContent = t("dropSubtitle");
  mapEl.setAttribute("aria-label", t("mapAria"));
  resetViewEl.setAttribute("aria-label", t("resetDefault"));
  languageToggleEl.setAttribute("aria-label", t("switchLanguage"));
  languageToggleEl.style.setProperty(
    "--language-index",
    String(languageMeta.index ?? 0),
  );
  languageOptionEls.forEach((optionEl) => {
    const isActive = optionEl.dataset.language === currentLanguage;
    optionEl.dataset.active = isActive ? "true" : "false";
    optionEl.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  applyTheme(document.body.dataset.theme || savedTheme);
  renderLegend();
  renderLayerList();
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

function featureCountLabel(count) {
  return `${count} ${t("featureSuffix", { count })}`;
}

function t(key, params = {}) {
  const bundle = I18N[currentLanguage] || I18N[DEFAULT_LANGUAGE];
  const value = bundle[key];
  if (typeof value === "function") {
    return value(params);
  }
  return value || key;
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

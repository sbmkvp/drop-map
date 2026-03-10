const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const citiesGeoJson = fs.readFileSync(
  path.join(__dirname, "../../samples/australian-cities.geojson"),
  "utf8",
);
const riversGeoJson = fs.readFileSync(
  path.join(__dirname, "../../samples/australian-rivers.geojson"),
  "utf8",
);

function createPersistedLayersState(layerCount) {
  return JSON.stringify({
    currentViewState: {
      longitude: 134.5,
      latitude: -25.5,
      zoom: 3.6,
      pitch: 0,
      bearing: 0,
    },
    expandedLayerId: "perf-layer-0",
    layerRegistry: Array.from({ length: layerCount }, (_, index) => ({
      id: `perf-layer-${index}`,
      label: `perf-layer-${index}.geojson`,
      visible: true,
      geometryLabel: "points",
      featureCount: 1,
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: `Layer ${index}` },
            geometry: {
              type: "Point",
              coordinates: [130 + (index % 10), -30 + index * 0.01],
            },
          },
        ],
      },
      style: {
        lineColor: [40 + (index % 180), 120, 220, 230],
        fillColor: [40 + (index % 180), 120, 220, 155],
        lineWidth: 2,
        pointRadius: 6,
      },
    })),
  });
}

const testPolygonGeoJson = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Test Polygon" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [140, -35],
            [141, -35],
            [141, -34],
            [140, -35],
          ],
        ],
      },
    },
  ],
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("playwright-storage-cleared")) {
      localStorage.removeItem("map-dashboard-state");
      localStorage.removeItem("map-dashboard-theme");
      sessionStorage.setItem("playwright-storage-cleared", "true");
    }
  });

  await page.route("**/*", async (route) => {
    const url = route.request().url();

    if (url.includes("maplibre-gl") && url.endsWith(".js")) {
      await route.fulfill({
        contentType: "text/javascript",
        body: "window.maplibregl = {};",
      });
      return;
    }

    if (url.includes("deck.gl") && url.endsWith("dist.min.js")) {
      await route.fulfill({
        contentType: "text/javascript",
        body: `
          window.deck = {
            DeckGL: class {
              constructor(props) { this.props = props; this.width = 1280; this.height = 720; }
              setProps(next) { this.props = { ...this.props, ...next }; }
            },
            GeoJsonLayer: class {
              constructor(props) { this.props = props; }
            },
            FlyToInterpolator: class {},
            WebMercatorViewport: class {
              constructor(opts) { this.width = opts.width; this.height = opts.height; }
              fitBounds(bounds) {
                const [[minLng, minLat], [maxLng, maxLat]] = bounds;
                return {
                  longitude: (minLng + maxLng) / 2,
                  latitude: (minLat + maxLat) / 2,
                  zoom: 4,
                  pitch: 0,
                  bearing: 0
                };
              }
            }
          };
        `,
      });
      return;
    }

    await route.continue();
  });
});

async function dropGeoJson(page, { name, text }) {
  await page.evaluate(
    (file) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(
        new File([file.text], file.name, { type: "application/geo+json" }),
      );

      window.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
    },
    { name, text },
  );
}

async function loadBaseLayers(page) {
  await dropGeoJson(page, {
    name: "australian-cities.geojson",
    text: citiesGeoJson,
  });
  await dropGeoJson(page, {
    name: "australian-rivers.geojson",
    text: riversGeoJson,
  });
}

async function reorderLayer(page, fromName, toName) {
  await page.evaluate(
    ({ fromName, toName }) => {
      const rows = Array.from(document.querySelectorAll(".layer-item"));
      const fromRow = rows.find((row) =>
        row.querySelector(".layer-name")?.textContent?.includes(fromName),
      );
      const toRow = rows.find((row) =>
        row.querySelector(".layer-name")?.textContent?.includes(toName),
      );

      const handle = fromRow?.querySelector(".layer-handle");
      if (!fromRow || !toRow || !handle) {
        throw new Error("Could not find rows to reorder");
      }

      const dataTransfer = new DataTransfer();
      handle.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      toRow.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      toRow.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
      handle.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      );
    },
    { fromName, toName },
  );
}

test("loads cities and rivers and updates style controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".layer-item")).toHaveCount(0);
  await expect(page.locator("#legendModal")).toBeHidden();
  await loadBaseLayers(page);
  await expect(page.locator(".layer-item")).toHaveCount(2);
  await expect(page.locator("#legendModal")).toBeVisible();
  await expect(page.locator(".legend-item")).toHaveCount(2);
  await expect(page.locator(".layer-name")).toContainText([
    "australian-cities.geojson",
    "australian-rivers.geojson",
  ]);

  const citiesLayer = page.locator(".layer-item").filter({
    hasText: "australian-cities.geojson",
  });

  await citiesLayer.locator(".layer-expand").click();
  await expect(citiesLayer.locator(".layer-controls")).toBeVisible();
  await expect(citiesLayer.locator('label[for^="line-color-"]')).toHaveText(
    "Color",
  );
  await expect(citiesLayer.locator('label[for^="line-width-"]')).toHaveText(
    "Width",
  );
  await expect(citiesLayer.locator('label[for^="point-radius-"]')).toHaveText(
    "Radius",
  );

  const colorInput = citiesLayer.locator('[data-style-key="lineColor"]');
  const widthInput = citiesLayer.locator('[data-style-key="lineWidth"]');
  const radiusInput = citiesLayer.locator('[data-style-key="pointRadius"]');

  await colorInput.fill("#ff0000");
  await widthInput.fill("9");
  await radiusInput.fill("14");

  await expect(colorInput).toHaveValue("#ff0000");
  await expect(widthInput).toHaveValue("9");
  await expect(radiusInput).toHaveValue("14");
  await expect(citiesLayer.locator(".layer-swatch")).toHaveAttribute(
    "style",
    /255,\s*0,\s*0/,
  );
  await expect(page.locator(".legend-title")).toContainText([
    "australian-cities.geojson",
    "australian-rivers.geojson",
  ]);
  await expect(page.locator(".legend-description")).toHaveCount(0);
});

test("switches UI language to Mandarin and persists after reload", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator("#layersHeading")).toHaveText("Layers");
  await page.locator("#languageToggle").click();

  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("#layersHeading")).toHaveText("图层");
  await expect(page.locator("#legendHeading")).toHaveText("图例");
  await expect(page.locator("#dropMessageTitle")).toHaveText(
    "拖放 GeoJSON 以加载",
  );

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("#layersHeading")).toHaveText("图层");
});

test("toggles layer visibility, deletes a layer, and adds a new one", async ({
  page,
}) => {
  await page.goto("/");
  await loadBaseLayers(page);
  await expect(page.locator(".legend-item")).toHaveCount(2);

  const riversLayer = page.locator(".layer-item").filter({
    hasText: "australian-rivers.geojson",
  });
  const citiesLayer = page.locator(".layer-item").filter({
    hasText: "australian-cities.geojson",
  });
  const riversToggle = riversLayer.locator(".layer-toggle");
  await expect(riversToggle).toBeChecked();
  await riversToggle.uncheck();
  await expect(riversToggle).not.toBeChecked();
  await expect(page.locator(".legend-item")).toHaveCount(1);
  await expect(page.locator(".legend-title")).toContainText([
    "australian-cities.geojson",
  ]);
  await riversToggle.check();
  await expect(riversToggle).toBeChecked();
  await expect(page.locator(".legend-item")).toHaveCount(2);

  await citiesLayer.locator(".layer-toggle").uncheck();
  await riversToggle.uncheck();
  await expect(page.locator("#legendModal")).toBeHidden();
  await citiesLayer.locator(".layer-toggle").check();
  await expect(page.locator("#legendModal")).toBeVisible();
  await expect(page.locator(".legend-item")).toHaveCount(1);
  await expect(page.locator("#legendModal")).toBeVisible();
  await riversToggle.check();
  await expect(page.locator(".legend-item")).toHaveCount(2);

  await dropGeoJson(page, {
    name: "test-polygons.geojson",
    text: testPolygonGeoJson,
  });

  await expect(page.locator(".layer-item")).toHaveCount(3);
  await expect(page.locator(".legend-item")).toHaveCount(3);
  const statesLayer = page.locator(".layer-item").filter({
    hasText: "test-polygons.geojson",
  });
  await expect(statesLayer).toHaveCount(1);

  await statesLayer.locator(".layer-delete").click();
  await expect(page.locator(".layer-item")).toHaveCount(2);
  await expect(page.locator(".legend-item")).toHaveCount(2);
  await expect(page.locator(".layer-name")).not.toContainText([
    "test-polygons.geojson",
  ]);
});

test("reorders layers and toggles dark mode", async ({ page }) => {
  await page.goto("/");
  await loadBaseLayers(page);
  await expect(page.locator(".layer-item")).toHaveCount(2);

  await reorderLayer(
    page,
    "australian-rivers.geojson",
    "australian-cities.geojson",
  );

  await expect(page.locator(".layer-name").first()).toHaveText(
    /australian-rivers\.geojson/,
  );

  const toggle = page.locator("#themeToggle");
  await expect(toggle).toHaveAttribute("aria-label", /light mode/i);
  await toggle.click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "light");
  await expect(toggle).toHaveAttribute("aria-label", /dark mode/i);
});

test("restores persisted layers, styles, visibility, order, and theme after refresh", async ({
  page,
}) => {
  await page.goto("/");
  await loadBaseLayers(page);

  const citiesLayer = page.locator(".layer-item").filter({
    hasText: "australian-cities.geojson",
  });
  const riversLayer = page.locator(".layer-item").filter({
    hasText: "australian-rivers.geojson",
  });

  await citiesLayer.locator(".layer-expand").click();
  await citiesLayer.locator('[data-style-key="lineColor"]').fill("#00ff88");
  await citiesLayer.locator('[data-style-key="lineWidth"]').fill("7");
  await citiesLayer.locator('[data-style-key="pointRadius"]').fill("18");

  await riversLayer.locator(".layer-toggle").uncheck();
  await reorderLayer(
    page,
    "australian-rivers.geojson",
    "australian-cities.geojson",
  );
  await page.locator("#themeToggle").click();

  await page.reload();

  await expect(page.locator("body")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".layer-item")).toHaveCount(2);
  await expect(page.locator(".layer-name").first()).toHaveText(
    /australian-rivers\.geojson/,
  );

  const restoredCitiesLayer = page.locator(".layer-item").filter({
    hasText: "australian-cities.geojson",
  });
  const restoredRiversLayer = page.locator(".layer-item").filter({
    hasText: "australian-rivers.geojson",
  });

  await expect(restoredCitiesLayer.locator(".layer-controls")).toBeVisible();
  await expect(
    restoredCitiesLayer.locator('[data-style-key="lineColor"]'),
  ).toHaveValue("#00ff88");
  await expect(
    restoredCitiesLayer.locator('[data-style-key="lineWidth"]'),
  ).toHaveValue("7");
  await expect(
    restoredCitiesLayer.locator('[data-style-key="pointRadius"]'),
  ).toHaveValue("18");
  await expect(restoredCitiesLayer.locator(".layer-swatch")).toHaveAttribute(
    "style",
    /0,\s*255,\s*136/,
  );
  await expect(restoredRiversLayer.locator(".layer-toggle")).not.toBeChecked();
});

test("resets to empty layers and default theme", async ({ page }) => {
  await page.goto("/");
  await loadBaseLayers(page);

  const citiesLayer = page.locator(".layer-item").filter({
    hasText: "australian-cities.geojson",
  });

  await citiesLayer.locator(".layer-expand").click();
  await citiesLayer.locator('[data-style-key="lineColor"]').fill("#00ff88");
  await page.locator("#themeToggle").click();

  await dropGeoJson(page, {
    name: "test-polygons.geojson",
    text: testPolygonGeoJson,
  });

  await expect(page.locator(".layer-item")).toHaveCount(3);
  await expect(page.locator("body")).toHaveAttribute("data-theme", "light");

  await page.locator("#resetView").click();

  await expect(page.locator(".layer-item")).toHaveCount(0);
  await expect(page.locator("#legendModal")).toBeHidden();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
});

test("batches rapid style updates for large layer lists", async ({ page }) => {
  await page.addInitScript((persistedState) => {
    localStorage.setItem("map-dashboard-state", persistedState);
  }, createPersistedLayersState(80));

  await page.goto("/");
  await expect(page.locator(".layer-item")).toHaveCount(80);

  await page.evaluate(() => {
    window.__resetMapDashboardMetrics();
  });

  const result = await page.evaluate(async () => {
    const firstRow = document.querySelector(".layer-item");
    const colorInput = firstRow?.querySelector('[data-style-key="lineColor"]');
    const widthInput = firstRow?.querySelector('[data-style-key="lineWidth"]');
    const radiusInput = firstRow?.querySelector(
      '[data-style-key="pointRadius"]',
    );

    const start = performance.now();
    for (let index = 0; index < 60; index += 1) {
      const channel = (index * 3) % 255;
      colorInput.value = `#${channel.toString(16).padStart(2, "0")}88cc`;
      colorInput.dispatchEvent(new Event("input", { bubbles: true }));
      widthInput.value = String((index % 12) + 1);
      widthInput.dispatchEvent(new Event("input", { bubbles: true }));
      radiusInput.value = String((index % 23) + 2);
      radiusInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const interactionDurationMs = performance.now() - start;

    const settleStart = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 250));

    return {
      interactionDurationMs,
      settleDurationMs: performance.now() - settleStart,
      metrics: window.__getMapDashboardMetrics(),
    };
  });

  expect(result.interactionDurationMs).toBeLessThan(120);
  expect(result.settleDurationMs).toBeGreaterThanOrEqual(240);
  expect(result.metrics.layerListRenders).toBe(0);
  expect(result.metrics.persistWrites).toBeLessThanOrEqual(2);
  expect(result.metrics.deckRefreshes).toBeLessThanOrEqual(2);
  expect(result.metrics.legendRenders).toBeLessThanOrEqual(2);
});

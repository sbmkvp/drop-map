const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createLayersFromGeoJSON,
  escapeHtml,
  getGeoJsonBounds,
  getVisibleFeatures,
  makeRandomStyle,
  normalizeGeoJSON,
} = require("../geojson-utils.js");

test("normalizeGeoJSON wraps a geometry in a FeatureCollection", () => {
  const result = normalizeGeoJSON({
    type: "Point",
    coordinates: [151.2, -33.8],
  });

  assert.equal(result.type, "FeatureCollection");
  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].geometry.type, "Point");
});

test("createLayersFromGeoJSON splits mixed geometry data", () => {
  const layers = createLayersFromGeoJSON(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [0, 0] },
        },
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "MultiPoint",
            coordinates: [
              [1, 1],
              [2, 2],
            ],
          },
        },
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    },
    "sample.geojson",
  );

  assert.equal(layers.length, 3);
  assert.deepEqual(
    layers.map((layer) => [layer.geometryLabel, layer.featureCount]).sort(),
    [
      ["lines", 1],
      ["points", 2],
      ["polygons", 1],
    ],
  );
});

test("getVisibleFeatures filters hidden layers", () => {
  const features = getVisibleFeatures([
    {
      visible: true,
      data: { type: "FeatureCollection", features: [{ id: 1 }] },
    },
    {
      visible: false,
      data: { type: "FeatureCollection", features: [{ id: 2 }] },
    },
  ]);

  assert.deepEqual(features, [{ id: 1 }]);
});

test("getGeoJsonBounds calculates bounds across nested coordinates", () => {
  const bounds = getGeoJsonBounds({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [150, -34],
              [151, -33],
            ],
            [
              [149.5, -35],
              [152, -32.5],
            ],
          ],
        },
      },
    ],
  });

  assert.deepEqual(bounds, [
    [149.5, -35],
    [152, -32.5],
  ]);
});

test("makeRandomStyle returns valid deck-ready style values", () => {
  const style = makeRandomStyle("lines");

  assert.equal(style.lineColor.length, 4);
  assert.equal(style.fillColor.length, 4);
  assert.equal(style.fillColor[3], 90);
  assert.ok(style.pointRadius >= 5 && style.pointRadius <= 11);
  assert.ok(style.lineWidth >= 3 && style.lineWidth <= 5);
});

test("escapeHtml escapes unsafe characters", () => {
  assert.equal(
    escapeHtml(`"<script>alert('x')</script>&"`),
    "&quot;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;&quot;",
  );
});

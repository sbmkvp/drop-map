(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.GeoJsonUtils = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeGeoJSON(data) {
    if (!data || typeof data !== "object") {
      throw new Error("File did not contain a JSON object.");
    }

    if (data.type === "FeatureCollection") {
      return data;
    }

    if (data.type === "Feature") {
      return { type: "FeatureCollection", features: [data] };
    }

    if (data.type && data.coordinates) {
      return {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: data }],
      };
    }

    throw new Error("Unsupported GeoJSON structure.");
  }

  function createLayersFromGeoJSON(geojson, fileName) {
    const groups = {
      points: [],
      lines: [],
      polygons: [],
    };

    geojson.features.forEach((feature) => {
      const bucket = getGeometryBucket(feature.geometry?.type);
      if (bucket) {
        groups[bucket].push(feature);
      }
    });

    const nonEmptyGroups = Object.entries(groups).filter(
      ([, features]) => features.length > 0,
    );

    return nonEmptyGroups.map(([bucket, features], index) => ({
      id: `${sanitizeId(fileName)}-${bucket}-${index}`,
      fileName,
      label: nonEmptyGroups.length > 1 ? `${fileName} · ${bucket}` : fileName,
      geometryLabel: bucket,
      featureCount: features.length,
      visible: true,
      style: makeRandomStyle(bucket),
      data: {
        type: "FeatureCollection",
        features,
      },
    }));
  }

  function getGeometryBucket(geometryType = "") {
    if (geometryType.includes("Point")) {
      return "points";
    }
    if (geometryType.includes("LineString")) {
      return "lines";
    }
    if (geometryType.includes("Polygon")) {
      return "polygons";
    }
    return null;
  }

  function makeRandomStyle(bucket) {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 62 + Math.floor(Math.random() * 24);
    const lightness = 42 + Math.floor(Math.random() * 16);

    return {
      lineColor: hslToRgb(hue, saturation, lightness, 230),
      fillColor: hslToRgb(
        hue,
        Math.max(saturation - 10, 45),
        lightness + 18,
        bucket === "lines" ? 90 : 155,
      ),
      pointRadius: 5 + Math.floor(Math.random() * 7),
      lineWidth: bucket === "polygons" ? 2 : 3 + Math.floor(Math.random() * 3),
    };
  }

  function hslToRgb(h, s, l, alpha) {
    const saturation = s / 100;
    const lightness = l / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const segment = h / 60;
    const x = chroma * (1 - Math.abs((segment % 2) - 1));
    let red = 0;
    let green = 0;
    let blue = 0;

    if (segment >= 0 && segment < 1) {
      red = chroma;
      green = x;
    } else if (segment < 2) {
      red = x;
      green = chroma;
    } else if (segment < 3) {
      green = chroma;
      blue = x;
    } else if (segment < 4) {
      green = x;
      blue = chroma;
    } else if (segment < 5) {
      red = x;
      blue = chroma;
    } else {
      red = chroma;
      blue = x;
    }

    const match = lightness - chroma / 2;
    return [
      Math.round((red + match) * 255),
      Math.round((green + match) * 255),
      Math.round((blue + match) * 255),
      alpha,
    ];
  }

  function getVisibleFeatures(layerRegistry) {
    return layerRegistry
      .filter((entry) => entry.visible)
      .flatMap((entry) => entry.data.features);
  }

  function getGeoJsonBounds(geojson) {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    geojson.features.forEach((feature) => {
      traverseCoordinates(feature.geometry?.coordinates, (lng, lat) => {
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          return;
        }
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      });
    });

    if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) {
      return null;
    }

    if (minLng === maxLng) {
      minLng -= 0.01;
      maxLng += 0.01;
    }

    if (minLat === maxLat) {
      minLat -= 0.01;
      maxLat += 0.01;
    }

    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ];
  }

  function traverseCoordinates(coords, visitor) {
    if (!Array.isArray(coords)) {
      return;
    }

    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      visitor(coords[0], coords[1]);
      return;
    }

    coords.forEach((entry) => traverseCoordinates(entry, visitor));
  }

  function sanitizeId(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[char];
    });
  }

  return {
    createLayersFromGeoJSON,
    escapeHtml,
    getGeoJsonBounds,
    getVisibleFeatures,
    makeRandomStyle,
    normalizeGeoJSON,
  };
});

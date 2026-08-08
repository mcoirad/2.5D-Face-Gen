import { clamp, lerp, smoothstep } from "./geometry.js";

const LONGITUDINAL_SEGMENTS = 18;
const FRONT_FLAP_START = 0.75;
const CREST_TOP_Q = -0.2;
const CREST_BOTTOM_Q = 0.35;
const LOWER_EDGE_Q = 1;
const UPPER_EDGE_Q = -1;
const GEOMETRY_EPSILON = 1e-6;

export function solveCloak(params, pose, source) {
  if (!params.showCloak || !source?.projectTorsoPoint || !source.torsoHalfWidth) {
    return null;
  }

  const settings = {
    showShine: Boolean(params.showCloakShine),
    foldCount: Math.round(clamp(params.cloakFoldCount ?? 4, 2, 8)),
    foldScale: clamp(params.cloakFoldScale ?? 1, 0.5, 2),
    foldWidth: clamp(params.cloakFoldWidth ?? 22, 10, 36),
    foldDepth: clamp(params.cloakFoldDepth ?? 14, 0, 28),
    foldSag: clamp(params.cloakFoldSag ?? 10, 0, 30),
    foldOverhang: clamp(params.cloakFoldOverhang ?? 0.45, 0, 1),
    foldSweep: clamp(params.cloakFoldSweep ?? 8, -30, 30),
    foldIrregularity: clamp(params.cloakFoldIrregularity ?? 0.18, 0, 1),
    shoulderDrape: clamp(params.cloakShoulderDrape ?? 24, 0, 60),
    frontOverlap: clamp(params.cloakFrontOverlap ?? 0.35, -1, 1),
    asymmetry: clamp(params.cloakAsymmetry ?? 0, -1, 1)
  };
  const baseColor = validColor(params.cloakColor, "#4a304f");
  const colors = {
    base: baseColor,
    crest: lightenHex(baseColor, 0.18),
    underside: darkenHex(baseColor, 0.62),
    outline: "black"
  };
  const topSide = settings.frontOverlap < 0 ? -1 : 1;
  const sections = [];

  for (let bandIndex = 0; bandIndex < settings.foldCount; bandIndex += 1) {
    for (const side of [-1, 1]) {
      const samples = addFacingCrossings(
        makeHalfBandSamples(source, bandIndex, side, settings),
        source,
        settings
      );
      const runs = splitRuns(samples);

      for (const [runIndex, run] of runs.entries()) {
        const section = makeSection({
          source,
          samples: run.samples,
          settings,
          colors,
          bandIndex,
          side,
          runIndex,
          layer: run.layer,
          frontFlap: run.frontFlap,
          topFlap: run.frontFlap && side === topSide
        });

        if (section) sections.push(section);
      }
    }
  }

  return {
    back: sections.filter(section => section.layer === "back"),
    front: sections.filter(section => section.layer === "front"),
    sections,
    settings,
    colors
  };
}

function makeHalfBandSamples(source, bandIndex, side, settings) {
  return Array.from({ length: LONGITUDINAL_SEGMENTS + 1 }, (_, index) => {
    const u = index / LONGITUDINAL_SEGMENTS;
    return makeBandSample(source, bandIndex, side, settings, u);
  });
}

function makeBandSample(source, bandIndex, side, settings, u) {
  const level = bandIndex / Math.max(1, settings.foldCount - 1);
  const theta = side * Math.PI * (1 - u);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const shoulderAmount = Math.sin(theta) ** 2;
  const frontAmount = smoothstep(0.68, 1, u);
  const radiusAmount = level ** 0.75;
  const neckRadiusX = source.neckBottomWidth / 2 + 6;
  const neckRadiusZ = source.neckBottomWidth * 0.42 + 6;
  const radiusX = lerp(neckRadiusX, source.torsoHalfWidth * 0.92, radiusAmount);
  const radiusZ = lerp(neckRadiusZ, source.torsoHalfWidth * 0.46, radiusAmount);
  const crossing = Math.abs(settings.frontOverlap)
    * source.neckBottomWidth * 0.3 * frontAmount;
  const topSide = settings.frontOverlap < 0 ? -1 : 1;
  const topLift = side === topSide && Math.abs(settings.frontOverlap) > GEOMETRY_EPSILON
    ? -settings.foldWidth * 0.12 * frontAmount
    : 0;
  const irregularityLimit = Math.min(settings.foldWidth * 0.18, 4)
    * settings.foldIrregularity;
  const irregularity = irregularityLimit * (
    Math.sin(theta * 2 + bandIndex * 1.71) * 0.62
    + Math.sin(theta * 3 - bandIndex * 0.93) * 0.38
  );
  const unscaledCenter = {
    x: radiusX * sinTheta - side * crossing,
    y: -settings.foldWidth * 0.35
      + bandIndex * settings.foldWidth * 0.62
      + settings.foldSag * shoulderAmount
      + settings.shoulderDrape * level * shoulderAmount
      + settings.foldSweep * frontAmount
      + side * settings.asymmetry * settings.foldWidth * 0.5 * frontAmount
      + topLift
      + irregularity,
    z: radiusZ * cosTheta
  };
  const center = {
    x: unscaledCenter.x * settings.foldScale,
    y: source.neckBottomY + unscaledCenter.y * settings.foldScale,
    z: unscaledCenter.z * settings.foldScale
  };
  const normal = normalize3({
    x: sinTheta / Math.max(radiusX, 1),
    y: 0,
    z: cosTheta / Math.max(radiusZ, 1)
  });

  return { u, center, normal, facing: facingForSample(source, center, normal) };
}

function facingForSample(source, center, normal) {
  const projected = source.projectTorsoPoint(center.x, center.y, center.z);
  const projectedNormal = source.projectTorsoPoint(
    center.x + normal.x,
    center.y + normal.y,
    center.z + normal.z
  );
  return projectedNormal.depth - projected.depth;
}

function addFacingCrossings(samples, source, settings) {
  const result = [samples[0]];

  for (let index = 0; index < samples.length - 1; index += 1) {
    const first = samples[index];
    const second = samples[index + 1];
    const insertions = [];

    if (first.facing * second.facing < -GEOMETRY_EPSILON) {
      insertions.push(first.facing / (first.facing - second.facing));
    }
    if (first.u < FRONT_FLAP_START && second.u > FRONT_FLAP_START) {
      insertions.push((FRONT_FLAP_START - first.u) / (second.u - first.u));
    }

    for (const amount of [...new Set(insertions)].sort((a, b) => a - b)) {
      const center = lerp3(first.center, second.center, amount);
      const normal = normalize3(lerp3(first.normal, second.normal, amount));
      result.push({
        u: lerp(first.u, second.u, amount),
        center,
        normal,
        facing: facingForSample(source, center, normal)
      });
    }

    result.push(second);
  }

  return result.map(sample => ({
    ...sample,
    rows: makeRows(sample, settings)
  }));
}

function makeRows(sample, settings) {
  return {
    upper: crossSectionPoint(sample, UPPER_EDGE_Q, settings),
    crestTop: crossSectionPoint(sample, taperedOverlayQ(CREST_TOP_Q, CREST_BOTTOM_Q, sample.u), settings),
    crestBottom: crossSectionPoint(sample, taperedOverlayQ(CREST_BOTTOM_Q, CREST_TOP_Q, sample.u), settings),
    crease: crossSectionPoint(sample, taperedOverlayQ(CREST_BOTTOM_Q, CREST_TOP_Q, sample.u), settings),
    lower: crossSectionPoint(sample, LOWER_EDGE_Q, settings),
    shadowTop: crossSectionPoint(sample, taperedOverlayQ(CREST_BOTTOM_Q, LOWER_EDGE_Q, sample.u), settings),
    shadowBottom: crossSectionPoint(sample, taperedOverlayQ(LOWER_EDGE_Q, CREST_BOTTOM_Q, sample.u), settings)
  };
}

function taperedOverlayQ(q, otherQ, u) {
  const taper = 1 - smoothstep(0.85, 1, u);
  const midpoint = (q + otherQ) / 2;
  return lerp(midpoint, q, taper);
}

function crossSectionPoint(sample, q, settings) {
  const overhangAmount = smoothstep(CREST_BOTTOM_Q, LOWER_EDGE_Q, q);
  const scaledWidth = settings.foldWidth * settings.foldScale;
  const scaledDepth = settings.foldDepth * settings.foldScale;
  const bulge = scaledDepth * (1 - q * q) ** 2;
  const overhangDepth = scaledDepth * settings.foldOverhang * 0.35 * overhangAmount;

  return {
    x: sample.center.x + sample.normal.x * (bulge + overhangDepth),
    y: sample.center.y
      + q * scaledWidth / 2
      + scaledWidth * settings.foldOverhang * 0.18 * overhangAmount,
    z: sample.center.z + sample.normal.z * (bulge + overhangDepth)
  };
}

function splitRuns(samples) {
  return Array.from({ length: samples.length - 1 }, (_, index) => {
    const midpointU = (samples[index].u + samples[index + 1].u) / 2;
    const facing = (samples[index].facing + samples[index + 1].facing) / 2;
    const layer = facing >= 0 ? "front" : "back";
    return {
      layer,
      frontFlap: layer === "front" && midpointU >= FRONT_FLAP_START,
      start: index,
      end: index,
      samples: samples.slice(index, index + 2)
    };
  });
}

function makeSection({
  source,
  samples,
  settings,
  colors,
  bandIndex,
  side,
  runIndex,
  layer,
  frontFlap,
  topFlap
}) {
  const closesAtFront = samples.at(-1).u >= 1 - GEOMETRY_EPSILON;
  const upper = samples.map(sample => projectModel(source, sample.rows.upper));
  const lower = samples.map(sample => projectModel(source, sample.rows.lower));
  const cap = closesAtFront ? makeRoundedCap(source, samples, settings) : [];
  const envelopePoints = normalizePolygon([...upper, ...cap, ...[...lower].reverse()]);

  if (!validPolygon(envelopePoints)) return null;

  const crest = settings.showShine
    ? makePatch(
        source,
        samples,
        "crestTop",
        "crestBottom",
        colors.crest
      )
    : null;
  const underside = makePatch(
    source,
    samples,
    "shadowTop",
    "shadowBottom",
    colors.underside
  );
  const crease = normalizeLine(samples.map(sample => projectModel(source, sample.rows.crease)));
  const id = `cloak-fold-${bandIndex}-${side < 0 ? "left" : "right"}-${layer}-${runIndex}`;

  return {
    id,
    layer,
    side,
    bandIndex,
    frontFlap,
    topFlap,
    depth: averageDepth(envelopePoints),
    envelope: { id: `${id}-envelope`, points: envelopePoints, fill: colors.base },
    crest,
    underside,
    crease: crease.length >= 2
      ? { id: `${id}-crease`, points: crease, stroke: colors.outline, width: 2 }
      : null,
    seamStart: {
      upper: upper[0],
      lower: lower[0]
    },
    seamEnd: {
      upper: upper.at(-1),
      lower: lower.at(-1)
    }
  };
}

function makePatch(source, samples, firstRow, secondRow, fill) {
  const first = samples.map(sample => projectModel(source, sample.rows[firstRow]));
  const second = samples.map(sample => projectModel(source, sample.rows[secondRow]));
  const points = normalizePolygon([...first, ...[...second].reverse()]);

  if (!validPolygon(points)) return null;
  return { points, fill };
}

function makeRoundedCap(source, samples, settings) {
  const sample = samples.at(-1);
  const previous = samples.at(-2);
  const tangent = normalize3(subtract3(sample.center, previous.center));

  return Array.from({ length: 5 }, (_, index) => {
    const angle = (index + 1) / 6 * Math.PI;
    const q = -Math.cos(angle);
    const point = crossSectionPoint(sample, q, settings);
    const capAmount = Math.sin(angle) * settings.foldWidth * settings.foldScale * 0.35;
    return projectModel(source, add3(point, scale3(tangent, capAmount)));
  });
}

function projectModel(source, point) {
  return source.projectTorsoPoint(point.x, point.y, point.z);
}

function averageDepth(points) {
  return points.reduce((sum, point) => sum + (point.depth ?? 0), 0) / Math.max(points.length, 1);
}

function normalizePolygon(points) {
  const normalized = normalizeLine(points);
  if (normalized.length > 1 && distance2(normalized[0], normalized.at(-1)) <= GEOMETRY_EPSILON) {
    normalized.pop();
  }
  return normalized;
}

function normalizeLine(points) {
  const result = [];
  for (const point of points) {
    if (!result.length || distance2(result.at(-1), point) > GEOMETRY_EPSILON) {
      result.push(point);
    }
  }
  return result;
}

function validPolygon(points) {
  return points.length >= 3
    && points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    && Math.abs(polygonArea(points)) > 1e-4
    && !polygonSelfIntersects(points);
}

function polygonArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function polygonSelfIntersects(points) {
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (first === second
        || (first + 1) % points.length === second
        || (second + 1) % points.length === first) continue;
      if (segmentsIntersect(
        points[first],
        points[(first + 1) % points.length],
        points[second],
        points[(second + 1) % points.length]
      )) return true;
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross2(a, b, c);
  const abD = cross2(a, b, d);
  const cdA = cross2(c, d, a);
  const cdB = cross2(c, d, b);
  return abC * abD < -GEOMETRY_EPSILON && cdA * cdB < -GEOMETRY_EPSILON;
}

function cross2(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function distance2(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function lerp3(first, second, amount) {
  return {
    x: lerp(first.x, second.x, amount),
    y: lerp(first.y, second.y, amount),
    z: lerp(first.z, second.z, amount)
  };
}

function add3(first, second) {
  return { x: first.x + second.x, y: first.y + second.y, z: first.z + second.z };
}

function subtract3(first, second) {
  return { x: first.x - second.x, y: first.y - second.y, z: first.z - second.z };
}

function scale3(point, amount) {
  return { x: point.x * amount, y: point.y * amount, z: point.z * amount };
}

function normalize3(point) {
  const length = Math.hypot(point.x, point.y, point.z);
  return length > GEOMETRY_EPSILON
    ? scale3(point, 1 / length)
    : { x: 0, y: 0, z: 1 };
}

function validColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value : fallback;
}

function darkenHex(value, amount) {
  const numeric = Number.parseInt(value.slice(1), 16);
  const channels = [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];
  return `#${channels.map(channel => Math.round(channel * amount).toString(16).padStart(2, "0")).join("")}`;
}

function lightenHex(value, amount) {
  const numeric = Number.parseInt(value.slice(1), 16);
  const channels = [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];
  return `#${channels.map(channel => Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, "0")).join("")}`;
}

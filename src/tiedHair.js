import { clamp, lerp, smoothstep } from "./geometry.js";
import { makeHairV2Lock } from "./hairV2.js";
import {
  addPoints,
  normalizePoint,
  scalePoint,
  subtractPoints
} from "./rig.js";

const TAIL_SEGMENTS = 12;
const SHINE_OPACITY = 1;
const SHINE_SHADOW_FLOOR = 0.35;
const SHINE_ASYMMETRY_STRENGTH = 1.5;
const SHINE_ASYMMETRY_MAX_BIAS = 0.9;
const SHINE_MAX_WIDTH_FRACTION = 0.92;

export function solveTailInstance({
  params,
  tiePoint,
  length,
  width,
  lift,
  lateral,
  detailSeed,
  color,
  shineColor,
  tieColor,
  layer = "back"
}) {
  const tieWidth = clamp(width * 0.18, 10, 24);
  const depthPosition = tiePoint.depthPosition ?? -1;
  const controls = [
    tiePoint,
    {
      x: tiePoint.x + lateral * width * (0.35 + 0.45 * lift),
      y: tiePoint.y - length * 0.2 * lift
    },
    {
      x: tiePoint.x + lateral * width * 0.8,
      y: tiePoint.y + length * 0.45
    },
    {
      x: tiePoint.x + lateral * width * 0.55,
      y: tiePoint.y + length
    }
  ];
  const points = Array.from({ length: TAIL_SEGMENTS + 1 }, (_, index) => (
    cubicBezierPoint(controls, index / TAIL_SEGMENTS)
  ));
  const widthAt = t => ponytailTailWidthAt(t, tieWidth, width);
  const massWidths = points.map((_, index) => widthAt(index / TAIL_SEGMENTS));
  const mass = {
    ...finishVariableRibbonGeometry(
      buildVariableWidthRibbonGeometry(points, ({ t }) => widthAt(t)),
      points,
      massWidths,
      layer,
      color.fill,
      color.stroke,
      1
    ),
    role: "tail"
  };
  const headings = makePointHeadings(points);
  const shine = params.showHairV2Shine
    ? makeTailShine(params, points, widthAt, lateral, shineColor, layer)
    : null;
  const details = makeDetailLocks({
    params,
    points,
    headings,
    lateral,
    length,
    width,
    detailSeed,
    color,
    shineColor,
    layer,
    depthPosition
  });

  return {
    tailMass: mass,
    tailShine: shine,
    detailLocks: details.map(result => result.lock),
    detailShines: details.flatMap(result => result.shine ? [result.shine] : []),
    tie: makeHairTie(tiePoint, headings[0], width, tieColor, layer)
  };
}

export function ponytailTailWidthAt(t, tieWidth, fullWidth) {
  const expansion = smoothstep(0, 0.22, clamp(t, 0, 1));
  const taper = 1 - smoothstep(0.62, 1, clamp(t, 0, 1));
  return lerp(tieWidth, fullWidth, expansion) * taper;
}

export function makeHairTie(center, hairDirection, bundleWidth, color, layer = "back") {
  const across = { x: -hairDirection.y, y: hairDirection.x };
  const along = hairDirection;
  const acrossRadius = clamp(bundleWidth * 0.16, 8, 21);
  const alongRadius = clamp(bundleWidth * 0.05, 3, 7);
  const segments = 16;
  const points = Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return addPoints(
      center,
      addPoints(
        scalePoint(across, Math.cos(angle) * acrossRadius),
        scalePoint(along, Math.sin(angle) * alongRadius)
      )
    );
  });

  return {
    points,
    center,
    layer,
    fill: color.fill,
    stroke: color.stroke,
    opacity: 1
  };
}

function makeTailShine(params, points, widthAt, lateral, shineColor, layer) {
  const alignment = lateral * params.hairV2LightX;
  const shadowTarget = alignment >= 0 ? 1 : SHINE_SHADOW_FLOOR;
  const illumination = lerp(1, shadowTarget, Math.abs(alignment));
  const lengthFraction = clamp(params.hairV2ShineLength * illumination, 0, 1);

  if (lengthFraction <= 0 || params.hairV2ShineWidth <= 0) {
    return null;
  }

  const lastIndex = Math.max(1, Math.round((points.length - 1) * lengthFraction));
  const shinePoints = points.slice(0, lastIndex + 1);
  const shineWidthFraction = Math.min(
    params.hairV2ShineWidth * illumination,
    SHINE_MAX_WIDTH_FRACTION
  );
  const maxBias = maxShineBias(shineWidthFraction);
  const widthSamples = shinePoints.map((_, index) => {
    const globalT = (index / lastIndex) * lengthFraction;
    return widthAt(globalT) * shineWidthFraction;
  });
  const geometry = buildVariableWidthRibbonGeometry(
    shinePoints,
    ({ index }) => widthSamples[index],
    ({ perp }) => clamp(
      perp.x * params.hairV2LightX * SHINE_ASYMMETRY_STRENGTH,
      -maxBias,
      maxBias
    )
  );

  return {
    ...finishVariableRibbonGeometry(
      geometry,
      shinePoints,
      widthSamples,
      layer,
      shineColor,
      "none",
      SHINE_OPACITY
    ),
    role: "tail-shine"
  };
}

function makeDetailLocks({ params, points, headings, lateral, length, width, detailSeed, color, shineColor, layer, depthPosition }) {
  const details = [
    { t: 0.18, length: 0.68, width: 0.18, mirror: -1 },
    { t: 0.32, length: 0.54, width: 0.16, mirror: 1 },
    { t: 0, length: 0.32, width: 0.1, mirror: lateral < 0 ? -1 : 1 }
  ];

  return details.map((detail, index) => {
    const pointIndex = Math.min(
      points.length - 2,
      Math.max(0, Math.round(detail.t * (points.length - 1)))
    );

    return makeHairV2Lock({
      index: detailSeed + index,
      base: {
        ...points[pointIndex],
        sidePosition: lateral,
        depthPosition
      },
      direction: headings[pointIndex],
      params,
      lengthOverride: length * detail.length,
      widthOverride: Math.min(params.hairV2LockWidth * 0.45, width * detail.width),
      color,
      shineColor,
      curveMirror: detail.mirror,
      sidePosition: lateral,
      depthPosition,
      layer
    });
  });
}

function cubicBezierPoint([p0, p1, p2, p3], t) {
  const inverse = 1 - t;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * t;
  const c = 3 * inverse * t * t;
  const d = t * t * t;
  return {
    x: p0.x * a + p1.x * b + p2.x * c + p3.x * d,
    y: p0.y * a + p1.y * b + p2.y * c + p3.y * d
  };
}

function makePointHeadings(points) {
  return Array.from({ length: points.length - 1 }, (_, index) => (
    normalizePoint(subtractPoints(points[index + 1], points[index]))
  ));
}

function buildVariableWidthRibbonGeometry(points, widthAt, biasAt = () => 0) {
  const headings = makePointHeadings(points);
  const last = points.length - 1;
  const leftEdge = [];
  const rightEdge = [];

  for (let index = 0; index <= last; index += 1) {
    const tangent = index === 0
      ? headings[0]
      : index === last
        ? headings[last - 1]
        : normalizePoint(addPoints(headings[index - 1], headings[index]));
    const perp = { x: -tangent.y, y: tangent.x };
    const t = index / last;
    const width = Math.max(0, widthAt({ t, point: points[index], index }));
    const bias = clamp(biasAt({ t, point: points[index], index, tangent, perp }), -0.95, 0.95);
    const halfWidth = width / 2;

    leftEdge.push({
      x: points[index].x - perp.x * halfWidth * (1 - bias),
      y: points[index].y - perp.y * halfWidth * (1 - bias)
    });
    rightEdge.push({
      x: points[index].x + perp.x * halfWidth * (1 + bias),
      y: points[index].y + perp.y * halfWidth * (1 + bias)
    });
  }

  return {
    rootLeft: leftEdge[0],
    rootRight: rightEdge[0],
    tip: points[last],
    tipLeft: leftEdge[last],
    tipRight: rightEdge[last],
    spineLeft: buildSmoothPath(leftEdge),
    spineRight: buildSmoothPath([...rightEdge].reverse())
  };
}

function finishVariableRibbonGeometry(geometry, points, widthSamples, layer, fill, stroke, opacity) {
  return {
    ...geometry,
    rootControl: null,
    notch: null,
    detailLines: [],
    spinePoints: points,
    widthSamples,
    layer,
    fill,
    stroke,
    opacity
  };
}

function buildSmoothPath(pointList, tensionFactor = 0.35) {
  const segments = [];
  for (let index = 0; index < pointList.length - 1; index += 1) {
    const p0 = pointList[index - 1] ?? pointList[index];
    const p1 = pointList[index];
    const p2 = pointList[index + 1];
    const p3 = pointList[index + 2] ?? p2;
    const c1 = addPoints(p1, scalePoint(subtractPoints(p2, p0), tensionFactor / 3));
    const c2 = addPoints(p2, scalePoint(subtractPoints(p1, p3), tensionFactor / 3));
    segments.push({ c1, c2, to: p2 });
  }
  return segments;
}

function maxShineBias(shineWidthFraction) {
  if (shineWidthFraction <= 0) return SHINE_ASYMMETRY_MAX_BIAS;
  return Math.max(0, Math.min(
    SHINE_ASYMMETRY_MAX_BIAS,
    SHINE_MAX_WIDTH_FRACTION / shineWidthFraction - 1
  ));
}

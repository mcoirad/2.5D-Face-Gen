import { clamp, lerp, smoothstep } from "./geometry.js";
import { resolveHairV2Layer } from "./hairV2.js";
import { createStructureProjector, resolveHairColor } from "./rig.js";

const U_RANGE = 2;
const FOREHEAD_DEPTH_RADIUS = 72;
const BAND_SEGMENTS = 48;
const ELLIPSE_SEGMENTS = 24;
// The skull ellipse uses negative theta for the crown and positive theta for
// the lower forehead. Keep the complete control range on that lower half so
// the band and pendant sit below the crown-heavy hair region.
const FOREHEAD_THETA_UPPER = 0.08;
const FOREHEAD_THETA_LOWER = 0.32;

export function solveFerronniere(params, pose, structure, features = null) {
  if (!params.showFerronniere) {
    return null;
  }

  const project = createStructureProjector(params);
  const bandStyle = params.ferronniereBandStyle === "double" ? "double" : "single";
  const bandThickness = clamp(params.ferronniereBandThickness, 1, 6);
  const bandTheta = lerp(
    FOREHEAD_THETA_UPPER,
    FOREHEAD_THETA_LOWER,
    clamp(params.ferronnierePosition, 0, 1)
  );
  const metalColor = resolveHairColor(params, "ferronniereMetalColor");
  const gemColor = resolveHairColor(params, "ferronniereGemColor");
  const lineSeparation = Math.max(3, bandThickness * 1.75);
  const thetaSeparation = lineSeparation / Math.max(structure.skull.ry, 1);
  const ringThetas = bandStyle === "double"
    ? [bandTheta - thetaSeparation / 2, bandTheta + thetaSeparation / 2]
    : [bandTheta];
  const bandRuns = ringThetas.flatMap((theta, lineIndex) => (
    splitSurfaceRuns(sampleSurfaceRing(theta, params, pose, structure, project)).map(run => ({
      ...run,
      lineIndex,
      stroke: metalColor.fill,
      outline: metalColor.stroke,
      strokeWidth: bandThickness
    }))
  ));

  const gemSize = clamp(params.ferronniereGemSize, 6, 36);
  const gemRadius = gemSize / 2;
  const holderRadius = gemRadius * 1.35;
  const connectorLength = clamp(gemSize * 0.35, 4, 10);
  const holderTheta = bandTheta + (holderRadius + connectorLength) / Math.max(structure.skull.ry, 1);
  const pendantTargetX = resolvePendantTargetX(pose, features);
  const anchorU = pendantTargetX !== null
    ? solveFrontSurfaceU(pendantTargetX, holderTheta, pose, structure, project)
    : 0;
  const bandAnchor = surfaceSample(anchorU, bandTheta, params, pose, structure, project);
  const holderAnchor = surfaceSample(anchorU, holderTheta, params, pose, structure, project);
  const frame = makeAdornmentFrame(holderAnchor.guideAngle);
  const holder = makeSplitDisk(holderAnchor.position3, frame, holderRadius, params.pitch, project, {
    layer: resolveHairV2Layer(holderAnchor.depthPosition),
    fill: metalColor.fill,
    stroke: metalColor.stroke,
    role: "holder"
  });
  const layer = holder.layer;
  const connectorTop = bandAnchor.point;
  const connectorBottom3 = add3(
    holderAnchor.position3,
    scale3(frame.vertical, -holderRadius * 0.82)
  );
  const connectorBottom = project(connectorBottom3.x, connectorBottom3.y, connectorBottom3.z);
  const connector = {
    points: [connectorTop, connectorBottom],
    layer,
    stroke: metalColor.fill,
    outline: metalColor.stroke,
    strokeWidth: Math.max(1, bandThickness * 0.8)
  };

  const protrusion = clamp(params.ferronniereGemProtrusion, 0, 1);
  const gemDepth = gemRadius * protrusion;
  const gemFrontCenter3 = add3(holderAnchor.position3, scale3(frame.normal, gemDepth));
  const gemBase = makeSplitDisk(
    holderAnchor.position3,
    frame,
    gemRadius,
    params.pitch,
    project,
    {}
  );
  const gemProjection = makeSplitDisk(
    gemFrontCenter3,
    frame,
    gemRadius,
    params.pitch,
    project,
    {}
  );
  const gemSide = {
    points: convexHull([...gemBase.points, ...gemProjection.points]),
    center: averagePoint([gemBase.center, gemProjection.center]),
    layer,
    fill: metalColor.fill,
    stroke: metalColor.stroke,
    opacity: 1
  };
  const gem = {
    ...gemProjection,
    layer,
    fill: gemColor.fill,
    stroke: gemColor.stroke,
    opacity: 1
  };

  return {
    bandStyle,
    bandRuns,
    connector,
    holder,
    gemSide,
    gem,
    anchorPoint: bandAnchor.point,
    anchorU,
    pendantTargetX,
    layer
  };
}

function resolvePendantTargetX(pose, features) {
  const bridgeX = features?.nose?.bridge?.x;
  const brows = features?.brows;
  if (!Number.isFinite(bridgeX)) {
    return null;
  }
  if (!Array.isArray(brows) || brows.length < 2) {
    return bridgeX;
  }

  const innerCenters = brows.slice(0, 2).map(brow => ({
    x: (brow.topInner.x + brow.bottomInner.x) / 2,
    y: (brow.topInner.y + brow.bottomInner.y) / 2
  }));
  if (!innerCenters.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    return bridgeX;
  }

  const interbrowX = (innerCenters[0].x + innerCenters[1].x) / 2;
  // Preserve the authored bridge at front and profile, where it already reads
  // as the facial midpoint. Through three-quarter yaw, move halfway toward the
  // actual visual gap between the solved eyebrow shapes, then yield smoothly
  // back to the bridge approaching profile.
  const awayFromFront = smoothstep(0.15, 0.4, pose.amount);
  const towardProfile = smoothstep(0.75, 1, pose.amount);
  const interbrowWeight = 0.5 * awayFromFront * (1 - towardProfile);
  return lerp(bridgeX, interbrowX, interbrowWeight);
}

function solveFrontSurfaceU(targetScreenX, theta, pose, structure, project) {
  const screenCenterX = project(0, 0, 0).x;
  const horizontalRadius = Math.max(
    Math.abs(Math.cos(theta) * structure.skull.rx),
    1e-6
  );
  const targetSidePosition = clamp(
    (targetScreenX - screenCenterX) / horizontalRadius,
    -1,
    1
  );
  // asin selects the front-facing solution, whose yaw depth is nonnegative.
  // Adding the head turn converts that projected guide angle back into the
  // head-fixed longitude used by the ring solver.
  const guideAngle = Math.asin(targetSidePosition);
  const longitude = guideAngle + pose.yaw * Math.PI / 2;
  return clamp(longitude / (Math.PI / 2), -U_RANGE, U_RANGE);
}

function sampleSurfaceRing(theta, params, pose, structure, project) {
  return Array.from({ length: BAND_SEGMENTS + 1 }, (_, index) => (
    surfaceSample(
      lerp(-U_RANGE, U_RANGE, index / BAND_SEGMENTS),
      theta,
      params,
      pose,
      structure,
      project
    )
  ));
}

function surfaceSample(u, theta, params, pose, structure, project) {
  const longitude = u * Math.PI / 2;
  const guideAngle = longitude - pose.yaw * Math.PI / 2;
  const radialScale = Math.cos(theta);
  const sidePosition = Math.sin(guideAngle);
  const yawDepth = Math.cos(guideAngle);
  const position3 = {
    x: radialScale * structure.skull.rx * sidePosition,
    y: structure.skull.cy + Math.sin(theta) * structure.skull.ry,
    z: FOREHEAD_DEPTH_RADIUS * radialScale * yawDepth
  };
  const depthPosition = Math.sin(theta) * Math.sin(params.pitch)
    + radialScale * yawDepth * Math.cos(params.pitch);

  return {
    point: project(position3.x, position3.y, position3.z),
    position3,
    depthPosition,
    sidePosition,
    guideAngle
  };
}

function splitSurfaceRuns(samples) {
  const runs = [];
  let current = [];
  let currentLayer = null;

  for (const sample of samples) {
    const layer = resolveHairV2Layer(sample.depthPosition);
    if (currentLayer !== null && layer !== currentLayer) {
      runs.push({ points: current.map(item => item.point), layer: currentLayer });
      current = [];
    }
    currentLayer = layer;
    current.push(sample);
  }

  if (current.length) {
    runs.push({ points: current.map(item => item.point), layer: currentLayer });
  }

  if (runs.length > 1 && runs[0].layer === runs[runs.length - 1].layer) {
    const first = runs.shift();
    const last = runs.pop();
    runs.unshift({ points: [...last.points, ...first.points], layer: first.layer });
  }

  return runs;
}

function makeAdornmentFrame(angle) {
  return {
    horizontal: { x: Math.cos(angle), y: 0, z: -Math.sin(angle) },
    vertical: { x: 0, y: 1, z: 0 },
    normal: { x: Math.sin(angle), y: 0, z: Math.cos(angle) }
  };
}

function makeSplitDisk(center3, frame, radius, pitch, project, style) {
  const center = project(center3.x, center3.y, center3.z);
  const horizontalProjection = projectVector(frame.horizontal, pitch);
  const normalProjection = projectVector(frame.normal, pitch);
  const verticalProjection = projectVector(frame.vertical, pitch);
  const tangentScale = clamp(Math.hypot(horizontalProjection.x, horizontalProjection.y), 0, 1);
  const verticalScale = Math.max(0.2, Math.hypot(verticalProjection.x, verticalProjection.y));
  const attachedRadius = radius * lerp(0.08, 1, tangentScale);
  const outwardRadius = radius;
  const outwardSide = Math.sign(normalProjection.x) || -1;
  const verticalRadius = radius * verticalScale;
  const halfSegments = ELLIPSE_SEGMENTS / 2;
  const outwardHalf = Array.from({ length: halfSegments + 1 }, (_, index) => {
    const angle = lerp(-Math.PI / 2, Math.PI / 2, index / halfSegments);
    return {
      x: center.x + outwardSide * outwardRadius * Math.cos(angle),
      y: center.y + verticalRadius * Math.sin(angle)
    };
  });
  const attachedHalf = Array.from({ length: halfSegments + 1 }, (_, index) => {
    const angle = lerp(Math.PI / 2, Math.PI * 3 / 2, index / halfSegments);
    return {
      x: center.x + outwardSide * attachedRadius * Math.cos(angle),
      y: center.y + verticalRadius * Math.sin(angle)
    };
  });
  const points = [
    ...outwardHalf,
    ...attachedHalf.slice(1, -1)
  ];
  return {
    points,
    center,
    screenRadii: [Math.max(outwardRadius, attachedRadius), verticalRadius],
    halfWidths: {
      outward: outwardRadius,
      attached: attachedRadius
    },
    outwardSide,
    ...style,
    opacity: style.opacity ?? 1
  };
}

function projectVector(vector, pitch) {
  return {
    x: vector.x,
    y: vector.y * Math.cos(pitch) - vector.z * Math.sin(pitch)
  };
}


function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const cross = (origin, a, b) => (
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
  );
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function averagePoint(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function add3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale3(point, amount) {
  return { x: point.x * amount, y: point.y * amount, z: point.z * amount };
}

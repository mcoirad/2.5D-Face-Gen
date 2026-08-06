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
  const holder = makeFlatDisk(holderAnchor.position3, frame, holderRadius, project, {
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
  const gemBase = ellipseFromAxes(
    holderAnchor.position3,
    scale3(frame.horizontal, gemRadius),
    scale3(frame.vertical, gemRadius),
    project
  );
  const gemFrontBase = ellipseFromAxes(
    gemFrontCenter3,
    scale3(frame.horizontal, gemRadius),
    scale3(frame.vertical, gemRadius),
    project
  );
  const gemSide = {
    points: convexHull([...gemBase.points, ...gemFrontBase.points]),
    center: averagePoint([gemBase.center, gemFrontBase.center]),
    layer,
    fill: metalColor.fill,
    stroke: metalColor.stroke,
    opacity: 1
  };
  // The visible cabochon cap is flatter than the full setting depth. That
  // leaves some of the metal side wall readable at profile while remaining a
  // true circle at yaw=0, where the normal axis projects entirely into depth.
  const capNormalRadius = gemDepth * 0.45;
  const gemProjection = projectedEllipsoid(
    gemFrontCenter3,
    [
      { axis: frame.horizontal, radius: gemRadius },
      { axis: frame.vertical, radius: gemRadius },
      { axis: frame.normal, radius: capNormalRadius }
    ],
    params.pitch,
    project
  );
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

function makeFlatDisk(center3, frame, radius, project, style) {
  const ellipse = ellipseFromAxes(
    center3,
    scale3(frame.horizontal, radius),
    scale3(frame.vertical, radius),
    project
  );
  return { ...ellipse, ...style, opacity: 1 };
}

function ellipseFromAxes(center3, axisA, axisB, project) {
  const center = project(center3.x, center3.y, center3.z);
  const points = Array.from({ length: ELLIPSE_SEGMENTS }, (_, index) => {
    const angle = index / ELLIPSE_SEGMENTS * Math.PI * 2;
    const point3 = add3(
      center3,
      add3(scale3(axisA, Math.cos(angle)), scale3(axisB, Math.sin(angle)))
    );
    return project(point3.x, point3.y, point3.z);
  });
  return {
    points,
    center,
    screenRadii: projectedRadii(points, center)
  };
}

function projectedEllipsoid(center3, axes, pitch, project) {
  const projectedAxes = axes.map(({ axis, radius }) => {
    const vector = projectVector(scale3(axis, radius), pitch);
    return vector;
  });
  const xx = projectedAxes.reduce((sum, axis) => sum + axis.x * axis.x, 0);
  const xy = projectedAxes.reduce((sum, axis) => sum + axis.x * axis.y, 0);
  const yy = projectedAxes.reduce((sum, axis) => sum + axis.y * axis.y, 0);
  const trace = xx + yy;
  const discriminant = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy * xy));
  const majorValue = Math.max(0, (trace + discriminant) / 2);
  const minorValue = Math.max(0, (trace - discriminant) / 2);
  const angle = Math.abs(xy) > 1e-8 || Math.abs(xx - majorValue) > 1e-8
    ? Math.atan2(majorValue - xx, xy)
    : 0;
  const majorRadius = Math.sqrt(majorValue);
  const minorRadius = Math.sqrt(minorValue);
  const major = { x: Math.cos(angle) * majorRadius, y: Math.sin(angle) * majorRadius };
  const minor = { x: -Math.sin(angle) * minorRadius, y: Math.cos(angle) * minorRadius };
  const center = project(center3.x, center3.y, center3.z);
  const points = Array.from({ length: ELLIPSE_SEGMENTS }, (_, index) => {
    const theta = index / ELLIPSE_SEGMENTS * Math.PI * 2;
    return {
      x: center.x + major.x * Math.cos(theta) + minor.x * Math.sin(theta),
      y: center.y + major.y * Math.cos(theta) + minor.y * Math.sin(theta)
    };
  });
  return { points, center, screenRadii: [majorRadius, minorRadius] };
}

function projectVector(vector, pitch) {
  return {
    x: vector.x,
    y: vector.y * Math.cos(pitch) - vector.z * Math.sin(pitch)
  };
}

function projectedRadii(points, center) {
  const xRadius = points.reduce((max, point) => Math.max(max, Math.abs(point.x - center.x)), 0);
  const yRadius = points.reduce((max, point) => Math.max(max, Math.abs(point.y - center.y)), 0);
  return [xRadius, yRadius];
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

import { clamp, lerp, smoothstep } from "./geometry.js";
import {
  addPoints,
  createStructureProjector,
  makeHairCurveControls,
  normalizePoint,
  offsetPoint,
  resolveHairColor,
  scalePoint,
  seededRandom
} from "./rig.js";

// Latitude (theta) where the scalp ends, head-fixed. Crown is at -PI/2. The
// hairline sits higher in front and lower toward the back, giving a bowl that
// covers the forehead down to roughly the nape.
const FRONT_HAIRLINE_THETA = -0.30 * Math.PI;
const BACK_HAIRLINE_THETA = 0.16 * Math.PI;
// Longitude half-range in units of (PI/2): 2 == full 180deg to the back.
const U_RANGE = 2;
// Latitude the part line is centered on.
const PART_MID_V = 0.45;
// z depth magnitude for the scalp surface (matches the v1 guide depth).
const SCALP_Z = 72;

export function solveHairV2(params, pose, structure) {
  const projectStructure = createStructureProjector(params);
  const { skull } = structure;
  const scalp = (u, v) => scalpPoint(u, v, projectStructure, skull, pose);

  const partU = params.hairV2PartOffset * 0.9;
  const partHalf = lerp(0.03, 0.55, params.hairV2PartLength);
  const midpoint = scalp(partU, PART_MID_V);

  const count = Math.round(params.hairV2LockCount);
  const color = resolveHairColor(params, "hairV2Color");
  const locks = [];

  for (let i = 0; i < count; i += 1) {
    locks.push(makeV2Lock(i, scalp, partU, partHalf, midpoint, params, color));
  }

  return {
    locks,
    partGuide: makePartGuide(scalp, partU, partHalf),
    showPartGuide: Boolean(params.showHairV2PartGuide)
  };
}

// Continuous scalp surface: u = head-fixed longitude (0 = front centre, +/- = sides
// and around to the back), v = latitude from crown (0) to hairline (1). Returns the
// projected screen point plus depthPosition (>0 faces the viewer, <0 is behind the head).
function scalpPoint(u, v, projectStructure, skull, pose) {
  const headLongitude = u * Math.PI / 2;
  const guideAngle = headLongitude - pose.yaw * Math.PI / 2;
  const sidePosition = Math.sin(guideAngle);
  const depthPosition = Math.cos(guideAngle);
  const backness = clamp((1 - Math.cos(headLongitude)) / 2, 0, 1);
  const hairlineTheta = lerp(FRONT_HAIRLINE_THETA, BACK_HAIRLINE_THETA, backness);
  const theta = lerp(-Math.PI / 2, hairlineTheta, v);
  const projected = projectStructure(
    Math.cos(theta) * skull.rx * sidePosition,
    skull.cy + Math.sin(theta) * skull.ry,
    SCALP_Z * depthPosition
  );

  return {
    x: projected.x,
    y: projected.y,
    depthPosition
  };
}

function makeV2Lock(index, scalp, partU, partHalf, midpoint, params, color) {
  const u = lerp(-U_RANGE, U_RANGE, seededRandom(index, 1));
  const v = clamp(lerp(0, 1, seededRandom(index, 2)), 0, 1);
  const base = scalp(u, v);

  // Screen-space direction of increasing u, via finite difference of the surface.
  const uStep = scalp(u + 0.02, v);
  const uTangent = normalizePoint({ x: uStep.x - base.x, y: uStep.y - base.y });
  const perpSign = Math.sign(u - partU) || 1;
  const perpDir = scalePoint(uTangent, perpSign);

  // Radial direction: away from the part midpoint.
  const radialDir = normalizePoint({ x: base.x - midpoint.x, y: base.y - midpoint.y });

  // Crossfade perpendicular (near/along the part) into radial (far from midpoint).
  // A long part keeps most locks perpendicular; a short part makes them radiate.
  const axialFactor = Math.abs(v - PART_MID_V) / partHalf;
  const perpWeight = params.hairV2PerpBias * (1 - smoothstep(0.8, 1.7, axialFactor));
  const radialWeight = params.hairV2RadialBias * smoothstep(0.15, 1.1, axialFactor);

  let direction = { x: 0, y: 0 };
  direction = addPoints(direction, scalePoint(perpDir, perpWeight));
  direction = addPoints(direction, scalePoint(radialDir, radialWeight));
  direction = addPoints(direction, { x: 0, y: params.hairV2Gravity });

  if (Math.hypot(direction.x, direction.y) < 0.001) {
    direction = { x: 0, y: 1 };
  }

  direction = normalizePoint(direction);

  const width = params.hairV2LockWidth * lerp(0.85, 1.15, seededRandom(index, 3));
  const length = params.hairV2LockLength * lerp(0.85, 1.15, seededRandom(index, 4));
  const curve = length * 0.12 * (seededRandom(index, 5) < 0.5 ? -1 : 1);

  return buildLockGeometry(base, direction, width, length, curve, color, base.depthPosition);
}

function buildLockGeometry(base, direction, width, length, curve, color, depthPosition) {
  const tangent = { x: -direction.y, y: direction.x };
  const rootLeft = offsetPoint(base, tangent, -width / 2);
  const rootRight = offsetPoint(base, tangent, width / 2);
  const tip = offsetPoint(base, direction, length);
  const curveControls = makeHairCurveControls({
    rootLeft,
    rootRight,
    tip,
    direction,
    tangent,
    normal: tangent,
    curve,
    length,
    width,
    curveType: "c",
    rhythm: 0.5,
    tension: 0.5,
    asymmetry: 0
  });

  return {
    rootLeft,
    rootRight,
    tip,
    notch: null,
    ...curveControls,
    detailLines: [],
    layer: depthPosition < 0 ? "back" : "front",
    fill: color.fill,
    stroke: color.stroke,
    opacity: 0.95
  };
}

function makePartGuide(scalp, partU, partHalf) {
  const vLo = clamp(PART_MID_V - partHalf, 0, 1);
  const vHi = clamp(PART_MID_V + partHalf, 0, 1);
  const segments = 8;
  const points = [];

  for (let i = 0; i <= segments; i += 1) {
    const v = lerp(vLo, vHi, i / segments);
    points.push(scalp(partU, v));
  }

  points.frontFacing = scalp(partU, PART_MID_V).depthPosition > 0;

  return points;
}

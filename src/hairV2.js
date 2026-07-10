import { clamp, lerp, smoothstep } from "./geometry.js";
import {
  addPoints,
  createStructureProjector,
  makeHairCurveControls,
  normalizePoint,
  offsetPoint,
  resolveHairColor,
  resolveHairShineColor,
  rotatePoint,
  scalePoint,
  seededRandom,
  subtractPoints
} from "./rig.js";

// Latitude (theta) where the scalp ends, head-fixed. Crown is at -PI/2. The
// hairline sits higher in front and lower toward the back, giving a bowl that
// covers the forehead down to roughly the nape.
const FRONT_HAIRLINE_THETA = -0.10 * Math.PI;
const BACK_HAIRLINE_THETA = 0.16 * Math.PI;
// Longitude half-range in units of (PI/2): 2 == full 180deg to the back.
const U_RANGE = 2;
// Lowest latitude a lock root sits at. Kept just off the crown (v=0), where all
// meridians collapse to a single point, so the top row still has horizontal spread.
const V_MIN = 0.05;
// Latitude the part line is centered on.
const PART_MID_V = 0.45;
// z depth magnitude for the scalp surface (matches the v1 guide depth).
const SCALP_Z = 72;
// Locks within this many degrees past the true 90deg front/back boundary still
// render as front, so hair doesn't pop to fully hidden right at the profile
// edge. depthPosition = cos(guideAngle), so this converts to a slightly
// negative threshold instead of exactly 0.
const FRONT_BACK_MARGIN_DEGREES = 10;
const FRONT_BACK_DEPTH_THRESHOLD = Math.cos((90 + FRONT_BACK_MARGIN_DEGREES) * Math.PI / 180);
// v-units of smoothstep margin the headband's pull fades in/out over, on each
// side of [vLow, vHigh], so the edge isn't a hard direction snap.
const HEADBAND_EDGE_SOFTNESS = 0.06;
// Number of thin belts the scalp base cap is stacked from between the crown
// and its coverage radius, so its side edges hug the scalp curve instead of
// one long chord from the crown straight to the rim.
const SCALP_BASE_RING_COUNT = 6;
// Fraction of a ring's own v-span it's extended past its outer edge, into
// the next ring's territory, so consecutive rings overlap enough for the
// shared-outline fill pass to cover the seam between them.
const SCALP_BASE_RING_OVERLAP = 0.35;
// Half-width, in segments, of the smoothstep ramp curl eases in over once
// hairV2CurlDelay's onset point is reached, so it's a gentle ease rather
// than a visible kink where curling switches on.
const CURL_DELAY_RAMP_SEGMENTS = 1;
// Opacity of shine highlight shapes - translucent so it reads as a glossy
// highlight rather than a flat opaque streak painted over the lock.
const HAIR_SHINE_OPACITY = 1;
// Floor illumination never drops below on the shadow side of hairV2LightX -
// a true 0 would make shadow-side shines vanish entirely, which reads as a
// bug rather than lighting; every other intensity param in this file blends
// rather than fully replaces.
const HAIR_SHINE_SHADOW_FLOOR = 0.35;
// Multiplier turning a -1..1 light-alignment dot product into a left/right
// width bias, clamped downstream so it can't fully collapse either edge.
const HAIR_SHINE_ASYMMETRY_STRENGTH = 1.5;
// Upper bound on the bias itself, independent of width, so a strong
// asymmetryStrength can't fully collapse either edge.
const HAIR_SHINE_ASYMMETRY_MAX_BIAS = 0.9;
// A biased shine edge never sits past this fraction of the parent lock's own
// edge at the same point - a little short of 1 so the shine visibly stays
// inside the lock instead of just touching its boundary.
const HAIR_SHINE_MAX_WIDTH_FRACTION = 0.92;

export function solveHairV2(params, pose, structure) {
  const projectStructure = createStructureProjector(params);
  const { skull } = structure;
  const scalp = (u, v) => scalpPoint(u, v, projectStructure, skull, pose);

  const partU = params.hairV2PartOffset * 0.9;
  const partHalf = lerp(0.03, 0.55, params.hairV2PartLength);
  const midpoint = scalp(partU, PART_MID_V);

  const headbandHalf = params.hairV2HeadbandWidth / 2;
  let headbandVLow = params.hairV2HeadbandPosition - headbandHalf;
  let headbandVHigh = params.hairV2HeadbandPosition + headbandHalf;

  // Only guard the crown side: sliding the band up if it would dip below
  // v=0 preserves its width instead of collapsing it (independently
  // clamping each edge would do that). The hairline side (v=1) is
  // intentionally left uncapped -- the band can be pushed past the
  // hairline, onto the forehead, even though that's past what this scalp
  // model otherwise represents; visual collision with face features there
  // is expected and fine for now.
  if (headbandVLow < 0) {
    const shift = -headbandVLow;
    headbandVLow += shift;
    headbandVHigh += shift;
  }
  headbandVLow = Math.max(headbandVLow, 0);

  const headbandActive = Boolean(params.showHairV2Headband) && headbandVHigh > headbandVLow;
  const headband = headbandActive ? { active: true, vLow: headbandVLow, vHigh: headbandVHigh } : null;

  const count = Math.round(params.hairV2LockCount);
  const color = resolveHairColor(params, "hairV2Color");
  const shineColor = resolveHairShineColor(params, "hairV2Color");
  const locks = [];
  const shines = [];
  const mirror = Boolean(params.hairV2Mirror);
  const sourceCount = count;

  // Stratified placement: cover the (u, v) map with a jittered grid so locks are
  // spread evenly instead of clumping and leaving bald spots. u is the wide axis
  // (around the head), so use more columns than rows.
  const rows = Math.max(2, Math.round(Math.sqrt(sourceCount / 3)));
  const cols = Math.max(1, Math.ceil(sourceCount / rows));

  for (let i = 0; i < sourceCount; i += 1) {
    const { u, v } = stratifiedUV(i, cols, rows, mirror);
    const result = makeV2Lock(i, u, v, scalp, partU, partHalf, midpoint, params, color, shineColor, 1, headband);

    locks.push(result.lock);
    if (result.shine) {
      shines.push(result.shine);
    }

    if (mirror) {
      const mirroredResult = makeV2Lock(i, -u, v, scalp, partU, partHalf, midpoint, params, color, shineColor, -1, headband);

      locks.push(mirroredResult.lock);
      if (mirroredResult.shine) {
        shines.push(mirroredResult.shine);
      }
    }
  }

  const headbandColor = resolveHairColor(params, "hairV2HeadbandColor");
  const headbandBelt = headbandActive
    ? makeHeadbandBelt(scalp, headbandVLow, headbandVHigh, headbandColor)
    : null;

  // Solid coverage from the crown out to hairV2ScalpBaseCoverage, same color
  // as the locks, sitting underneath them - fills the gaps a jittered lock
  // grid otherwise leaves near the crown instead of showing bald scalp.
  // Stacked as several thin rings (each its own makeHeadbandBelt call)
  // rather than one big belt from v=0: a single belt's "low" row collapses
  // to the crown point, so its one straight edge jumps directly from the
  // crown to the far side of the visible boundary, cutting across the dome
  // instead of following it. Thin rings keep each jump short enough that
  // the stack reads as a curve hugging the actual scalp surface.
  // Each ring's outer edge is pushed slightly past its "clean" boundary
  // into the next ring's territory (except the last, which stays at the
  // true coverage edge), so consecutive rings overlap instead of just
  // touching - with the shared-outline render mode, that overlap is what
  // lets one ring's fill cover its neighbor's stroke and hide the seam
  // between them, the same way overlapping locks already hide theirs.
  const scalpBase = Boolean(params.showHairV2ScalpBase)
    ? Array.from({ length: SCALP_BASE_RING_COUNT }, (_, ring) => {
        const vLow = lerp(0, params.hairV2ScalpBaseCoverage, ring / SCALP_BASE_RING_COUNT);
        const vHighEdge = lerp(0, params.hairV2ScalpBaseCoverage, (ring + 1) / SCALP_BASE_RING_COUNT);
        const ringSpan = vHighEdge - vLow;
        const vHigh = Math.min(
          params.hairV2ScalpBaseCoverage,
          vHighEdge + ringSpan * SCALP_BASE_RING_OVERLAP
        );

        return makeHeadbandBelt(scalp, vLow, vHigh, color);
      }).flat()
    : [];

  return {
    locks,
    shines,
    partGuide: makePartGuide(scalp, partU, partHalf),
    showPartGuide: Boolean(params.showHairV2PartGuide),
    headbandBelt,
    scalpBase,
    sharedOutline: Boolean(params.hairV2SharedOutline)
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
    depthPosition,
    sidePosition
  };
}

// 0 outside [vLow, vHigh], approaching 1 well inside, fading over
// HEADBAND_EDGE_SOFTNESS on each edge. Two independent smoothsteps multiplied
// together — degrades gracefully for narrow bands (product peaks below 1
// instead of forming a clean plateau) rather than needing special-casing.
function headbandMembership(v, vLow, vHigh) {
  const enter = smoothstep(vLow - HEADBAND_EDGE_SOFTNESS, vLow + HEADBAND_EDGE_SOFTNESS, v);
  const exit = 1 - smoothstep(vHigh - HEADBAND_EDGE_SOFTNESS, vHigh + HEADBAND_EDGE_SOFTNESS, v);
  return clamp(enter * exit, 0, 1);
}

// One jittered cell of a cols x rows grid over the (u, v) scalp map.
function stratifiedUV(index, cols, rows, mirror = false) {
  const cellU = index % cols;
  const cellV = Math.floor(index / cols) % rows;
  const u = mirror
    ? lerp(0, U_RANGE, (cellU + seededRandom(index, 11)) / cols)
    : lerp(-U_RANGE, U_RANGE, (cellU + seededRandom(index, 11)) / cols);
  const v = clamp(lerp(V_MIN, 1, (cellV + seededRandom(index, 12)) / rows), 0, 1);

  return { u, v };
}

function makeV2Lock(index, u, v, scalp, partU, partHalf, midpoint, params, color, shineColor, curveMirror = 1, headband = null) {
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

  if (headband?.active) {
    const bandWeight = headbandMembership(v, headband.vLow, headband.vHigh) * params.hairV2HeadbandStrength;

    if (bandWeight > 0) {
      const vStep = scalp(u, Math.max(0, v - 0.02));
      const crownDir = normalizePoint(subtractPoints(vStep, base));
      direction = addPoints(scalePoint(direction, 1 - bandWeight), scalePoint(crownDir, bandWeight));
    }
  }

  if (Math.hypot(direction.x, direction.y) < 0.001) {
    direction = { x: 0, y: 1 };
  }

  direction = normalizePoint(direction);

  const width = params.hairV2LockWidth * lerp(0.85, 1.15, seededRandom(index, 3));
  const length = params.hairV2LockLength * lerp(0.85, 1.15, seededRandom(index, 4));
  const curve = length * 0.12 * (seededRandom(index, 5) < 0.5 ? -1 : 1) * curveMirror;
  const curlAngle = params.hairV2CurlAngle * Math.PI / 180 * curveMirror;

  // Illumination: how lit this lock's side of the head is, given where the
  // light sits (hairV2LightX) and this lock's own yaw-aware left/right
  // position (sidePosition). Provably 1 (no-op) whenever hairV2LightX is 0,
  // since alignment is then 0 regardless of sidePosition.
  const alignment = base.sidePosition * params.hairV2LightX;
  const shadowTarget = alignment >= 0 ? 1 : HAIR_SHINE_SHADOW_FLOOR;
  const illumination = lerp(1, shadowTarget, Math.abs(alignment));

  const shine = params.showHairV2Shine
    ? {
        // Capped short of the full lock width so the shine reads as an
        // inset highlight even before any light-driven bias is applied -
        // otherwise a symmetric, unbiased shine could already sit flush
        // with the lock's own edge at hairV2ShineWidth's top of range.
        width: Math.min(params.hairV2ShineWidth * illumination, HAIR_SHINE_MAX_WIDTH_FRACTION),
        length: params.hairV2ShineLength * illumination,
        color: shineColor,
        lightX: params.hairV2LightX
      }
    : null;

  return buildLockGeometry(
    base,
    direction,
    width,
    length,
    curve,
    color,
    base.depthPosition,
    params.hairV2LockRootRound,
    params.hairV2CurlInterval,
    curlAngle,
    params.hairV2CurlPeriod,
    params.hairV2CurlDelay,
    index,
    shine
  );
}

// Caps how far a shine's width bias can push toward one edge, so a wide
// and/or strongly-biased shine can't cross the parent lock's own edge on
// that side. The taper factor cancels out of the crossing condition (both
// the shine and the lock taper by the same (1 - k/last) at any given point),
// so the safe bound is just a fraction of the lock's width regardless of
// position along the lock: shineWidthFraction * (1 + bias) <=
// HAIR_SHINE_MAX_WIDTH_FRACTION. Falls back to the strength-based cap alone
// when the shine has no width yet.
function maxShineBias(shineWidthFraction) {
  if (shineWidthFraction <= 0) return HAIR_SHINE_ASYMMETRY_MAX_BIAS;
  return Math.max(0, Math.min(HAIR_SHINE_ASYMMETRY_MAX_BIAS, HAIR_SHINE_MAX_WIDTH_FRACTION / shineWidthFraction - 1));
}

function buildLockGeometry(base, direction, width, length, curve, color, depthPosition, rootRound, interval, curlAngle, curlPeriod, curlDelay, index, shine) {
  const segmentCount = Math.max(1, Math.round(length / interval));
  const tangent = { x: -direction.y, y: direction.x };

  let geometry;
  let shineGeometry = null;

  if (segmentCount <= 1) {
    geometry = buildStraightLockGeometry(base, direction, tangent, width, length, curve);

    if (shine) {
      // perp . lightDir simplifies to tangent.x * lightX since light is
      // purely horizontal (y=0) - same alignment formula the ribbon path
      // uses, just evaluated once instead of per-segment (a straight lock
      // only has the one segment to bias).
      const maxBias = maxShineBias(shine.width);
      const bias = clamp(tangent.x * shine.lightX * HAIR_SHINE_ASYMMETRY_STRENGTH, -maxBias, maxBias);

      shineGeometry = buildStraightLockGeometry(
        base,
        direction,
        tangent,
        width * shine.width,
        length * shine.length,
        curve * shine.length,
        bias
      );
    }
  } else {
    const spineInterval = length / segmentCount;
    const { points, headings } = buildSpine(base, direction, spineInterval, curlAngle, curlPeriod, curlDelay, segmentCount, index);

    geometry = buildRibbonLockGeometry(points, headings, width);

    if (shine) {
      // Reuse a literal prefix of the same spine the main lock already
      // walked, instead of re-deriving a fresh segment count/spacing from a
      // shorter length - that independent rounding is what let the shine
      // drift off the lock's actual curl path at length fractions < 1.
      const shineSegmentCount = Math.max(1, Math.round(segmentCount * shine.length));
      const shinePoints = points.slice(0, shineSegmentCount + 1);
      const shineHeadings = headings.slice(0, shineSegmentCount);

      const maxBias = maxShineBias(shine.width);
      shineGeometry = buildRibbonLockGeometry(
        shinePoints,
        shineHeadings,
        width * shine.width,
        (pts, heads, w) => buildAsymmetricRibbonEdges(pts, heads, w, shine.lightX, HAIR_SHINE_ASYMMETRY_STRENGTH, maxBias)
      );
    }
  }

  const lock = finishLockGeometry(geometry, base, direction, width, rootRound, depthPosition, color.fill, color.stroke, 1);
  const shineResult = shineGeometry
    ? finishLockGeometry(shineGeometry, base, direction, width * shine.width, rootRound, depthPosition, shine.color, "none", HAIR_SHINE_OPACITY)
    : null;

  return { lock, shine: shineResult };
}

// Bulge the back edge (root) outward, away from the tip, instead of closing
// it with a flat line. That flat closing line is what makes the base read
// as a triangle; a curve here rounds it into a soft "shield" shape.
function finishLockGeometry(geometry, base, direction, width, rootRound, depthPosition, fill, stroke, opacity) {
  const rootBulge = width * 0.35 * rootRound;
  const rootControl = rootBulge > 0.01
    ? offsetPoint(base, direction, -rootBulge)
    : null;

  return {
    ...geometry,
    rootControl,
    notch: null,
    detailLines: [],
    layer: depthPosition < FRONT_BACK_DEPTH_THRESHOLD ? "back" : "front",
    fill,
    stroke,
    opacity
  };
}

// The original single-bend lock: root -> tip in one bezier per side. bias
// (-1..1, default 0/symmetric) redistributes the width split between the two
// sides without changing the total, for the shine's light-facing-edge bias.
function buildStraightLockGeometry(base, direction, tangent, width, length, curve, bias = 0) {
  const rootLeft = offsetPoint(base, tangent, -(width / 2) * (1 - bias));
  const rootRight = offsetPoint(base, tangent, (width / 2) * (1 + bias));
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

  return { rootLeft, rootRight, tip, ...curveControls };
}

// Given an already-walked spine (points/headings), offsets a width ribbon
// perpendicular to it, tapered to a point at the tip, and smooths both edges
// into bezier chains. Takes the spine as input rather than walking it itself
// so the shine can reuse a literal prefix of the same spine the main lock
// already walked (see buildLockGeometry) instead of re-deriving its own from
// a shorter length, which is what let it drift off the lock's actual curl
// path at length fractions < 1.
function buildRibbonLockGeometry(points, headings, width, edgeBuilder = buildRibbonEdges) {
  const { leftEdge, rightEdge } = edgeBuilder(points, headings, width);
  const leftSegments = buildSmoothPath(leftEdge);
  const rightSegments = buildSmoothPath([...rightEdge].reverse());

  return {
    rootLeft: leftEdge[0],
    rootRight: rightEdge[0],
    tip: points[points.length - 1],
    spineLeft: leftSegments,
    spineRight: rightSegments
  };
}

function buildSpine(base, direction, interval, curlAngle, curlPeriod, curlDelay, segmentCount, index) {
  const points = [base];
  const headings = [];
  let heading = direction;
  let cursor = base;
  const curlStartSeg = curlDelay * segmentCount;

  for (let seg = 0; seg < segmentCount; seg += 1) {
    const segInterval = interval * lerp(0.85, 1.15, seededRandom(index, 20 + seg * 2));
    cursor = offsetPoint(cursor, heading, segInterval);
    points.push(cursor);
    headings.push(heading);

    // activeSeg counts segments since curling actually starts, so the flip
    // period and ramp are both phased relative to the onset rather than the
    // root - the first curling segment always behaves the same regardless
    // of where the delay boundary happens to land. At curlDelay=0 this
    // bypasses to the exact original formula (activeSeg===seg, ramp===1).
    const activeSeg = curlDelay > 0 ? seg - curlStartSeg : seg;
    const ramp = curlDelay > 0
      ? smoothstep(-CURL_DELAY_RAMP_SEGMENTS, CURL_DELAY_RAMP_SEGMENTS, activeSeg)
      : 1;
    const flip = curlPeriod > 0 && Math.floor((Math.max(activeSeg, 0) + 1) / curlPeriod) % 2 === 1;
    const signedAngle = (flip ? -1 : 1) * curlAngle * ramp;
    const jitteredAngle = signedAngle * lerp(0.85, 1.15, seededRandom(index, 20 + seg * 2 + 1));
    heading = normalizePoint(rotatePoint(heading, jitteredAngle));
  }

  return { points, headings };
}

function buildRibbonEdges(points, headings, width) {
  const last = points.length - 1;
  const leftEdge = [];
  const rightEdge = [];

  for (let k = 0; k <= last; k += 1) {
    const tangent = k === 0
      ? headings[0]
      : k === last
        ? headings[last - 1]
        : normalizePoint(addPoints(headings[k - 1], headings[k]));
    const perp = { x: -tangent.y, y: tangent.x };
    const halfWidth = (width / 2) * (1 - k / last);

    leftEdge.push(offsetPoint(points[k], perp, -halfWidth));
    rightEdge.push(offsetPoint(points[k], perp, halfWidth));
  }

  return { leftEdge, rightEdge };
}

// Same as buildRibbonEdges, but biases each segment's width split toward
// whichever edge faces a purely-horizontal light (lightX, -1..1) instead of
// splitting evenly. Computed per-segment (not once per lock) so the "lit"
// edge correctly tracks around a tightly curled/spiraled lock as its local
// tangent rotates, rather than staying fixed to whichever edge was lit at
// the root. Total width is preserved and only redistributed between edges,
// so this stays orthogonal to the separate illumination/width scaling.
function buildAsymmetricRibbonEdges(points, headings, width, lightX, asymmetryStrength, maxBias) {
  const last = points.length - 1;
  const leftEdge = [];
  const rightEdge = [];

  for (let k = 0; k <= last; k += 1) {
    const tangent = k === 0
      ? headings[0]
      : k === last
        ? headings[last - 1]
        : normalizePoint(addPoints(headings[k - 1], headings[k]));
    const perp = { x: -tangent.y, y: tangent.x };
    const baseHalfWidth = (width / 2) * (1 - k / last);
    // perp . lightDir simplifies to perp.x * lightX since the light is
    // purely horizontal (lightDir = {x: lightX, y: 0}).
    const bias = clamp(perp.x * lightX * asymmetryStrength, -maxBias, maxBias);

    leftEdge.push(offsetPoint(points[k], perp, -baseHalfWidth * (1 - bias)));
    rightEdge.push(offsetPoint(points[k], perp, baseHalfWidth * (1 + bias)));
  }

  return { leftEdge, rightEdge };
}

// Catmull-Rom to cubic bezier, so a chain of spine points reads as a smooth
// curl instead of a faceted polyline.
function buildSmoothPath(pointList, tensionFactor = 0.35) {
  const segments = [];

  for (let k = 0; k < pointList.length - 1; k += 1) {
    const p0 = pointList[k - 1] ?? pointList[k];
    const p1 = pointList[k];
    const p2 = pointList[k + 1];
    const p3 = pointList[k + 2] ?? p2;
    const c1 = addPoints(p1, scalePoint(subtractPoints(p2, p0), tensionFactor / 3));
    const c2 = addPoints(p2, scalePoint(subtractPoints(p1, p3), tensionFactor / 3));

    segments.push({ c1, c2, to: p2 });
  }

  return segments;
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

// Filled belt between two latitudes, sampled across the full longitude range
// and split into contiguous front/back runs using the same depth threshold
// locks already use. A yawed head crosses the threshold at most twice across
// a full sweep, so this is at most one front run + one back run.
function makeHeadbandBelt(scalp, vLow, vHigh, color) {
  const segments = 48;
  const lowPoints = [];
  const highPoints = [];

  for (let i = 0; i <= segments; i += 1) {
    const u = lerp(-U_RANGE, U_RANGE, i / segments);
    lowPoints.push(scalp(u, vLow));
    highPoints.push(scalp(u, vHigh));
  }

  return splitBeltRuns(lowPoints, highPoints).map(run => ({
    points: [...run.low, ...[...run.high].reverse()],
    layer: run.layer,
    fill: color.fill,
    stroke: color.stroke
  }));
}

function splitBeltRuns(lowPoints, highPoints) {
  const runs = [];
  let currentLow = [];
  let currentHigh = [];
  let currentLayer = null;

  for (let i = 0; i < lowPoints.length; i += 1) {
    const layer = lowPoints[i].depthPosition < FRONT_BACK_DEPTH_THRESHOLD ? "back" : "front";

    if (currentLayer !== null && layer !== currentLayer) {
      runs.push({ low: currentLow, high: currentHigh, layer: currentLayer });
      currentLow = [];
      currentHigh = [];
    }

    currentLayer = layer;
    currentLow.push(lowPoints[i]);
    currentHigh.push(highPoints[i]);
  }

  if (currentLow.length) {
    runs.push({ low: currentLow, high: currentHigh, layer: currentLayer });
  }

  // u sweeps a full circle (-U_RANGE wraps to +U_RANGE at the same physical
  // point), so the first and last run are often the same contiguous piece
  // split only by where the linear sweep happens to start/end. Merge them
  // back into one run when they share a layer.
  if (runs.length > 1 && runs[0].layer === runs[runs.length - 1].layer) {
    const first = runs.shift();
    const last = runs.pop();

    runs.push({
      low: [...last.low, ...first.low],
      high: [...last.high, ...first.high],
      layer: last.layer
    });
  }

  return runs;
}

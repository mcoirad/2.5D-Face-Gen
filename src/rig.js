import {
  clamp,
  isPointInPolygon,
  lerp,
  poseSign,
  smoothstep
} from "./geometry.js";
import { makeHairV2Lock, solveHairV2, solveHeadband } from "./hairV2.js";
import { solveDoublePonytail } from "./doublePonytail.js";
import { solveFerronniere } from "./ferronniere.js";
import { solvePonytail } from "./ponytail.js";
import { solveSideTiedLocks } from "./sideTiedLocks.js";

const FACE_CENTER_Y = 10;
const EYE_SHADING_SCALE = 1.4;
const EYE_SHADING_DARKEN_FACTOR = 0.8;
const EYE_SHADING_MIN_RISE = 10;
const EYE_BAG_INNER_SAMPLE = 0.12;
const EYE_BAG_OUTER_DOWN = 0.235;
const EYE_BAG_OUTER_PAIR_INWARD = 0.13;
const EYE_BAG_OUTER_PAIR_DOWN = 0.188;
const EYE_BAG_OUTER_PAIR_SCALE = 1.1;
const EYE_BAG_FIRST_CONTROL_OUT = 0.157;
const EYE_BAG_FIRST_CONTROL_DOWN = 0.286;
const EYE_BAG_SECOND_CONTROL_OUT = 0.482;
const EYE_BAG_SECOND_CONTROL_DOWN = 0.406;
const DEFAULT_SKIN_COLOR = "#f6f1e8";
const DEFAULTS = {
  lowerFaceWidth: 145,
  lowerFaceHeight: 126,
  lowerFaceY: 105,
  lowerFaceSideShift: 38,
  eyeY: -35,
  eyeSpacing: 46,
  eyeSize: 18,
  eyeUpperOpen: 1,
  eyeLowerOpen: 1,
  noseLength: 48,
  mouthWidth: 70
};
export const defaultFeatureLandmarks = {
  front: {
    lowerFace: { cx: 0.0269, cy: 0.8788, rx: 0.8411, ry: 0.555 },
    eyes: [
      { cx: -0.5407, cy: 0.5635, rx: 0.1845, ry: 0.1822 },
      { cx: 0.5945, cy: 0.5525, rx: 0.1845, ry: 0.1822 }
    ],
    nose: {
      bridge: [-0.000, 0.83],
      tip: [-0.0008, 1.0551],
      base: [0.1063, 1.0239]
    },
    mouth: {
      left: [-0.1679, 1.1889],
      mid: [-0.0197, 1.2605],
      right: [0.1505, 1.1889]
    },
    moustache: {
      left: [-0.0737, 1.19],
      right: [0.1063, 1.19]
    },
    soulPatch: {
      root: [0.0183, 1.62]
    },
    // pecs are torso-anchored (fraction of orbitRadius / torsoLength, see
    // solveBody), not skull-anchored like the rest of this table - only the
    // front/threeQuarter/side blend machinery is being reused here.
    pecs: {
      left: [-0.55, 0.12],
      right: [0.55, 0.12]
    }
  },
  threeQuarter: {
    lowerFace: { cx: -0.0605, cy: 0.8245, rx: 0.8411, ry: 0.555 },
    eyes: [
      { cx: -0.6516, cy: 0.5423, rx: 0.1247, ry: 0.1866 },
      { cx: 0.324, cy: 0.5333, rx: 0.1845, ry: 0.1822 }
    ],
    nose: {
      bridge: [-0.4644, 0.7855],
      tip: [-0.5254, 0.9462],
      base: [-0.4136, 1.0265]
    },
    mouth: {
      left: [-0.3924, 1.1501],
      mid: [-0.2596, 1.2279],
      right: [-0.1241, 1.1625]
    },
    moustache: {
      left: [-0.58, 1.17],
      right: [-0.32, 1.17]
    },
    soulPatch: {
      root: [-0.25, 1.59]
    },
    pecs: {
      left: [-0.75, 0.1],
      right: [0.15, 0.1]
    }
  },
  side: {
    lowerFace: { cx: -0.4523, cy: 0.976, rx: 0.6469, ry: 0.5582 },
    eyes: [
      { cx: -0.5053, cy: 0.5575, rx: 0.1845, ry: 0.1822 },
      { cx: -0.5053, cy: 0.5575, rx: 0.1845, ry: 0.1822 }
    ],
    nose: {
      bridge: [-1.0627+ 0.05, 0.6257 + 0.05],
      tip: [-1.2257 + 0.05, 0.8647+ 0.05],
      base: [-1.1313+ 0.05, 1.04+ 0.05]
    },
    mouth: {
      left: [-1.0353+ 0.05 , 1.1194 - 0.06],
      mid: [-1.0849+ 0.1, 1.275 - 0.06],
      right: [-0.8422+ 0.05, 1.1723 - 0.06]
    },
    moustache: {
      left: [-1.16, 1.2011],
      right: [-1.02, 1.2011]
    },
    soulPatch: {
      root: [-0.84, 1.12]
    },
    ears: {
      topX: 0.3467,
      bottomX: 0.3476
    },
    pecs: {
      left: [-0.45, 0.12],
      right: [-0.25, 0.12]
    }
  }
};

export const defaultOutlineLandmarks = {
  front: {
    startTemple: [-0.95, 0.45],
    endTemple: [0.95, 0.45],
    lower: [
      { angle: -15, offsetX: 0, offsetY: 0 },
      { angle: 45, offsetX: 0, offsetY: 0 },
      { angle: 88, offsetX: 0, offsetY: 0 },
      { angle: 135, offsetX: 0, offsetY: 0 },
      { angle: 195, offsetX: 0, offsetY: 0 }
    ]
  },
  threeQuarter: {
    startTemple: [-0.95, 0.45],
    endTemple: [1.02, 0.45],
    lower: [
      { angle: 15, offsetX: 0, offsetY: 0 },
      { angle: 58, offsetX: 0, offsetY: 0 },
      { angle: 97, offsetX: 0, offsetY: 0 },
      { angle: 152, offsetX: 0, offsetY: 0 },
      { angle: 205, offsetX: 0, offsetY: 0 }
    ]
  },
  side: {
    startTemple: [-1.05, 0.52],
    endTemple: [1.05, 0.52],
    lower: [
      { angle: 15, offsetX: 0, offsetY: -0.06 },
      { angle: 85, offsetX: 0, offsetY: -0.12 },
      { angle: 138, offsetX: 0, offsetY: -0.12 },
      { angle: 180, offsetX: 0, offsetY: -0.12 },
      { angle: 215, offsetX: 0, offsetY: 0 }
    ]
  }
};

// Authored for the screen-right shoulder (shoulders[1] / shoulderTopRight /
// neckBottomRight). The screen-left shoulder mirrors via 180 - angle (and a
// flipped offsetX) about its own circle center - exact for a circle, and
// independent of yaw since each shoulder's circle already carries yaw via
// orbitPoint.
// point2 = inner point (neck side), point3 = outer/lateral point. Both sit
// in the upper hemisphere (negative sin) since pauldrons cap the shoulder
// top. offsetX/offsetY are additive screen-space px nudges applied after the
// angle+radius placement, same convention as pauldronYOffset. Tune by eye.
export const defaultPauldronLandmarks = {
  front: {
    point2: { angle: -220, offsetX: 0, offsetY: 10 },
    point3: { angle: -20, offsetX: 10, offsetY: 0 }
  },
  threeQuarter: {
    point2: { angle: -200, offsetX: 0, offsetY: 0 },
    point3: { angle: -15, offsetX: 0, offsetY: 0 }
  },
  side: {
    point2: { angle: -195, offsetX: -0, offsetY: 0 },
    point3: { angle: -0, offsetX: 30, offsetY: 10 }
  }
};

const HAIR_MIRROR_GUIDES = [4, 3, 2, 1, 0, 7, 6, 5];
const HAIR_MIRROR_SOURCE_GUIDES = [0, 1, 2, 5, 6];
export const OUTLINE_UPPER_ARC_POINT_COUNT = 19;
// Profile outline tuning: when the first protruding feature would pull the
// preceding lower-face point into a strong inward notch, drop that lower point
// and retry. This keeps nose landmarks available while removing bad connectors.
const PROFILE_LOWER_CONCAVITY_LIMIT = 60 * Math.PI / 180;
const PROFILE_EYE_SPACING_SHIFT = 0.24;

export function solveFaceRig(params) {
  const yaw = clamp(params.yaw, -1, 1);
  const pose = {
    yaw,
    amount: Math.abs(yaw),
    sign: poseSign(yaw)
  };
  const turn = smoothstep(0, 1, pose.amount);
  const profile = smoothstep(0.58, 1, pose.amount);

  const head = solveHead(params, pose);
  const features = solveFeatures(params, pose, head.structure);

  head.outline = params.showProfileOutlineExtension
    ? extendOutlineWithProfile(head.outline, features, params.outlineIgnoreMouthProtrusion)
    : head.outline;

  const solvedBody = solveBody(params, pose, head.structure);
  const armor = solveArmor(params, pose, head.structure, solvedBody);
  const { garmentSource: _garmentSource, ...body } = solvedBody;
  const facialHair = solveFacialHair(params, pose, head, features);
  const ponytail = solvePonytail(params, pose, head.structure);
  const doublePonytail = solveDoublePonytail(params, pose, head.structure);
  const sideTiedLocks = solveSideTiedLocks(params, pose, head.structure);
  const attractionTargets = [];
  if (ponytail && params.hairV2PonytailAttractionArea > 0) {
    attractionTargets.push({
      id: "single",
      area: params.hairV2PonytailAttractionArea,
      tiePoint: ponytail.tiePoint,
      tieV: ponytail.tieV
    });
  }
  if (doublePonytail) {
    attractionTargets.push(
      ...doublePonytail.attractionTargets.filter(target => target.area > 0)
    );
  }
  const ponytailAttraction = attractionTargets.length > 0 ? attractionTargets : null;

  return {
    showGuides: params.showGuides,
    removeStrokes: params.removeStrokes,
    showHelmet: params.showHelmet,
    faceRoundness: params.faceRoundness,
    clipMouthToFace: params.clipMouthToFace,
    skinColor: params.skinColor,
    pose: {
      ...pose,
      turn,
      profile
    },
    head,
    hair: solveHair(params, pose, head.structure),
    hairV2: params.showHairV2
      ? solveHairV2(params, pose, head.structure, ponytailAttraction)
      : null,
    ponytail,
    doublePonytail,
    sideTiedLocks,
    facialHair,
    headband: solveHeadband(params, pose, head.structure),
    ferronniere: solveFerronniere(params, pose, head.structure, features),
    body,
    armor,
    ears: params.showEars ? solveEars(params, pose, head.structure, features, head.outline) : null,
    helmet: solveHelmet(params, pose, head.structure, features),
    features,
    visibility: solveVisibility(pose.amount)
  };
}

// Older sessions can predate ear, pec, or facial-hair landmarks. Deep-merge those
// families pose-by-pose so interpolation and the landmark editor can use saved
// faces without requiring them to be re-exported first.
export function withFeatureLandmarkFallbacks(featureLandmarks) {
  if (!featureLandmarks) {
    return defaultFeatureLandmarks;
  }

  return Object.fromEntries(
    ["front", "threeQuarter", "side"].map(poseKey => {
      const defaults = defaultFeatureLandmarks[poseKey];
      const saved = featureLandmarks[poseKey] ?? {};

      return [poseKey, {
        ...defaults,
        ...saved,
        moustache: { ...defaults.moustache, ...saved.moustache },
        soulPatch: { ...defaults.soulPatch, ...saved.soulPatch },
        ...(defaults.ears ? { ears: { ...defaults.ears, ...saved.ears } } : {}),
        pecs: { ...defaults.pecs, ...saved.pecs }
      }];
    })
  );
}

function solveHead(params, pose) {
  const projectStructure = createStructureProjector(params);
  const reference = interpolateReferencePose(withFeatureLandmarkFallbacks(params.featureLandmarks), pose.amount);
  const skull = {
    cx: 0,
    cy: FACE_CENTER_Y,
    rx: params.faceWidth / 2,
    ry: params.faceHeight / 2,
    z: 0
  };
  const lowerFace = {
    cx: pose.sign * reference.lowerFace.cx * skull.rx
      - pose.sign * (params.lowerFaceSideShift - DEFAULTS.lowerFaceSideShift) * pose.amount,
    cy: skull.cy + reference.lowerFace.cy * skull.ry + (params.lowerFaceY - DEFAULTS.lowerFaceY),
    rx: reference.lowerFace.rx * skull.rx * (params.lowerFaceWidth / DEFAULTS.lowerFaceWidth),
    ry: reference.lowerFace.ry * skull.ry * (params.lowerFaceHeight / DEFAULTS.lowerFaceHeight),
    z: 24
  };
  const outlineReference = interpolateOutlineLandmarks(
    transformOutlineGapRatios(params.outlineLandmarks ?? defaultOutlineLandmarks, params),
    pose.amount
  );

  const skullGuide = sampleEllipse(projectStructure, skull, 48);
  const lowerFaceGuide = sampleEllipse(projectStructure, lowerFace, 48);

  const outline = makeLandmarkOutline(projectStructure, skull, lowerFace, pose, params, outlineReference);

  return {
    guides: {
      skull: skullGuide,
      lowerFace: lowerFaceGuide
    },
    outline,
    baseOutline: outline,
    structure: {
      skull,
      lowerFace,
      reference,
      lowerFaceBottomY: lowerFace.cy + lowerFace.ry,
      featureCenterX: lowerFace.cx * 0.32
    }
  };
}

export function createStructureProjector(params) {
  const cp = Math.cos(params.pitch);
  const sp = Math.sin(params.pitch);

  return function projectStructure(x, y, z = 0) {
    const y1 = y * cp - z * sp;
    const z1 = y * sp + z * cp;

    return {
      x: 250 + x,
      y: 250 + y1,
      scale: 1,
      depth: z1
    };
  };
}

function sampleEllipse(project, ellipse, segments, rotation = 0) {
  return sampleEllipseArc(project, ellipse, 0, Math.PI * 2, segments, rotation);
}

function ellipsePointAtAngle(project, ellipse, theta, rotation = 0) {
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const localX = ellipse.rx * Math.cos(theta);
  const localY = ellipse.ry * Math.sin(theta);

  return project(
    ellipse.cx + localX * cosR - localY * sinR,
    ellipse.cy + localX * sinR + localY * cosR,
    ellipse.z
  );
}

function sampleEllipseArc(project, ellipse, startTheta, endTheta, segments, rotation = 0) {
  const points = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const theta = lerp(startTheta, endTheta, t);

    points.push(ellipsePointAtAngle(project, ellipse, theta, rotation));
  }

  return points;
}

function makeLandmarkOutline(project, skull, lowerFace, pose, params, landmarks) {
  const upperArc = sampleSkullArc(project, skull, pose.sign, landmarks.startTemple, landmarks.endTemple, 18);
  const lowerPoints = landmarks.lower.map((point, index) => {
    const adjusted = lowerEllipseLandmark(lowerFace, point, index, pose, params, skull);

    return project(adjusted.x, adjusted.y, 0);
  });

  return [
    ...upperArc,
    ...lowerPoints
  ];
}

function sampleSkullArc(project, skull, poseSignValue, startPoint, endPoint, segments) {
  const startTheta = angleForCirclePoint(startPoint);
  let endTheta = angleForCirclePoint(endPoint);

  if (endTheta <= startTheta) {
    endTheta += Math.PI * 2;
  }

  const points = [];

  for (let i = 0; i <= segments; i += 1) {
    const theta = lerp(startTheta, endTheta, i / segments);

    points.push(projectReferencePoint(
      project,
      skull,
      poseSignValue,
      [Math.cos(theta), Math.sin(theta)],
      0
    ));
  }

  return points;
}

function angleForCirclePoint(point) {
  return Math.atan2(
    clamp(point[1], -0.98, 0.98),
    clamp(point[0], -0.98, 0.98)
  );
}

function lowerEllipseLandmark(lowerFace, landmark, index, pose, params, skull) {
  const mirroredAngle = pose.sign < 0 ? 180 - landmark.angle : landmark.angle;
  const theta = mirroredAngle * Math.PI / 180;

  return {
    x: lowerFace.cx
      + Math.cos(theta) * lowerFace.rx
      + pose.sign * landmark.offsetX * skull.rx,
    y: lowerFace.cy + Math.sin(theta) * lowerFace.ry + landmark.offsetY * skull.ry
  };
}

function pruneConcaveLowerLandmarks(points) {
  let pruned = [...points];
  let changed = true;

  while (changed && pruned.length > 3) {
    changed = false;
    const winding = polygonSignedArea(pruned);

    if (Math.abs(winding) < 0.001) {
      return pruned;
    }

    const windingSign = Math.sign(winding);
    const nextPruned = [];

    for (let index = 0; index < pruned.length; index += 1) {
      const previous = pruned[(index - 1 + pruned.length) % pruned.length];
      const point = pruned[index];
      const next = pruned[(index + 1) % pruned.length];
      const turn = signedTurn(previous, point, next);

      if (turn !== 0 && Math.sign(turn) !== windingSign) {
        changed = true;
        continue;
      }

      nextPruned.push(point);
    }

    pruned = nextPruned;
  }

  return pruned;
}

function signedTurn(previous, point, next) {
  return (point.x - previous.x) * (next.y - point.y)
    - (point.y - previous.y) * (next.x - point.x);
}

function polygonSignedArea(points) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];

    area += point.x * next.y - next.x * point.y;
  }

  return area / 2;
}

// When the head turns toward profile, the nose and mouth can protrude past the
// jaw/cheek outline. This extends the front of the outline to include those
// points whenever they fall outside the base polygon and can be connected
// without crossing the existing outline. The base outline ends with
// lower1..lower5; the front run of the closed loop is lower4 -> lower5 ->
// arcStart. We drop lower5 only when at least one profile point can safely
// replace it.
function extendOutlineWithProfile(outline, features, ignoreMouthProtrusion) {
  const mouth = outlinePoint(features.mouth.mid);
  const mouthProtrudes = !ignoreMouthProtrusion && !isPointInPolygon(mouth, outline);
  const outlineForExtension = outline;
  const candidates = [
    ...(mouthProtrudes ? [mouth] : []),
    outlinePoint(features.nose.leftNostril),
    outlinePoint(features.nose.tip),
    outlinePoint(features.nose.bridge)
  ];
  const protruding = candidates.filter(point => !isPointInPolygon(point, outlineForExtension));

  if (!protruding.length) {
    return outline;
  }

  const baseOutline = outlineForExtension.slice(0, -1);
  let extendedOutline = baseOutline;
  let addedProfilePoint = false;

  for (const point of protruding) {
    const repairedPoints = dropStrongProfileConnectorConcavity(extendedOutline, point);
    const nextPoints = [...repairedPoints, point];

    if (!polygonSelfIntersects(nextPoints)) {
      extendedOutline = nextPoints;
      addedProfilePoint = true;
    }
  }

  return addedProfilePoint ? extendedOutline : outline;
}

function outlinePoint(point) {
  return { x: point.x, y: point.y, scale: 1, depth: 0 };
}

function dropStrongProfileConnectorConcavity(points, candidate) {
  let repaired = points;

  while (
    repaired.length > OUTLINE_UPPER_ARC_POINT_COUNT + 3
    && createsStrongProfileConnectorConcavity(repaired, candidate)
  ) {
    repaired = repaired.slice(0, -1);
  }

  return repaired;
}

function createsStrongProfileConnectorConcavity(points, candidate) {
  const previous = points[points.length - 2];
  const lowerPoint = points[points.length - 1];
  const turn = signedTurnAngle(previous, lowerPoint, candidate);
  const winding = Math.sign(polygonSignedArea([...points, candidate]));

  return winding !== 0
    && Math.sign(turn) !== 0
    && Math.sign(turn) !== winding
    && Math.abs(turn) > PROFILE_LOWER_CONCAVITY_LIMIT;
}

function signedTurnAngle(previous, point, next) {
  const incoming = {
    x: point.x - previous.x,
    y: point.y - previous.y
  };
  const outgoing = {
    x: next.x - point.x,
    y: next.y - point.y
  };

  return Math.atan2(
    incoming.x * outgoing.y - incoming.y * outgoing.x,
    incoming.x * outgoing.x + incoming.y * outgoing.y
  );
}

function polygonSelfIntersects(points) {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstStart = points[firstIndex];
    const firstEnd = points[(firstIndex + 1) % points.length];

    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      if (segmentsAreAdjacent(firstIndex, secondIndex, points.length)) {
        continue;
      }

      const secondStart = points[secondIndex];
      const secondEnd = points[(secondIndex + 1) % points.length];

      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
        return true;
      }
    }
  }

  return false;
}

function segmentsAreAdjacent(firstIndex, secondIndex, pointCount) {
  return firstIndex === secondIndex
    || (firstIndex + 1) % pointCount === secondIndex
    || (secondIndex + 1) % pointCount === firstIndex;
}

function segmentsIntersect(a, b, c, d) {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);

  return first * second < 0 && third * fourth < 0;
}

function orientation(a, b, c) {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

const POLYGON_UNION_EPSILON = 1e-6;

function pointsNearlyEqual(a, b, epsilon = POLYGON_UNION_EPSILON) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function pointOnSegment(point, a, b, epsilon = POLYGON_UNION_EPSILON) {
  const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);

  if (Math.abs(cross) > epsilon) {
    return false;
  }

  const dot = (point.x - a.x) * (point.x - b.x) + (point.y - a.y) * (point.y - b.y);

  return dot <= epsilon;
}

function pointOnPolygonBoundary(point, polygon) {
  return polygon.some((start, index) => pointOnSegment(
    point,
    start,
    polygon[(index + 1) % polygon.length]
  ));
}

function pointStrictlyInsidePolygon(point, polygon) {
  return !pointOnPolygonBoundary(point, polygon) && isPointInPolygon(point, polygon);
}

function segmentIntersectionParameters(a, b, c, d) {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const cdX = d.x - c.x;
  const cdY = d.y - c.y;
  const denominator = abX * cdY - abY * cdX;

  if (Math.abs(denominator) <= POLYGON_UNION_EPSILON) {
    return null;
  }

  const acX = c.x - a.x;
  const acY = c.y - a.y;
  const t = (acX * cdY - acY * cdX) / denominator;
  const u = (acX * abY - acY * abX) / denominator;

  if (
    t < -POLYGON_UNION_EPSILON
    || t > 1 + POLYGON_UNION_EPSILON
    || u < -POLYGON_UNION_EPSILON
    || u > 1 + POLYGON_UNION_EPSILON
  ) {
    return null;
  }

  return {
    t: clamp(t, 0, 1),
    u: clamp(u, 0, 1)
  };
}

function pointAlongSegment(a, b, t) {
  if (t <= POLYGON_UNION_EPSILON) {
    return a;
  }

  if (t >= 1 - POLYGON_UNION_EPSILON) {
    return b;
  }

  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t)
  };
}

function normalizeUnionPolygon(points) {
  const normalized = [];

  for (const point of points) {
    if (!normalized.length || !pointsNearlyEqual(point, normalized[normalized.length - 1])) {
      normalized.push(point);
    }
  }

  if (normalized.length > 1 && pointsNearlyEqual(normalized[0], normalized[normalized.length - 1])) {
    normalized.pop();
  }

  return polygonSignedArea(normalized) < 0 ? normalized.reverse() : normalized;
}

function convexHull(points) {
  const sorted = [...points]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((point, index, entries) => index === 0 || !pointsNearlyEqual(point, entries[index - 1]));

  if (sorted.length <= 2) {
    return sorted;
  }

  const hullTurn = (a, b, c) => (
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  );
  const halfHull = entries => {
    const half = [];

    for (const point of entries) {
      while (
        half.length >= 2
        && hullTurn(half[half.length - 2], half[half.length - 1], point) <= POLYGON_UNION_EPSILON
      ) {
        half.pop();
      }

      half.push(point);
    }

    return half;
  };
  const lower = halfHull(sorted);
  const upper = halfHull([...sorted].reverse());

  return normalizeUnionPolygon([...lower.slice(0, -1), ...upper.slice(0, -1)]);
}

function polygonHasNonAdjacentBoundaryContact(points) {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstStart = points[firstIndex];
    const firstEnd = points[(firstIndex + 1) % points.length];

    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      if (segmentsAreAdjacent(firstIndex, secondIndex, points.length)) {
        continue;
      }

      const secondStart = points[secondIndex];
      const secondEnd = points[(secondIndex + 1) % points.length];

      if (
        segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)
        || pointOnSegment(firstStart, secondStart, secondEnd)
        || pointOnSegment(firstEnd, secondStart, secondEnd)
        || pointOnSegment(secondStart, firstStart, firstEnd)
        || pointOnSegment(secondEnd, firstStart, firstEnd)
      ) {
        return true;
      }
    }
  }

  return false;
}

function preparePolygonForUnion(points) {
  const normalized = normalizeUnionPolygon(points);

  // The torso ring can collapse or reorder at full profile because its two
  // shoulders share an X coordinate while retaining different projected Y
  // values. Its visible mass is still the outer envelope of those anchors,
  // so use that envelope only when the authored walk no longer forms a valid
  // simple boundary. Normal poses retain every intentional neck/shoulder bend.
  return normalized.length < 3
    || Math.abs(polygonSignedArea(normalized)) <= POLYGON_UNION_EPSILON
    || polygonHasNonAdjacentBoundaryContact(normalized)
    ? convexHull(normalized)
    : normalized;
}

function uniqueSortedParameters(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const unique = [];

  for (const value of sorted) {
    if (!unique.length || Math.abs(value - unique[unique.length - 1]) > POLYGON_UNION_EPSILON) {
      unique.push(value);
    }
  }

  return unique;
}

function makeExteriorBoundarySegments(polygon, splitParameters, otherPolygon) {
  const segments = [];

  for (let edgeIndex = 0; edgeIndex < polygon.length; edgeIndex += 1) {
    const start = polygon[edgeIndex];
    const end = polygon[(edgeIndex + 1) % polygon.length];
    const parameters = uniqueSortedParameters(splitParameters[edgeIndex]);

    for (let splitIndex = 0; splitIndex < parameters.length - 1; splitIndex += 1) {
      const from = pointAlongSegment(start, end, parameters[splitIndex]);
      const to = pointAlongSegment(start, end, parameters[splitIndex + 1]);

      if (pointsNearlyEqual(from, to)) {
        continue;
      }

      const midpoint = {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2
      };

      if (!pointStrictlyInsidePolygon(midpoint, otherPolygon)) {
        segments.push({ from, to });
      }
    }
  }

  return segments;
}

function deduplicateBoundarySegments(segments) {
  const unique = [];

  for (const segment of segments) {
    const duplicate = unique.some(candidate => (
      pointsNearlyEqual(segment.from, candidate.from)
      && pointsNearlyEqual(segment.to, candidate.to)
    ) || (
      pointsNearlyEqual(segment.from, candidate.to)
      && pointsNearlyEqual(segment.to, candidate.from)
    ));

    if (!duplicate) {
      unique.push(segment);
    }
  }

  return unique;
}

function boundaryTurn(from, through, to) {
  const incomingX = through.x - from.x;
  const incomingY = through.y - from.y;
  const outgoingX = to.x - through.x;
  const outgoingY = to.y - through.y;
  let turn = Math.atan2(
    incomingX * outgoingY - incomingY * outgoingX,
    incomingX * outgoingX + incomingY * outgoingY
  );

  if (turn < 0) {
    turn += Math.PI * 2;
  }

  return turn;
}

function rotatePolygonToTopLeft(points) {
  let startIndex = 0;

  for (let index = 1; index < points.length; index += 1) {
    if (
      points[index].y < points[startIndex].y - POLYGON_UNION_EPSILON
      || (
        Math.abs(points[index].y - points[startIndex].y) <= POLYGON_UNION_EPSILON
        && points[index].x < points[startIndex].x
      )
    ) {
      startIndex = index;
    }
  }

  return [...points.slice(startIndex), ...points.slice(0, startIndex)];
}

function stitchBoundarySegments(segments) {
  const remaining = [...segments];
  const polygons = [];

  while (remaining.length) {
    const first = remaining.shift();
    const polygon = [first.from];
    let current = first;
    let closed = false;

    while (polygon.length <= segments.length + 1) {
      if (pointsNearlyEqual(current.to, polygon[0])) {
        closed = true;
        break;
      }

      polygon.push(current.to);
      const candidateIndexes = [];

      for (let index = 0; index < remaining.length; index += 1) {
        if (pointsNearlyEqual(remaining[index].from, current.to)) {
          candidateIndexes.push(index);
        }
      }

      if (!candidateIndexes.length) {
        break;
      }

      const nextIndex = candidateIndexes.reduce((bestIndex, candidateIndex) => {
        const bestTurn = boundaryTurn(current.from, current.to, remaining[bestIndex].to);
        const candidateTurn = boundaryTurn(current.from, current.to, remaining[candidateIndex].to);

        return candidateTurn < bestTurn ? candidateIndex : bestIndex;
      });

      current = remaining.splice(nextIndex, 1)[0];
    }

    if (!closed) {
      return null;
    }

    const normalized = normalizeUnionPolygon(polygon);

    if (normalized.length >= 3 && Math.abs(polygonSignedArea(normalized)) > POLYGON_UNION_EPSILON) {
      polygons.push(rotatePolygonToTopLeft(normalized));
    }
  }

  return polygons.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
}

// Returns the sampled-polygon union as one outer cycle when the shapes overlap
// and as two cycles when they are disjoint. Both inputs are walked clockwise;
// each edge is split at intersections and portions inside the other polygon
// are removed before the surviving boundary segments are stitched together.
function unionPolygonOutlines(firstPoints, secondPoints) {
  const first = preparePolygonForUnion(firstPoints);
  const second = preparePolygonForUnion(secondPoints);

  if (first.length < 3 || second.length < 3) {
    return null;
  }

  const firstSplits = first.map(() => [0, 1]);
  const secondSplits = second.map(() => [0, 1]);

  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[(firstIndex + 1) % first.length];

    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex];
      const secondEnd = second[(secondIndex + 1) % second.length];
      const intersection = segmentIntersectionParameters(firstStart, firstEnd, secondStart, secondEnd);

      if (intersection) {
        firstSplits[firstIndex].push(intersection.t);
        secondSplits[secondIndex].push(intersection.u);
      }
    }
  }

  const segments = deduplicateBoundarySegments([
    ...makeExteriorBoundarySegments(first, firstSplits, second),
    ...makeExteriorBoundarySegments(second, secondSplits, first)
  ]);

  return stitchBoundarySegments(segments);
}

const GARMENT_ROUND_JOIN_STEP = Math.PI / 12;
const GARMENT_MITER_LIMIT = 3;

function lineIntersection(firstPoint, firstDirection, secondPoint, secondDirection) {
  const denominator = firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x;

  if (Math.abs(denominator) <= POLYGON_UNION_EPSILON) {
    return null;
  }

  const between = subtractPoints(secondPoint, firstPoint);
  const distance = (between.x * secondDirection.y - between.y * secondDirection.x) / denominator;

  return {
    x: firstPoint.x + firstDirection.x * distance,
    y: firstPoint.y + firstDirection.y * distance
  };
}

function polygonEdge(points, index) {
  const from = points[index];
  const to = points[(index + 1) % points.length];
  const x = to.x - from.x;
  const y = to.y - from.y;
  const length = Math.hypot(x, y);

  if (length <= POLYGON_UNION_EPSILON) {
    return null;
  }

  const direction = { x: x / length, y: y / length };

  return {
    direction,
    // normalizeUnionPolygon uses positive signed area, which is clockwise in
    // screen coordinates. Rotating the edge counter-clockwise therefore
    // points away from the polygon interior.
    normal: { x: direction.y, y: -direction.x }
  };
}

function isValidGarmentPolygon(points) {
  return points.length >= 3
    && points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    && Math.abs(polygonSignedArea(points)) > POLYGON_UNION_EPSILON
    && !polygonHasNonAdjacentBoundaryContact(points)
    && !polygonSelfIntersects(points);
}

function buildRawOffsetPolygon(points, distance, joinStyle) {
  const source = normalizeUnionPolygon(points);

  if (distance <= POLYGON_UNION_EPSILON || source.length < 3) {
    return source;
  }

  const edges = source.map((_, index) => polygonEdge(source, index));

  if (edges.some(edge => !edge)) {
    return null;
  }

  const result = [];

  for (let index = 0; index < source.length; index += 1) {
    const point = source[index];
    const previousEdge = edges[(index - 1 + edges.length) % edges.length];
    const nextEdge = edges[index];
    const previousShifted = {
      x: point.x + previousEdge.normal.x * distance,
      y: point.y + previousEdge.normal.y * distance
    };
    const nextShifted = {
      x: point.x + nextEdge.normal.x * distance,
      y: point.y + nextEdge.normal.y * distance
    };
    const turn = previousEdge.direction.x * nextEdge.direction.y
      - previousEdge.direction.y * nextEdge.direction.x;
    const intersection = lineIntersection(
      previousShifted,
      previousEdge.direction,
      nextShifted,
      nextEdge.direction
    );

    if (turn > POLYGON_UNION_EPSILON && joinStyle === "round") {
      const dot = clamp(
        previousEdge.normal.x * nextEdge.normal.x + previousEdge.normal.y * nextEdge.normal.y,
        -1,
        1
      );
      const angle = Math.acos(dot);
      const segments = Math.max(1, Math.ceil(angle / GARMENT_ROUND_JOIN_STEP));
      const startAngle = Math.atan2(previousEdge.normal.y, previousEdge.normal.x);

      for (let segment = 0; segment <= segments; segment += 1) {
        const theta = startAngle + angle * segment / segments;
        result.push({
          x: point.x + Math.cos(theta) * distance,
          y: point.y + Math.sin(theta) * distance
        });
      }
    } else if (turn > POLYGON_UNION_EPSILON && joinStyle === "miter") {
      const miterLength = intersection ? Math.hypot(intersection.x - point.x, intersection.y - point.y) : Infinity;

      if (intersection && miterLength <= distance * GARMENT_MITER_LIMIT) {
        result.push(intersection);
      } else {
        result.push(previousShifted, nextShifted);
      }
    } else if (turn > POLYGON_UNION_EPSILON) {
      result.push(previousShifted, nextShifted);
    } else if (intersection) {
      result.push(intersection);
    } else {
      result.push(nextShifted);
    }
  }

  return normalizeUnionPolygon(result);
}

function segmentParameterForPoint(point, start, end) {
  const edgeX = end.x - start.x;
  const edgeY = end.y - start.y;
  const lengthSquared = edgeX * edgeX + edgeY * edgeY;

  if (lengthSquared <= POLYGON_UNION_EPSILON * POLYGON_UNION_EPSILON) {
    return 0;
  }

  return clamp(
    ((point.x - start.x) * edgeX + (point.y - start.y) * edgeY) / lengthSquared,
    0,
    1
  );
}

function addBoundaryContactSplit(point, ownParameter, otherStart, otherEnd, ownSplits, otherSplits) {
  if (!pointOnSegment(point, otherStart, otherEnd)) {
    return;
  }

  ownSplits.push(ownParameter);
  otherSplits.push(segmentParameterForPoint(point, otherStart, otherEnd));
}

function makeSplitBoundarySegments(polygon, splitParameters) {
  const segments = [];

  for (let edgeIndex = 0; edgeIndex < polygon.length; edgeIndex += 1) {
    const start = polygon[edgeIndex];
    const end = polygon[(edgeIndex + 1) % polygon.length];
    const parameters = uniqueSortedParameters(splitParameters[edgeIndex]);

    for (let splitIndex = 0; splitIndex < parameters.length - 1; splitIndex += 1) {
      const from = pointAlongSegment(start, end, parameters[splitIndex]);
      const to = pointAlongSegment(start, end, parameters[splitIndex + 1]);

      if (!pointsNearlyEqual(from, to)) {
        segments.push({ from, to });
      }
    }
  }

  return segments;
}

function polygonContainsSourcePolygon(candidate, source) {
  return source.every(point => (
    pointOnPolygonBoundary(point, candidate) || isPointInPolygon(point, candidate)
  ));
}

function findStrictSelfIntersection(points) {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstStart = points[firstIndex];
    const firstEnd = points[(firstIndex + 1) % points.length];

    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      if (segmentsAreAdjacent(firstIndex, secondIndex, points.length)) {
        continue;
      }

      const intersection = segmentIntersectionParameters(
        firstStart,
        firstEnd,
        points[secondIndex],
        points[(secondIndex + 1) % points.length]
      );

      if (
        intersection
        && intersection.t > POLYGON_UNION_EPSILON
        && intersection.t < 1 - POLYGON_UNION_EPSILON
        && intersection.u > POLYGON_UNION_EPSILON
        && intersection.u < 1 - POLYGON_UNION_EPSILON
      ) {
        return {
          firstIndex,
          secondIndex,
          point: pointAlongSegment(firstStart, firstEnd, intersection.t)
        };
      }
    }
  }

  return null;
}

function trimOffsetCrossingLoops(rawPoints) {
  let points = normalizeUnionPolygon(rawPoints);

  // A positive offset can close a narrow concavity. The naive edge walk then
  // crosses itself and encloses a small loop at that closure. At each strict
  // crossing, the two routes back to the intersection form the artifact loop
  // and the outer envelope; retaining the larger route removes one loop while
  // preserving the requested offset everywhere else.
  for (let iteration = 0; iteration < rawPoints.length; iteration += 1) {
    const crossing = findStrictSelfIntersection(points);

    if (!crossing) {
      return points;
    }

    const firstCycle = normalizeUnionPolygon([
      crossing.point,
      ...points.slice(crossing.firstIndex + 1, crossing.secondIndex + 1)
    ]);
    const secondCycle = normalizeUnionPolygon([
      crossing.point,
      ...points.slice(crossing.secondIndex + 1),
      ...points.slice(0, crossing.firstIndex + 1)
    ]);
    const candidates = [firstCycle, secondCycle]
      .filter(candidate => candidate.length >= 3)
      .sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));

    if (!candidates.length || candidates[0].length >= points.length) {
      return null;
    }

    points = candidates[0];
  }

  return null;
}

function resolveOffsetSelfIntersections(rawPoints, sourcePoints) {
  const raw = normalizeUnionPolygon(rawPoints);
  const source = normalizeUnionPolygon(sourcePoints);
  const trimmed = trimOffsetCrossingLoops(raw);

  if (
    trimmed
    && isValidGarmentPolygon(trimmed)
    && polygonContainsSourcePolygon(trimmed, source)
  ) {
    return rotatePolygonToTopLeft(trimmed);
  }

  const splitParameters = raw.map(() => [0, 1]);
  let foundBoundaryContact = false;

  for (let firstIndex = 0; firstIndex < raw.length; firstIndex += 1) {
    const firstStart = raw[firstIndex];
    const firstEnd = raw[(firstIndex + 1) % raw.length];

    for (let secondIndex = firstIndex + 1; secondIndex < raw.length; secondIndex += 1) {
      if (segmentsAreAdjacent(firstIndex, secondIndex, raw.length)) {
        continue;
      }

      const secondStart = raw[secondIndex];
      const secondEnd = raw[(secondIndex + 1) % raw.length];
      const intersection = segmentIntersectionParameters(firstStart, firstEnd, secondStart, secondEnd);
      const firstSplitCount = splitParameters[firstIndex].length;
      const secondSplitCount = splitParameters[secondIndex].length;

      if (intersection) {
        splitParameters[firstIndex].push(intersection.t);
        splitParameters[secondIndex].push(intersection.u);
      } else {
        // Parallel overlaps do not have a unique line intersection. Splitting
        // at every endpoint that lies on the opposite edge turns the overlap
        // into duplicate subsegments that the boundary deduplicator can drop.
        addBoundaryContactSplit(
          firstStart,
          0,
          secondStart,
          secondEnd,
          splitParameters[firstIndex],
          splitParameters[secondIndex]
        );
        addBoundaryContactSplit(
          firstEnd,
          1,
          secondStart,
          secondEnd,
          splitParameters[firstIndex],
          splitParameters[secondIndex]
        );
        addBoundaryContactSplit(
          secondStart,
          0,
          firstStart,
          firstEnd,
          splitParameters[secondIndex],
          splitParameters[firstIndex]
        );
        addBoundaryContactSplit(
          secondEnd,
          1,
          firstStart,
          firstEnd,
          splitParameters[secondIndex],
          splitParameters[firstIndex]
        );
      }

      if (
        splitParameters[firstIndex].length > firstSplitCount
        || splitParameters[secondIndex].length > secondSplitCount
      ) {
        foundBoundaryContact = true;
      }
    }
  }

  if (!foundBoundaryContact) {
    return null;
  }

  const segments = deduplicateBoundarySegments(
    makeSplitBoundarySegments(raw, splitParameters)
  );
  const cycles = stitchBoundarySegments(segments);

  if (!cycles) {
    return null;
  }

  return cycles.find(candidate => (
    isValidGarmentPolygon(candidate)
    && polygonContainsSourcePolygon(candidate, source)
  )) ?? null;
}

function resolveOffsetAttempt(source, distance, joinStyle) {
  const raw = buildRawOffsetPolygon(source, distance, joinStyle);

  if (!raw) {
    return null;
  }

  return isValidGarmentPolygon(raw)
    ? raw
    : resolveOffsetSelfIntersections(raw, source);
}

function offsetPolygonWithFallback(points, distance, joinStyle) {
  const source = normalizeUnionPolygon(points);
  const preferred = resolveOffsetAttempt(source, distance, joinStyle);

  if (preferred) {
    return preferred;
  }

  const beveled = joinStyle === "bevel"
    ? null
    : resolveOffsetAttempt(source, distance, "bevel");

  return beveled ?? source;
}

function mergePolygonCycles(polygons) {
  const cycles = [];

  for (const polygon of polygons) {
    let pending = normalizeUnionPolygon(polygon);
    let index = 0;

    while (index < cycles.length) {
      const merged = unionPolygonOutlines(cycles[index], pending);

      if (merged?.length === 1) {
        pending = merged[0];
        cycles.splice(index, 1);
        index = 0;
      } else {
        index += 1;
      }
    }

    cycles.push(pending);
  }

  return cycles.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
}

function offsetPolygonCycles(polygons, distance, joinStyle) {
  return mergePolygonCycles(polygons.map(points => (
    offsetPolygonWithFallback(points, distance, joinStyle)
  )));
}

function solveFeatures(params, pose, structure) {
  const projectStructure = createStructureProjector(params);
  const reference = structure.reference;
  const eyeScale = params.eyeSize / DEFAULTS.eyeSize;
  const eyeYOffset = params.eyeY - DEFAULTS.eyeY;
  const referenceEyes = spaceReferenceEyes(reference.eyes, params.eyeSpacing / DEFAULTS.eyeSpacing, pose.amount);
  const mouthScale = params.mouthWidth / DEFAULTS.mouthWidth;

  const eyes = [
    makeReferenceEye(projectStructure, structure.skull, pose.sign, referenceEyes[0], eyeScale, params, eyeYOffset, true, -1),
    makeReferenceEye(projectStructure, structure.skull, pose.sign, referenceEyes[1], eyeScale, params, eyeYOffset, true, 1)
  ];

  // Width and protrusion both scale an X offset from the bridge, but two
  // different ones: width scales the nostril reference (base), which is what
  // reads as "how wide the nose looks" head-on. Protrusion scales the tip's
  // own offset from the bridge, which is what reads as "how far the nose
  // pokes out" in 3/4 and side views. Keeping them on separate points means
  // widening the nose no longer also pushes the tip out in profile. noseY
  // translates the whole nose vertically as a rigid unit.
  const noseBridgeX = reference.nose.bridge[0];
  const noseWidthRef = point => [
    noseBridgeX + (point[0] - noseBridgeX) * params.noseWidth,
    point[1]
  ];
  const noseProtrusionRef = point => [
    noseBridgeX + (point[0] - noseBridgeX) * params.noseProtrusion,
    point[1]
  ];
  // Length moves only the bridge point up/down - tip and nostrils don't move
  // with it. Clamped so the bridge can never cross below the tip in any of
  // the three landmark poses (front/threeQuarter/side): since the offset is
  // a single constant applied the same way regardless of the current blended
  // pose, and each pose's own bridge-tip gap is fixed by its landmark data,
  // the binding constraint is whichever of the three poses has the smallest
  // gap - satisfying that one guarantees every blended yaw in between stays
  // safe too (the gap varies linearly with yaw between the three poses).
  const NOSE_LENGTH_RATE = 0.45;
  const NOSE_MIN_GAP_MARGIN = 2;
  const noseLandmarks = params.featureLandmarks ?? defaultFeatureLandmarks;
  const noseMinRawGap = Math.min(
    noseLandmarks.front.nose.tip[1] - noseLandmarks.front.nose.bridge[1],
    noseLandmarks.threeQuarter.nose.tip[1] - noseLandmarks.threeQuarter.nose.bridge[1],
    noseLandmarks.side.nose.tip[1] - noseLandmarks.side.nose.bridge[1]
  );
  const noseMinGapAbs = noseMinRawGap * structure.skull.ry;
  const noseRawBridgeOffset = (params.noseLength - DEFAULTS.noseLength) * NOSE_LENGTH_RATE;
  const noseBridgeOffset = Math.max(noseRawBridgeOffset, NOSE_MIN_GAP_MARGIN - noseMinGapAbs);
  const noseBase = noseWidthRef(reference.nose.base);
  const nostrils = makeNostrils(projectStructure, structure.skull, pose, noseBase, params.noseY, params.noseWidth);
  const nose = {
    bridge: projectReferencePoint(projectStructure, structure.skull, pose.sign, reference.nose.bridge, 55, eyeYOffset * 0.55 + params.noseY - noseBridgeOffset),
    tip: projectReferencePoint(projectStructure, structure.skull, pose.sign, noseProtrusionRef(reference.nose.tip), 75, params.noseY),
    leftNostril: nostrils.visible,
    rightNostril: nostrils.hidden
  };
  const featureVisibility = solveFeatureVisibilityFromNose(pose, eyes, nose.tip);
  eyes.forEach((eye, index) => {
    eye.visible = featureVisibility[index];
  });

  const browY = referenceEyes[0].cy * structure.skull.ry + structure.skull.cy - 30 + eyeYOffset;
  const browX = [
    pose.sign * referenceEyes[0].cx * structure.skull.rx,
    pose.sign * referenceEyes[1].cx * structure.skull.rx
  ];
  const browFill = resolveHairColor(params, params.showHairV2 ? "hairV2Color" : "hairColor").fill;
  const brows = [
    makeBrow(projectStructure, browX[0], browY, params, featureVisibility[0], -1, pose.sign, eyes[0], browFill),
    makeBrow(projectStructure, browX[1], browY, params, featureVisibility[1], 1, pose.sign, eyes[1], browFill)
  ];
  const eyeShading = eyes.map((eye, index) => (
    makeEyeShading(
      eye,
      brows[index],
      params.skinColor,
      Boolean(params.showEyeShading),
      Boolean(params.showBaggyEyeShading)
    )
  ));

  // Anchor the mouth vertically between the bottom of the nose and the chin,
  // then let mouthPosition slide it between those two points (0 = nose, 1 = chin).
  const skull = structure.skull;
  const noseBottomY = skull.cy + noseBase[1] * skull.ry + params.noseY;
  const chinY = structure.lowerFaceBottomY;
  const targetMouthMidY = lerp(noseBottomY, chinY, params.mouthPosition);
  const mouthYShift = targetMouthMidY - (skull.cy + reference.mouth.mid[1] * skull.ry);
  const mouth = makeMouth(projectStructure, skull, pose.sign, reference.mouth, mouthScale, params, mouthYShift);
  const moustache = {
    left: projectReferencePoint(projectStructure, skull, pose.sign, reference.moustache.left, 60),
    right: projectReferencePoint(projectStructure, skull, pose.sign, reference.moustache.right, 60)
  };
  const soulPatch = projectReferencePoint(projectStructure, skull, pose.sign, reference.soulPatch.root, 60);

  return {
    eyes,
    brows,
    eyeShading,
    nose,
    mouth,
    moustache,
    soulPatch
  };
}

function solveFeatureVisibilityFromNose(pose, eyes, noseTip) {
  const farEyeIsOccluded = pose.sign < 0
    ? noseTip.x > eyes[0].center.x
    : noseTip.x < eyes[0].center.x;

  return [
    !farEyeIsOccluded,
    true
  ];
}

const MOUSTACHE_LOCK_SEED = 10000;
const BEARD_LOCK_SEED = 20000;
const SOUL_PATCH_LOCK_SEED = 30000;
const BEARD_CHIN_COVERAGE = 0.15;
const BEARD_ROOT_LIFT = 8;
const MOUSTACHE_FAR_SCALE_START_YAW = 0.15;
const MOUSTACHE_FAR_MIN_LONGITUDINAL_SCALE = 0.08;
const FACIAL_HAIR_HIDE_DEPTH_THRESHOLD = -Math.SQRT1_2;
const FACIAL_HAIR_DEPTH_EPSILON = 1e-9;

function solveFacialHair(params, pose, head, features) {
  if (!params.showMoustache && !params.showSoulPatch && !params.showBeard) {
    return null;
  }

  const color = resolveHairColor(params, "hairV2Color");
  const shineColor = resolveHairShineColor(params, "hairV2Color");
  const results = [
    ...(params.showMoustache
      ? makeMoustacheLocks(params, pose, features, color, shineColor)
      : []),
    ...(params.showSoulPatch
      ? [makeSoulPatchLock(params, pose, features, color, shineColor)]
      : []),
    ...(params.showBeard
      ? makeBeardLocks(params, pose, head, features, color, shineColor)
      : [])
  ];

  return {
    locks: results.map(result => result.lock),
    shines: results.flatMap(result => result.shine ? [result.shine] : []),
    sharedOutline: Boolean(params.hairV2SharedOutline)
  };
}

function makeMoustacheLocks(params, pose, features, color, shineColor) {
  const roots = [features.moustache.left, features.moustache.right]
    .map(point => ({ x: point.x, y: point.y }))
    .sort((left, right) => left.x - right.x);
  const centerX = (roots[0].x + roots[1].x) / 2;

  return roots.flatMap((root, index) => {
    // Screen-side identity controls which projected lock shortens as the pose
    // mirrors, but both moustache locks remain in the front rendering pass.
    const lateralPosition = index === 0 ? -1 : 1;
    const depthPosition = facialHairDepthPosition(lateralPosition, pose.yaw);

    const screenSide = Math.sign(root.x - centerX) || 1;
    const direction = normalizePoint({ x: screenSide, y: 0.15 });
    const isFarSide = screenSide * pose.yaw < 0;
    const longitudinalScale = isFarSide
      ? lerp(
          1,
          MOUSTACHE_FAR_MIN_LONGITUDINAL_SCALE,
          smoothstep(MOUSTACHE_FAR_SCALE_START_YAW, 1, Math.abs(pose.yaw))
        )
      : 1;

    const result = makeHairV2Lock({
      index: MOUSTACHE_LOCK_SEED,
      base: root,
      direction,
      params,
      lengthOverride: params.moustacheLength,
      color,
      shineColor,
      curveMirror: screenSide,
      sidePosition: screenSide,
      depthPosition,
      layer: "front"
    });

    return [scaleLockGeometryLongitudinally(result, root, direction, longitudinalScale)];
  });
}

// Compress a completed lock along its own travel axis while preserving every
// perpendicular offset. This keeps the curl and lock width readable as the
// far moustache shortens, and because coordinates are rewritten rather than
// SVG-scaled, stroke width remains unchanged.
function scaleLockGeometryLongitudinally(result, origin, axis, scale) {
  if (scale >= 1) {
    return result;
  }

  return {
    lock: transformGeometryAlongAxis(result.lock, origin, axis, scale),
    shine: result.shine
      ? transformGeometryAlongAxis(result.shine, origin, axis, scale)
      : null
  };
}

function transformGeometryAlongAxis(value, origin, axis, scale) {
  if (Array.isArray(value)) {
    return value.map(item => transformGeometryAlongAxis(item, origin, axis, scale));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
    const offset = subtractPoints(value, origin);
    const longitudinalDistance = offset.x * axis.x + offset.y * axis.y;
    const adjustment = longitudinalDistance * (scale - 1);

    return {
      ...value,
      x: value.x + axis.x * adjustment,
      y: value.y + axis.y * adjustment
    };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      transformGeometryAlongAxis(item, origin, axis, scale)
    ])
  );
}

function makeSoulPatchLock(params, pose, features, color, shineColor) {
  return makeHairV2Lock({
    index: SOUL_PATCH_LOCK_SEED,
    base: features.soulPatch,
    direction: { x: 0, y: 1 },
    params,
    lengthOverride: params.beardLength,
    color,
    shineColor,
    curveMirror: pose.sign,
    sidePosition: 0,
    depthPosition: facialHairDepthPosition(0, pose.yaw)
  });
}

function makeBeardLocks(params, pose, head, features, color, shineColor) {
  const jawPath = makeJawPath(head.baseOutline ?? head.outline, features.nose.tip.y);

  if (jawPath.length < 2) {
    return [];
  }

  const distances = cumulativePolylineDistances(jawPath);
  const totalLength = distances[distances.length - 1];
  const chinIndex = jawPath.reduce(
    (bestIndex, point, index) => point.y > jawPath[bestIndex].y ? index : bestIndex,
    0
  );
  const chinDistance = distances[chinIndex];
  const coverage = lerp(BEARD_CHIN_COVERAGE, 1, clamp(params.beardCoverage, 0, 1));
  const startDistance = chinDistance - chinDistance * coverage;
  const endDistance = chinDistance + (totalLength - chinDistance) * coverage;
  const count = Math.max(2, Math.round(params.beardLockCount));
  const projectStructure = createStructureProjector(params);
  const lowerFace = head.structure.lowerFace;
  const faceCenter = projectStructure(lowerFace.cx, lowerFace.cy, lowerFace.z);
  const tangentStep = Math.max(1, totalLength * 0.005);

  return Array.from({ length: count }, (_, index) => {
    const amount = count === 1 ? 0.5 : index / (count - 1);
    const distance = lerp(startDistance, endDistance, amount);
    const lateralPosition = jawLateralPosition(distance, chinDistance, totalLength);
    const depthPosition = facialHairDepthPosition(lateralPosition, pose.yaw);

    if (isFacialHairDepthHidden(depthPosition)) {
      return [];
    }

    const jawBase = samplePolylineAtDistance(jawPath, distances, distance);
    const base = { x: jawBase.x, y: jawBase.y - BEARD_ROOT_LIFT };
    const before = samplePolylineAtDistance(jawPath, distances, Math.max(0, distance - tangentStep));
    const after = samplePolylineAtDistance(jawPath, distances, Math.min(totalLength, distance + tangentStep));
    const tangent = normalizePoint(subtractPoints(after, before));
    let outward = { x: -tangent.y, y: tangent.x };
    const awayFromCenter = subtractPoints(base, faceCenter);

    if (outward.x * awayFromCenter.x + outward.y * awayFromCenter.y < 0) {
      outward = scalePoint(outward, -1);
    }

    const direction = normalizePoint({
      x: outward.x,
      y: outward.y + params.hairV2Gravity
    });
    const screenSide = Math.sign(base.x - faceCenter.x) || pose.sign;
    const sidePosition = clamp(
      (base.x - faceCenter.x) / Math.max(1, lowerFace.rx),
      -1,
      1
    );

    return [makeHairV2Lock({
      index: BEARD_LOCK_SEED + index,
      base,
      direction,
      params,
      lengthOverride: params.beardLength,
      color,
      shineColor,
      curveMirror: screenSide,
      sidePosition,
      depthPosition
    })];
  }).flat();
}

function jawLateralPosition(distance, chinDistance, totalLength) {
  if (distance <= chinDistance) {
    return chinDistance > 0 ? -(chinDistance - distance) / chinDistance : 0;
  }

  const rightLength = totalLength - chinDistance;
  return rightLength > 0 ? (distance - chinDistance) / rightLength : 0;
}

function facialHairDepthPosition(lateralPosition, yaw) {
  return Math.cos((lateralPosition - yaw) * Math.PI / 2);
}

function isFacialHairDepthHidden(depthPosition) {
  return depthPosition <= FACIAL_HAIR_HIDE_DEPTH_THRESHOLD + FACIAL_HAIR_DEPTH_EPSILON;
}

// Walk both directions from the lowest outline point until reaching the same
// vertical attachment level the ear solver uses. Combining those walks yields
// the visible lower edge from one ear base through the chin to the other.
function makeJawPath(outline, earBottomY) {
  if (!outline?.length) {
    return [];
  }

  const chinIndex = outline.reduce(
    (bestIndex, point, index) => point.y > outline[bestIndex].y ? index : bestIndex,
    0
  );
  const lowerStart = outline[OUTLINE_UPPER_ARC_POINT_COUNT] ?? outline[0];
  const lowerEnd = outline[outline.length - 1];
  const lowerSideY = Math.max(lowerStart.y, lowerEnd.y);
  const fallbackAttachmentY = lerp(lowerSideY, outline[chinIndex].y, 0.45);
  const attachmentY = Math.min(earBottomY, fallbackAttachmentY);
  const firstSide = walkOutlineToY(outline, chinIndex, -1, attachmentY);
  const secondSide = walkOutlineToY(outline, chinIndex, 1, attachmentY);

  if (!firstSide || !secondSide) {
    return [];
  }

  let path = [...firstSide.reverse(), ...secondSide.slice(1)];

  if (path[0].x > path[path.length - 1].x) {
    path = path.reverse();
  }

  return path;
}

function walkOutlineToY(outline, startIndex, step, targetY) {
  const points = [{ x: outline[startIndex].x, y: outline[startIndex].y }];
  let currentIndex = startIndex;

  for (let visited = 0; visited < outline.length; visited += 1) {
    const nextIndex = (currentIndex + step + outline.length) % outline.length;
    const current = outline[currentIndex];
    const next = outline[nextIndex];

    if (current.y >= targetY && next.y <= targetY) {
      const span = next.y - current.y;
      const amount = Math.abs(span) < 0.001 ? 0 : (targetY - current.y) / span;
      points.push({
        x: lerp(current.x, next.x, amount),
        y: targetY
      });
      return points;
    }

    points.push({ x: next.x, y: next.y });
    currentIndex = nextIndex;
  }

  return null;
}

function cumulativePolylineDistances(points) {
  const distances = [0];

  for (let index = 1; index < points.length; index += 1) {
    const segment = subtractPoints(points[index], points[index - 1]);
    distances.push(distances[index - 1] + Math.hypot(segment.x, segment.y));
  }

  return distances;
}

function samplePolylineAtDistance(points, distances, targetDistance) {
  const totalLength = distances[distances.length - 1];
  const distance = clamp(targetDistance, 0, totalLength);

  for (let index = 1; index < distances.length; index += 1) {
    if (distance > distances[index]) {
      continue;
    }

    const segmentLength = distances[index] - distances[index - 1];
    const amount = segmentLength > 0
      ? (distance - distances[index - 1]) / segmentLength
      : 0;

    return {
      x: lerp(points[index - 1].x, points[index].x, amount),
      y: lerp(points[index - 1].y, points[index].y, amount)
    };
  }

  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
}

function solveHair(params, pose, structure) {
  const guides = makeHairGuides(params, pose, structure);
  const anchors = makeScalpAnchors(guides, params);
  const strands = params.showHairStrands
    ? makeHairStrands(anchors, params, pose)
    : [];

  return {
    renderMode: params.hairRenderMode,
    anchors,
    strands,
    locks: makeHairLocks(anchors, params, pose),
    guides: params.showHairPartGuide ? guides : []
  };
}

function makeHairGuides(params, pose, structure) {
  return [
    { angleOffset: -1, sideWeight: 1, backWeight: 0, lengthMultiplier: 1 },
    { angleOffset: -0.5, sideWeight: 0.5, backWeight: 0, lengthMultiplier: 1 },
    { angleOffset: 0, sideWeight: 0, backWeight: 0, lengthMultiplier: 1 },
    { angleOffset: 0.5, sideWeight: 0.5, backWeight: 0, lengthMultiplier: 1 },
    { angleOffset: 1, sideWeight: 1, backWeight: 0, lengthMultiplier: 1 },
    { angleOffset: 1.5, sideWeight: 1, backWeight: 1, lengthMultiplier: 1.25 },
    { angleOffset: 2, sideWeight: 0, backWeight: 1, lengthMultiplier: 1.5 },
    { angleOffset: -1.5, sideWeight: 1, backWeight: 1, lengthMultiplier: 1.25 }
  ].map(guideConfig => {
    const { sideWeight } = guideConfig;
    const baldnessScale = lerp(1, 0.55 + 0.45 * sideWeight, params.hairMalePatternBaldnessBias);
    const shapeScale = hairlineShapeScale(params.hairlineShape, sideWeight);
    const bangsShift = params.hairBangsBias * (sideWeight - 0.5) * 0.8;
    const baseHairlineAmount = clamp(params.hairline * params.hairPartDepth * baldnessScale * shapeScale + bangsShift, 0.05, 1.2);
    const hairlineAmount = clamp(baseHairlineAmount * guideConfig.lengthMultiplier, 0.05, 2);

    return makeHairGuide(params, pose, structure, guideConfig, hairlineAmount);
  });
}

function hairlineShapeScale(shape, sideWeight) {
  const centerWeight = 1 - sideWeight;

  if (shape === "straight") {
    return 1;
  }

  if (shape === "widowsPeak") {
    return 0.9 + centerWeight * 0.3;
  }

  if (shape === "receding") {
    return 1 - centerWeight * 0.28;
  }

  return 0.92 + centerWeight * 0.16;
}

function makeHairGuide(params, pose, structure, guideConfig, hairlineAmount) {
  const projectStructure = createStructureProjector(params);
  const { skull } = structure;
  const partShift = params.hairPartPosition * Math.PI * 0.35;
  const guideAngle = guideConfig.angleOffset * Math.PI / 2 + partShift - pose.yaw * Math.PI / 2;
  const sidePosition = Math.sin(guideAngle);
  const depthPosition = Math.cos(guideAngle);
  const angularVisibility = clamp((depthPosition + Math.SQRT1_2) / Math.SQRT1_2, 0, 1);
  const guideEndTheta = lerp(-Math.PI / 2, 0, hairlineAmount);
  const points = [];

  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const theta = lerp(-Math.PI / 2, guideEndTheta, t);
    const curveX = Math.cos(theta) * skull.rx * sidePosition;

    points.push(projectStructure(
      curveX,
      skull.cy + Math.sin(theta) * skull.ry,
      72 * depthPosition
    ));
  }

  points.sideWeight = guideConfig.sideWeight;
  points.backWeight = guideConfig.backWeight;
  points.lengthMultiplier = guideConfig.lengthMultiplier;
  points.angularVisibility = angularVisibility;

  return points;
}

function makeScalpAnchors(guides, params) {
  return guides.flatMap((guide, guideIndex) => {
    const guideSideWeight = guide.sideWeight ?? Math.abs(guideIndex - ((guides.length - 1) / 2)) / ((guides.length - 1) / 2);
    const guideBackWeight = guide.backWeight ?? 0;
    const guideAngularVisibility = guide.angularVisibility ?? 1;

    return Array.from({ length: 9 }, (_, pointIndex) => {
      const guidePosition = pointIndex / 8;
      const sample = samplePolyline(guide, guidePosition);
      const crownCoverage = lerp(params.hairCrownCoverage, 1, guidePosition);
      const sideCoverage = lerp(1, params.hairSideCoverage, guideSideWeight);
      const coverage = clamp(crownCoverage * sideCoverage * guideAngularVisibility, 0, 1);

      return {
        point: sample.point,
        tangent: sample.tangent,
        sideWeight: guideSideWeight,
        guideIndex,
        pointIndex,
        guidePosition,
        depth: sample.depth,
        layer: sample.depth < -65 && guideSideWeight > 0.9 ? "back" : "front",
        backWeight: guideBackWeight,
        angularVisibility: guideAngularVisibility,
        coverage
      };
    });
  });
}

function makeHairStrands(anchors, params, pose) {
  const count = Math.round(params.hairStrandCount);

  if (count <= 0 || !anchors.length) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const anchor = selectStableHairAnchor(
      anchors,
      index,
      count,
      0,
      params.hairMirror ? HAIR_MIRROR_SOURCE_GUIDES : null
    );
    const randomIndex = index + anchor.guideIndex * 101 + anchor.pointIndex * 17;
    const strand = makeHairStrand(
      anchor,
      params,
      pose,
      randomIndex
    );

    if (!params.hairMirror) {
      return [strand];
    }

    return [
      strand,
      makeHairStrand(
        findMirrorHairAnchor(anchors, anchor),
        params,
        pose,
        randomIndex,
        -1
      )
    ];
  }).flat();
}

function selectStableHairAnchor(anchors, index, count, minGuidePosition, guideIndices = null) {
  const guideCount = Math.max(...anchors.map(anchor => anchor.guideIndex)) + 1;
  const anchorSlots = Math.max(...anchors.map(anchor => anchor.pointIndex)) + 1;
  const sourceGuides = guideIndices ?? Array.from({ length: guideCount }, (_, guideIndex) => guideIndex);
  const guideIndex = sourceGuides[index % sourceGuides.length];
  const positionIndex = Math.floor(index / sourceGuides.length);
  const positionsPerGuide = Math.max(1, Math.ceil(count / sourceGuides.length));
  const minPointIndex = Math.ceil(minGuidePosition * (anchorSlots - 1));
  const usableSlots = anchorSlots - minPointIndex;
  const pointIndex = minPointIndex + Math.min(
    usableSlots - 1,
    Math.floor(positionIndex * usableSlots / positionsPerGuide)
  );

  return anchors.find(anchor => anchor.guideIndex === guideIndex && anchor.pointIndex === pointIndex)
    ?? anchors[index % anchors.length];
}

function findMirrorHairAnchor(anchors, anchor) {
  const mirrorGuideIndex = HAIR_MIRROR_GUIDES[anchor.guideIndex] ?? anchor.guideIndex;

  return anchors.find(candidate => (
    candidate.guideIndex === mirrorGuideIndex
    && candidate.pointIndex === anchor.pointIndex
  )) ?? anchor;
}

function haircutWeight(sideWeight, haircutType) {
  return haircutType >= 0
    ? 1 - haircutType * (1 - sideWeight)
    : 1 + haircutType * sideWeight;
}

function applyHaircut(anchor, direction, rawLength, params) {
  const cutWeight = haircutWeight(anchor.sideWeight, params.hairHaircutType);
  let targetLength = rawLength;

  if (cutWeight > 0) {
    const cutoffY = params.hairHaircutLength;
    const naturalTipY = anchor.point.y + direction.y * rawLength;

    if (naturalTipY > cutoffY) {
      targetLength = direction.y > 0.001
        ? clamp((cutoffY - anchor.point.y) / direction.y, 0, rawLength)
        : 0;
    }
  }

  const cutLength = lerp(rawLength, targetLength, cutWeight);
  const undercutMultiplier = lerp(1, 0.15, params.hairUndercutBias * anchor.guidePosition);

  return cutLength * undercutMultiplier;
}

function makeHairStrand(anchor, params, pose, randomIndex, mirrorSign = 1) {
  const hairColor = resolveHairColor(params);
  const t = anchor.guidePosition;
  const randomSide = (seededRandom(randomIndex, 1) < 0.5 ? -1 : 1) * mirrorSign;
  const guideSide = Math.sign(anchor.point.x - 250);
  const outwardSide = guideSide === 0 ? randomSide : -guideSide;
  const side = seededRandom(randomIndex, 6) < smoothstep(0.35, 1, pose.amount)
    ? outwardSide
    : randomSide;
  const frontDownWeight = (1 - t) * (1 - params.hairDownBias) * 0.55;
  const downWeight = clamp(params.hairDownBias + frontDownWeight, 0, 1);
  const wildVertical = lerp(-0.55, 0.4, seededRandom(randomIndex, 5)) * (1 - params.hairDownBias) * t;
  const outward = {
    x: -anchor.tangent.y * side,
    y: anchor.tangent.x * side
  };
  const direction = normalizePoint({
    x: outward.x * (1 - downWeight),
    y: outward.y * (1 - downWeight) + downWeight + wildVertical
  });
  const bangsLengthMultiplier = lerp(1, 4, params.hairBangsLength * anchor.sideWeight);
  const rawLength = params.hairStrandLength * bangsLengthMultiplier * lerp(0.62, 1.38, seededRandom(randomIndex, 2));
  const length = applyHaircut(anchor, direction, rawLength, params);
  const thickness = params.hairStrandThickness * lerp(0.55, 1.45, seededRandom(randomIndex, 3));
  const curve = params.hairStrandCurve * length * lerp(-0.55, 0.85, seededRandom(randomIndex, 4)) * mirrorSign;
  const splitCurve = seededRandom(randomIndex, 7) < params.hairStrandSplitCurve;
  const curveNormal = {
    x: -direction.y,
    y: direction.x
  };
  const baseLeft = offsetPoint(anchor.point, anchor.tangent, -thickness / 2);
  const baseRight = offsetPoint(anchor.point, anchor.tangent, thickness / 2);
  const tip = offsetPoint(anchor.point, direction, length);
  const curveOffset = {
    x: curveNormal.x * curve,
    y: curveNormal.y * curve
  };
  const splitCurveOffset = {
    x: anchor.tangent.x * Math.abs(curve),
    y: anchor.tangent.y * Math.abs(curve)
  };
  const controlLeftOffset = splitCurve
    ? { x: -splitCurveOffset.x, y: -splitCurveOffset.y }
    : curveOffset;
  const controlRightOffset = splitCurve
    ? splitCurveOffset
    : curveOffset;

  return {
    baseLeft,
    baseRight,
    tip,
    controlLeft: addPoints(
      offsetPoint(baseLeft, direction, length * 0.48),
      controlLeftOffset
    ),
    controlRight: addPoints(
      offsetPoint(baseRight, direction, length * 0.48),
      controlRightOffset
    ),
    layer: anchor.layer,
    guideIndex: anchor.guideIndex,
    pointIndex: anchor.pointIndex,
    backWeight: anchor.backWeight,
    mirrored: mirrorSign < 0,
    fill: hairColor.fill,
    stroke: hairColor.stroke,
    opacity: 0.92
  };
}

function makeHairLocks(anchors, params, pose) {
  const count = Math.round(params.hairLockCount);

  if (count <= 0 || !anchors.length) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const anchor = selectStableHairAnchor(
      anchors,
      index,
      count,
      0.08,
      params.hairMirror ? HAIR_MIRROR_SOURCE_GUIDES : null
    );
    const randomIndex = index + anchor.guideIndex * 131 + anchor.pointIndex * 19;
    const lock = makeHairLock(
      anchor,
      params,
      pose,
      randomIndex
    );

    if (!params.hairMirror) {
      return [lock];
    }

    return [
      lock,
      makeHairLock(
        findMirrorHairAnchor(anchors, anchor),
        params,
        pose,
        randomIndex,
        -1
      )
    ];
  }).flat();
}

function makeHairLock(anchor, params, pose, randomIndex, mirrorSign = 1) {
  const hairColor = resolveHairColor(params);
  const randomSide = (seededRandom(randomIndex, 1) < 0.5 ? -1 : 1) * mirrorSign;
  const guideSide = Math.sign(anchor.point.x - 250);
  const outwardSide = guideSide === 0 ? randomSide : -guideSide;
  const side = seededRandom(randomIndex, 2) < smoothstep(0.35, 1, pose.amount)
    ? outwardSide
    : randomSide;
  const asymmetry = (seededRandom(randomIndex, 6) - 0.5) * params.hairLockAsymmetry * mirrorSign;
  const outward = {
    x: -anchor.tangent.y * side,
    y: anchor.tangent.x * side
  };
  const direction = normalizePoint({
    x: outward.x * (1 - params.hairLockGravity) + asymmetry * anchor.sideWeight,
    y: outward.y * (1 - params.hairLockGravity) + params.hairLockGravity
  });
  const bangsLengthMultiplier = lerp(1, 4, params.hairBangsLength * anchor.sideWeight);
  const rawLength = params.hairLockLength * bangsLengthMultiplier * lerp(0.72, 1.28, seededRandom(randomIndex, 3));
  const length = applyHaircut(anchor, direction, rawLength, params);
  const width = params.hairLockWidth * lerp(0.72, 1.35, seededRandom(randomIndex, 4));
  const curve = params.hairLockCurve * length * lerp(-0.4, 0.8, seededRandom(randomIndex, 5)) * mirrorSign;
  const curveType = resolveHairCurveType(params.hairCurveType, randomIndex);
  const curveNormal = {
    x: -direction.y,
    y: direction.x
  };
  const rootLeft = offsetPoint(anchor.point, anchor.tangent, -width / 2);
  const rootRight = offsetPoint(anchor.point, anchor.tangent, width / 2);
  const baseTip = offsetPoint(anchor.point, direction, length);
  const curveSign = Math.sign(curve) || (seededRandom(randomIndex, 8) < 0.5 ? -1 : 1);
  const tip = offsetPoint(baseTip, curveNormal, curveSign * params.hairTipHook * width * 0.55);
  const curveOffset = {
    x: curveNormal.x * curve,
    y: curveNormal.y * curve
  };
  const curveControls = makeHairCurveControls({
    rootLeft,
    rootRight,
    tip,
    direction,
    tangent: anchor.tangent,
    normal: curveNormal,
    curve,
    length,
    width,
    curveType,
    rhythm: params.hairCurveRhythm,
    tension: params.hairCurveTension,
    asymmetry
  });
  const notchDepth = seededRandom(randomIndex, 7) < 0.38
    ? width * params.hairLockTaper * 0.18
    : 0;
  const tipSpread = width * (1 - params.hairLockTaper) * 0.16 + width * 0.035;
  const tipLeft = offsetPoint(tip, anchor.tangent, -tipSpread);
  const tipRight = offsetPoint(tip, anchor.tangent, tipSpread);
  const notch = notchDepth > 0
    ? offsetPoint(tip, direction, -notchDepth)
    : null;
  const detailLines = makeHairLockDetailLines(
    rootLeft,
    rootRight,
    tip,
    curveOffset,
    Math.round(params.hairLockDetailLines),
    hairColor.stroke
  );

  return {
    rootLeft,
    rootRight,
    tip,
    tipLeft,
    tipRight,
    notch,
    ...curveControls,
    detailLines,
    layer: anchor.layer,
    guideIndex: anchor.guideIndex,
    pointIndex: anchor.pointIndex,
    backWeight: anchor.backWeight,
    mirrored: mirrorSign < 0,
    fill: hairColor.fill,
    stroke: hairColor.stroke,
    opacity: 0.94
  };
}

export function makeHairCurveControls({
  rootLeft,
  rootRight,
  tip,
  direction,
  tangent,
  normal,
  curve,
  length,
  width,
  curveType,
  rhythm,
  tension,
  asymmetry
}) {
  const curveSign = Math.sign(curve) || 1;
  const curveAmount = Math.abs(curve);
  const rootHandleLength = length * lerp(0.18, 0.42, tension);
  const tipHandleLength = length * lerp(0.22, 0.55, tension);
  const rootBend = curveSign * curveAmount * lerp(0.45, 1.15, rhythm);
  const tipBend = curveSign * curveAmount * (curveType === "s" ? -1 : 1) * lerp(1.1, 0.55, rhythm);
  const leftRootScale = clamp(1 + asymmetry * 0.65, 0.55, 1.45);
  const rightRootScale = clamp(1 - asymmetry * 0.65, 0.55, 1.45);
  const leftTipScale = clamp(1 - asymmetry * 0.35, 0.65, 1.35);
  const rightTipScale = clamp(1 + asymmetry * 0.35, 0.65, 1.35);
  const tipSpread = width * 0.08;
  const leftTipTarget = offsetPoint(tip, tangent, -tipSpread);
  const rightTipTarget = offsetPoint(tip, tangent, tipSpread);

  return {
    controlLeft1: addPoints(
      offsetPoint(rootLeft, direction, rootHandleLength),
      scalePoint(normal, rootBend * leftRootScale)
    ),
    controlLeft2: addPoints(
      offsetPoint(leftTipTarget, direction, -tipHandleLength),
      scalePoint(normal, tipBend * leftTipScale)
    ),
    controlRight2: addPoints(
      offsetPoint(rightTipTarget, direction, -tipHandleLength),
      scalePoint(normal, tipBend * rightTipScale)
    ),
    controlRight1: addPoints(
      offsetPoint(rootRight, direction, rootHandleLength),
      scalePoint(normal, rootBend * rightRootScale)
    )
  };
}

export function resolveHairCurveType(type, randomIndex) {
  if (type === "c" || type === "s") {
    return type;
  }

  return seededRandom(randomIndex, 10) < 0.45 ? "s" : "c";
}

export function makeHairLockDetailLines(rootLeft, rootRight, tip, curveOffset, count, stroke) {
  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : (index + 1) / (count + 1);
    const root = {
      x: lerp(rootLeft.x, rootRight.x, t),
      y: lerp(rootLeft.y, rootRight.y, t)
    };
    const end = {
      x: lerp(root.x, tip.x, 0.86),
      y: lerp(root.y, tip.y, 0.86)
    };
    const control = addPoints({
      x: lerp(root.x, tip.x, 0.48),
      y: lerp(root.y, tip.y, 0.48)
    }, {
      x: curveOffset.x * 0.45,
      y: curveOffset.y * 0.45
    });

    return {
      start: root,
      control,
      end,
      stroke
    };
  });
}

export function resolveHairColor(params, colorKey = "hairColor") {
  const fill = isHexColor(params[colorKey]) ? params[colorKey] : "#2a241e";

  return {
    fill,
    stroke: darkenHex(fill, 0.55)
  };
}

// A lightened variant of the same base color, for shine highlights - no
// stroke pairing, since shine renders as a borderless fill.
export function resolveHairShineColor(params, colorKey = "hairColor") {
  const fill = isHexColor(params[colorKey]) ? params[colorKey] : "#2a241e";

  return lightenHex(fill, 0.5);
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function darkenHex(value, amount) {
  const numeric = Number.parseInt(value.slice(1), 16);
  const r = Math.round(((numeric >> 16) & 255) * amount);
  const g = Math.round(((numeric >> 8) & 255) * amount);
  const b = Math.round((numeric & 255) * amount);

  return `#${[r, g, b]
    .map(channel => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function lightenHex(value, amount) {
  const numeric = Number.parseInt(value.slice(1), 16);
  const channels = [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];

  return `#${channels
    .map(channel => Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, "0"))
    .join("")}`;
}

function samplePolyline(points, t) {
  const scaled = clamp(t, 0, 1) * (points.length - 1);
  const index = Math.min(Math.floor(scaled), points.length - 2);
  const localT = scaled - index;
  const start = points[index];
  const end = points[index + 1];
  const tangent = normalizePoint({
    x: end.x - start.x,
    y: end.y - start.y
  });

  return {
    point: {
      x: lerp(start.x, end.x, localT),
      y: lerp(start.y, end.y, localT),
      scale: lerp(start.scale, end.scale, localT),
      depth: lerp(start.depth, end.depth, localT)
    },
    tangent,
    scale: lerp(start.scale, end.scale, localT),
    depth: lerp(start.depth, end.depth, localT)
  };
}

export function normalizePoint(point) {
  const length = Math.hypot(point.x, point.y) || 1;

  return {
    x: point.x / length,
    y: point.y / length
  };
}

export function offsetPoint(point, direction, distance) {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance
  };
}

export function addPoints(first, second) {
  return {
    x: first.x + second.x,
    y: first.y + second.y
  };
}

export function scalePoint(point, amount) {
  return {
    x: point.x * amount,
    y: point.y * amount
  };
}

export function subtractPoints(first, second) {
  return {
    x: first.x - second.x,
    y: first.y - second.y
  };
}

export function rotatePoint(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

export function seededRandom(index, salt) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;

  return value - Math.floor(value);
}

function spaceReferenceEyes(referenceEyes, spacingScale, poseAmount) {
  const midpoint = (referenceEyes[0].cx + referenceEyes[1].cx) / 2;
  const profileShift = smoothstep(0.5, 1, poseAmount) * (spacingScale - 1) * PROFILE_EYE_SPACING_SHIFT;

  return referenceEyes.map(eye => ({
    ...eye,
    cx: midpoint + (eye.cx - midpoint) * spacingScale + profileShift
  }));
}

function solveHelmet(params, pose, structure, features) {
  if (!params.showHelmet) {
    return {
      back: [],
      front: []
    };
  }

  const projectStructure = createStructureProjector(params);
  const { skull, lowerFace, reference } = structure;
  const profile = smoothstep(0.55, 1, pose.amount);
  const farOpacity = 1 - smoothstep(0.45, 0.95, pose.amount);

  const back = [
    params.showHelmetShell
      ? {
          name: "shell",
          points: makeHelmetShell(projectStructure, skull, pose),
          fill: "#b7833b",
          stroke: "black",
          opacity: 0.95
        }
      : null
  ].filter(Boolean);
  const front = [
    params.showHelmetFacePlate
      ? {
          name: "face-plate",
          points: makeHelmetFacePlate(projectStructure, skull, pose, features.eyes),
          fill: "#d1a04b",
          stroke: "black",
          opacity: 0.96
        }
      : null,
    params.showHelmetFarCheekGuard
      ? {
          name: "far-cheek-guard",
          points: makeHelmetCheekGuard(projectStructure, skull, lowerFace, pose, "far"),
          fill: "#c08a3f",
          stroke: "black",
          opacity: 0.84 * farOpacity
        }
      : null,
    params.showHelmetNearCheekGuard
      ? {
          name: "near-cheek-guard",
          points: makeHelmetCheekGuard(projectStructure, skull, lowerFace, pose, "near"),
          fill: "#c89443",
          stroke: "black",
          opacity: 0.92
        }
      : null,
    params.showHelmetNoseGuard
      ? {
          name: "nose-guard",
          points: makeHelmetNoseGuard(projectStructure, skull, pose, reference, profile),
          fill: "#d1a04b",
          stroke: "black",
          opacity: 0.98
        }
      : null
  ].filter(Boolean);

  return {
    back,
    front
  };
}

function interpolatePauldronLandmarks(pauldronLandmarks, amount) {
  if (amount <= 0.5) {
    return blendPauldronLandmarks(pauldronLandmarks.front, pauldronLandmarks.threeQuarter, amount / 0.5);
  }

  return blendPauldronLandmarks(pauldronLandmarks.threeQuarter, pauldronLandmarks.side, (amount - 0.5) / 0.5);
}

function blendPauldronLandmarks(fromPose, toPose, amount) {
  return {
    point2: blendPauldronPoint(fromPose.point2, toPose.point2, amount),
    point3: blendPauldronPoint(fromPose.point3, toPose.point3, amount)
  };
}

function blendPauldronPoint(fromPoint, toPoint, amount) {
  return {
    angle: lerp(fromPoint.angle, toPoint.angle, amount),
    offsetX: lerp(fromPoint.offsetX, toPoint.offsetX, amount),
    offsetY: lerp(fromPoint.offsetY, toPoint.offsetY, amount)
  };
}

function mirrorPauldronReference(reference) {
  return {
    point2: mirrorPauldronPoint(reference.point2),
    point3: mirrorPauldronPoint(reference.point3)
  };
}

// offsetX flips with the angle reflection (mirrors left/right); offsetY
// doesn't, since it's a vertical nudge and mirroring is across a vertical axis.
function mirrorPauldronPoint(point) {
  return { angle: 180 - point.angle, offsetX: -point.offsetX, offsetY: point.offsetY };
}

// shoulders[i].{cx,cy,r} are already fully-projected screen-space values (see
// createStructureProjector - no perspective scaling, scale is always 1), so
// this is a plain 2D circle formula with no pose.sign/yaw term - the yaw
// rotation already happened via orbitPoint to produce cx/cy. offsetX/offsetY
// are additive screen-space px nudges applied after the angle+radius placement.
function shoulderPolarPoint(shoulder, point) {
  const theta = point.angle * Math.PI / 180;

  return {
    x: shoulder.cx + Math.cos(theta) * shoulder.r + point.offsetX,
    y: shoulder.cy + Math.sin(theta) * shoulder.r + point.offsetY
  };
}

// Shoulders sit directly left/right of the skull's central axis at yaw 0. This
// is the "at rest" longitude each orbits from as the head yaws.
const SHOULDER_BASE_ANGLE = Math.PI / 2;

function unionGarmentSource(torsoPolygon, ribCageGuide) {
  const merged = unionPolygonOutlines(torsoPolygon, ribCageGuide);

  if (
    merged?.length
    && merged.every(points => isValidGarmentPolygon(points))
  ) {
    return merged;
  }

  return [
    preparePolygonForUnion(torsoPolygon),
    preparePolygonForUnion(ribCageGuide)
  ].filter(points => isValidGarmentPolygon(points));
}

function polygonBounds(polygons) {
  const points = polygons.flat();

  return {
    minX: Math.min(...points.map(point => point.x)),
    maxX: Math.max(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxY: Math.max(...points.map(point => point.y))
  };
}

function makeTopOpenCutout(boundary, maskTop) {
  if (boundary.length < 2) {
    return null;
  }

  const cutout = [
    { x: boundary[0].x, y: maskTop },
    ...boundary,
    { x: boundary.at(-1).x, y: maskTop }
  ];

  return isValidGarmentPolygon(cutout) ? cutout : null;
}

function resolveGarmentCutouts(cutouts) {
  const valid = cutouts.filter(points => points && isValidGarmentPolygon(points));

  return valid.length ? mergePolygonCycles(valid) : [];
}

function solveClothing(params, garmentSource) {
  if (!params.showClothing || !garmentSource?.polygons.length) {
    return null;
  }

  const collarHeight = clamp(params.clothingCollarHeight ?? 0, 0, garmentSource.neckLength);
  const collarAmount = garmentSource.neckLength > POLYGON_UNION_EPSILON
    ? collarHeight / garmentSource.neckLength
    : 0;
  const collarModelY = lerp(garmentSource.neckBottomY, garmentSource.neckTopY, collarAmount);
  const collarWidth = lerp(
    garmentSource.neckBottomWidth,
    garmentSource.neckTopWidth,
    collarAmount
  );
  const collarHalfWidth = collarWidth / 2;
  const collarTopLeft = garmentSource.projectTorsoPoint(
    -collarHalfWidth,
    collarModelY,
    garmentSource.frontZ
  );
  const collarTopRight = garmentSource.projectTorsoPoint(
    collarHalfWidth,
    collarModelY,
    garmentSource.frontZ
  );
  const clothingTorsoPolygon = [
    collarTopLeft,
    collarTopRight,
    garmentSource.neckBottomRight,
    garmentSource.shoulderTopRight,
    garmentSource.torsoBottomRight,
    garmentSource.torsoBottomLeft,
    garmentSource.shoulderTopLeft,
    garmentSource.neckBottomLeft
  ];
  const sourcePolygons = unionGarmentSource(clothingTorsoPolygon, garmentSource.ribCageGuide);
  const polygons = offsetPolygonCycles(
    sourcePolygons,
    clamp(params.clothingOffset ?? 3, 0, 12),
    "round"
  );
  const bounds = polygonBounds(polygons);
  const openingWidth = clamp(params.clothingCollarOpeningWidth ?? 0.4, 0, 1);
  const requestedDepth = Math.max(0, params.clothingCollarOpeningDepth ?? 0);
  const collarMidpoint = garmentSource.projectTorsoPoint(
    0,
    collarModelY,
    garmentSource.frontZ
  );
  const projectedDepthScale = Math.max(Math.cos(params.pitch), POLYGON_UNION_EPSILON);
  const effectiveDepth = Math.min(
    requestedDepth,
    Math.max(0, (bounds.maxY - collarMidpoint.y - 1) / projectedDepthScale)
  );
  const maskTop = bounds.minY - 100;
  let neckline = [collarTopLeft, collarTopRight];

  if (openingWidth > POLYGON_UNION_EPSILON && effectiveDepth > POLYGON_UNION_EPSILON) {
    const leftAmount = (1 - openingWidth) / 2;
    const rightAmount = 1 - leftAmount;
    const leftLip = garmentSource.projectTorsoPoint(
      lerp(-collarHalfWidth, collarHalfWidth, leftAmount),
      collarModelY,
      garmentSource.frontZ
    );
    const rightLip = garmentSource.projectTorsoPoint(
      lerp(-collarHalfWidth, collarHalfWidth, rightAmount),
      collarModelY,
      garmentSource.frontZ
    );
    const tip = garmentSource.projectTorsoPoint(
      0,
      collarModelY + effectiveDepth,
      garmentSource.frontZ
    );
    neckline = [
      collarTopLeft,
      leftLip,
      tip,
      rightLip,
      collarTopRight
    ];
  }
  const projectedCutout = makeTopOpenCutout(neckline, maskTop);
  const fallbackCollarLeft = {
    x: lerp(garmentSource.neckBottomLeft.x, garmentSource.neckTopLeft.x, collarAmount),
    y: lerp(garmentSource.neckBottomLeft.y, garmentSource.neckTopLeft.y, collarAmount)
  };
  const fallbackCollarRight = {
    x: lerp(garmentSource.neckBottomRight.x, garmentSource.neckTopRight.x, collarAmount),
    y: lerp(garmentSource.neckBottomRight.y, garmentSource.neckTopRight.y, collarAmount)
  };
  const fallbackCutout = makeTopOpenCutout([fallbackCollarLeft, fallbackCollarRight], maskTop);
  const cutouts = resolveGarmentCutouts([
    projectedCutout ?? fallbackCutout
  ]);
  const cutout = cutouts[0] ?? null;

  return {
    shapes: polygons.map((points, index) => ({
      id: `clothing-${index}`,
      points,
      fill: params.clothingColor,
      stroke: "black"
    })),
    cutout,
    cutouts,
    neckline,
    collarTopLeft,
    collarTopRight,
    collarHeight
  };
}

function solveBreastplate(params, garmentSource) {
  if (!params.showBreastplate || !garmentSource?.polygons.length) {
    return null;
  }

  const polygons = offsetPolygonCycles(
    garmentSource.polygons,
    clamp(params.breastplateOffset ?? 8, 0, 24),
    "miter"
  );
  const bounds = polygonBounds(polygons);
  const clearance = clamp(params.breastplateNeckClearance ?? 8, 0, 40);
  const endpointHalfWidth = garmentSource.neckBottomWidth / 2 + clearance;
  const projectedDepthScale = Math.max(Math.cos(params.pitch), POLYGON_UNION_EPSILON);
  const flatBoundary = [];

  for (let sample = 0; sample <= 16; sample += 1) {
    const amount = sample / 16;
    flatBoundary.push(garmentSource.projectTorsoPoint(
      lerp(-endpointHalfWidth, endpointHalfWidth, amount),
      garmentSource.neckBottomY,
      garmentSource.frontZ
    ));
  }

  const deepestFlatY = Math.max(...flatBoundary.map(point => point.y));
  const depth = Math.min(
    Math.max(0, params.breastplateNeckDepth ?? 24),
    Math.max(0, (bounds.maxY - deepestFlatY - 1) / projectedDepthScale)
  );
  const neckline = [];

  for (let sample = 0; sample <= 16; sample += 1) {
    const amount = sample / 16;
    neckline.push(garmentSource.projectTorsoPoint(
      lerp(-endpointHalfWidth, endpointHalfWidth, amount),
      garmentSource.neckBottomY + 4 * amount * (1 - amount) * depth,
      garmentSource.frontZ
    ));
  }

  const maskTop = bounds.minY - 100;
  const persistentBoundary = [
    garmentSource.neckBottomLeft,
    garmentSource.neckBottomRight
  ];
  const persistentCutout = makeTopOpenCutout(persistentBoundary, maskTop);
  const projectedCutout = makeTopOpenCutout(neckline, maskTop);
  const cutouts = resolveGarmentCutouts([persistentCutout, projectedCutout]);
  const cutout = cutouts[0] ?? persistentCutout;

  return {
    shapes: polygons.map((points, index) => ({
      id: `breastplate-${index}`,
      points,
      fill: params.armorColor,
      stroke: "black"
    })),
    cutout,
    cutouts,
    neckline,
    neckClearance: clearance,
    neckDepth: depth
  };
}

function solveBody(params, pose, structure) {
  if (!params.showBody) {
    return {
      torsoOutline: null,
      ribCageShape: null,
      clavicleLines: [],
      clothing: null,
      shoulders: [],
      landmarks: {},
      ribCageGuide: [],
      shoulderTopLeft: null,
      shoulderTopRight: null,
      neckBottomLeft: null,
      neckBottomRight: null,
      garmentSource: null
    };
  }

  const projectStructure = createStructureProjector(params);
  const { skull } = structure;
  const anchorX = skull.cx;
  const skullBottomY = skull.cy + skull.ry;
  const topY = skullBottomY - params.neckOverlap;
  const bottomY = skullBottomY + params.neckLength;

  const neckTopLeft = projectStructure(anchorX - params.neckTopWidth / 2, topY, skull.z);
  const neckTopRight = projectStructure(anchorX + params.neckTopWidth / 2, topY, skull.z);
  const neckBottomRight = projectStructure(anchorX + params.neckBottomWidth / 2, bottomY, skull.z);
  const neckBottomLeft = projectStructure(anchorX - params.neckBottomWidth / 2, bottomY, skull.z);

  // Shoulders orbit the skull's own vertical (Y) axis as the head yaws, the
  // same guideAngle/sin/cos rotation hairV2's scalpPoint uses for locks
  // placed around the head, rather than sliding sideways with the jaw.
  // Center is one radius plus the gap below the neck bottom, so each circle's
  // top edge lands on the neck's bottom edge at gap=0 and can be pushed
  // further down without needing to be re-tuned against the radius.
  const shoulderModelY = bottomY + params.shoulderRadius + params.shoulderGap;
  const orbitRadius = params.torsoWidth / 2;
  const yawRadians = pose.yaw * Math.PI / 2;
  const cosYaw = Math.cos(yawRadians);
  const sinYaw = Math.sin(yawRadians);

  // Projects an X/Z offset in torso model space after rotating it around the
  // torso's vertical axis. Unlike createStructureProjector (pitch only), this
  // makes authored depth move laterally under yaw as a 2.5D point should.
  const projectTorsoPoint = (x, y, z = 0) => projectStructure(
    anchorX + x * cosYaw - z * sinYaw,
    y,
    skull.z + x * sinYaw + z * cosYaw
  );

  const orbitPoint = (baseAngle, y, radius) => {
    return projectTorsoPoint(
      Math.sin(baseAngle) * radius,
      y,
      Math.cos(baseAngle) * radius
    );
  };

  const shoulderLeft = orbitPoint(-SHOULDER_BASE_ANGLE, shoulderModelY, orbitRadius);
  const shoulderRight = orbitPoint(SHOULDER_BASE_ANGLE, shoulderModelY, orbitRadius);
  const shoulders = [
    { cx: shoulderLeft.x, cy: shoulderLeft.y, r: params.shoulderRadius },
    { cx: shoulderRight.x, cy: shoulderRight.y, r: params.shoulderRadius }
  ];

  // Group A landmarks: rigid points on the same torso ring the shoulders
  // orbit, each expressed as an offset from the shoulder's own angle/y/radius
  // so the tuning params read as "relative to the shoulder".
  const clavicleAngle = SHOULDER_BASE_ANGLE - params.clavicleAngleOffset;
  const clavicleY = shoulderModelY - params.shoulderRadius - params.clavicleYDrop;
  const clavicleRadius = orbitRadius + params.clavicleRadiusOffset;
  const clavicleLeft = orbitPoint(-clavicleAngle, clavicleY, clavicleRadius);
  const clavicleRight = orbitPoint(clavicleAngle, clavicleY, clavicleRadius);

  const axillaAngle = SHOULDER_BASE_ANGLE - params.axillaAngleOffset;
  const axillaY = shoulderModelY + params.axillaYDrop;
  const axillaRadius = orbitRadius - params.axillaRadiusInset;
  const axillaLeft = orbitPoint(-axillaAngle, axillaY, axillaRadius);
  const axillaRight = orbitPoint(axillaAngle, axillaY, axillaRadius);

  const costalAngle = SHOULDER_BASE_ANGLE - params.costalAngleOffset;
  const costalY = shoulderModelY + params.costalYDrop;
  const costalRadius = orbitRadius - params.costalRadiusInset;
  const costalLeft = orbitPoint(-costalAngle, costalY, costalRadius);
  const costalRight = orbitPoint(costalAngle, costalY, costalRadius);

  // Group C landmarks: the sternal notch and xiphoid sit on the model's
  // centerline, while the medial clavicle anchors straddle the notch. All use
  // the torso projector so their forward Z shifts laterally under yaw.
  const sternalNotchY = bottomY + params.sternalNotchYDrop;
  const xiphoidY = sternalNotchY + params.xiphoidYDrop;
  const sternalNotch = projectTorsoPoint(0, sternalNotchY, params.sternalNotchZ);
  const xiphoid = projectTorsoPoint(0, xiphoidY, params.xiphoidZ);
  const clavicleMedialHalfWidth = params.clavicleMedialWidth / 2;
  const clavicleMedialLeft = projectTorsoPoint(
    -clavicleMedialHalfWidth,
    sternalNotchY,
    params.sternalNotchZ
  );
  const clavicleMedialRight = projectTorsoPoint(
    clavicleMedialHalfWidth,
    sternalNotchY,
    params.sternalNotchZ
  );
  const clavicleLength = clamp(params.clavicleLength ?? 1, 0, 1);
  const makeClavicleLine = (side, outer, end) => {
    const start = clavicleLength === 1
      ? outer
      : clavicleLength === 0
        ? end
        : {
            x: lerp(end.x, outer.x, clavicleLength),
            y: lerp(end.y, outer.y, clavicleLength)
          };

    return {
      side,
      start,
      end,
      control: {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2 + params.clavicleCurve * clavicleLength
      }
    };
  };
  const clavicleLines = params.showClavicles
    ? [
        makeClavicleLine("left", clavicleLeft, clavicleMedialLeft),
        makeClavicleLine("right", clavicleRight, clavicleMedialRight)
      ]
    : [];

  // Group B landmark: pecs reuse the same front/threeQuarter/side blend
  // machinery the face features use (structure.reference is already blended
  // by pose.amount), since their apparent position isn't a clean rigid
  // rotation - but they're projected relative to the torso ring
  // (anchorX/orbitRadius/shoulderModelY), not the skull, so they track
  // torso size instead of face size.
  const pecsReference = structure.reference.pecs;
  const pecsLeft = projectStructure(
    anchorX + pose.sign * pecsReference.left[0] * orbitRadius,
    shoulderModelY + pecsReference.left[1] * params.torsoLength + params.pecY,
    params.pecZ
  );
  const pecsRight = projectStructure(
    anchorX + pose.sign * pecsReference.right[0] * orbitRadius,
    shoulderModelY + pecsReference.right[1] * params.torsoLength + params.pecY,
    params.pecZ
  );

  const landmarks = {
    clavicleLeft,
    clavicleRight,
    clavicleMedialLeft,
    clavicleMedialRight,
    axillaLeft,
    axillaRight,
    costalLeft,
    costalRight,
    sternalNotch,
    xiphoid,
    pecsLeft,
    pecsRight
  };

  const shoulderTopLeft = { x: shoulders[0].cx, y: shoulders[0].cy - shoulders[0].r };
  const shoulderTopRight = { x: shoulders[1].cx, y: shoulders[1].cy - shoulders[1].r };

  // Isoceles trapezoid hanging from the shoulder tops (screen space, since the
  // shoulder tops are themselves already-projected/orbited points, not a
  // simple model-space pair) - each side extends straight down by
  // torsoLength, narrowing toward the shared centerline by torsoNarrowing
  // (0 = same width as the shoulders, 1 = converges to a point).
  const torsoCenterX = (shoulderTopLeft.x + shoulderTopRight.x) / 2;
  const torsoBottomLeft = {
    x: lerp(shoulderTopLeft.x, torsoCenterX, params.torsoNarrowing),
    y: shoulderTopLeft.y + params.torsoLength
  };
  const torsoBottomRight = {
    x: lerp(shoulderTopRight.x, torsoCenterX, params.torsoNarrowing),
    y: shoulderTopRight.y + params.torsoLength
  };

  // Upper-torso "bean" (the rib-cage mass used as a base shape in figure
  // drawing): a tall ellipse on the torso's own axis. It sits upright in
  // front view but tilts - top pulled back - as the pose turns toward
  // profile, using the same 0-1 turn easing skull/lowerFace blending relies
  // on elsewhere for front-to-profile transitions.
  const turn = smoothstep(0, 1, pose.amount);
  const ribCageTiltRadians = pose.sign * turn * (params.ribCageTilt * Math.PI / 180);
  const ribCage = {
    cx: anchorX,
    cy: shoulderModelY + params.ribCageY,
    rx: params.ribCageWidth / 2,
    ry: params.ribCageHeight / 2,
    z: skull.z
  };
  const torsoPolygon = [
    neckTopLeft,
    neckTopRight,
    neckBottomRight,
    shoulderTopRight,
    torsoBottomRight,
    torsoBottomLeft,
    shoulderTopLeft,
    neckBottomLeft
  ];
  const buildMergedBody = tiltRadians => {
    const guide = sampleEllipse(projectStructure, ribCage, 48, tiltRadians);
    const polygons = unionPolygonOutlines(torsoPolygon, guide);
    const valid = polygons
      && polygons.length > 0
      && polygons.every(points => points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)))
      && polygons.every(points => !polygonSelfIntersects(points));

    return { guide, polygons, valid };
  };

  // ribCageSeparate lets the ellipse union above be A/B tested against the
  // plain pre-union trapezoid: when on, the torso outline reverts to the
  // simple neck+trapezoid (straight edges, no ellipse involvement at all)
  // and the ellipse instead renders as its own solid overlapping shape.
  let outlinePoints;
  let ribCageShape = null;
  let ribCageGuide = sampleEllipse(projectStructure, ribCage, 48, ribCageTiltRadians);

  if (params.ribCageSeparate) {
    outlinePoints = torsoPolygon;
    ribCageShape = {
      points: ribCageGuide,
      fill: params.bodyColor,
      stroke: "black"
    };
  } else {
    let merged = buildMergedBody(ribCageTiltRadians);

    if (!merged.valid && ribCageTiltRadians !== 0) {
      merged = buildMergedBody(0);
    }

    ribCageGuide = merged.guide;

    if (merged.valid) {
      const torsoCycleIndex = merged.polygons.findIndex(polygon => (
        polygon.some(point => pointsNearlyEqual(point, neckTopLeft))
      ));
      const outlineIndex = torsoCycleIndex === -1 ? 0 : torsoCycleIndex;

      outlinePoints = merged.polygons[outlineIndex];
      const extraShape = merged.polygons.find((_, index) => index !== outlineIndex);

      if (extraShape) {
        ribCageShape = {
          points: extraShape,
          fill: params.bodyColor,
          stroke: "black"
        };
      }
    } else {
      // Degenerate or numerically ambiguous inputs should remain renderable.
      // Keep the two source shapes instead of inventing a connector chord.
      outlinePoints = torsoPolygon;
      ribCageShape = {
        points: ribCageGuide,
        fill: params.bodyColor,
        stroke: "black"
      };
    }
  }

  const torsoOutline = {
    points: outlinePoints,
    fill: params.bodyColor,
    stroke: "black"
  };
  const necklessTorsoPolygon = [
    neckBottomLeft,
    neckBottomRight,
    shoulderTopRight,
    torsoBottomRight,
    torsoBottomLeft,
    shoulderTopLeft
  ];
  const garmentSource = {
    polygons: unionGarmentSource(necklessTorsoPolygon, ribCageGuide),
    ribCageGuide,
    projectTorsoPoint,
    frontZ: params.sternalNotchZ,
    neckTopY: topY,
    neckBottomY: bottomY,
    neckTopWidth: params.neckTopWidth,
    neckBottomWidth: params.neckBottomWidth,
    neckTopLeft,
    neckTopRight,
    neckBottomLeft,
    neckBottomRight,
    shoulderTopLeft,
    shoulderTopRight,
    torsoBottomLeft,
    torsoBottomRight,
    neckLength: Math.max(0, params.neckLength)
  };
  const clothing = solveClothing(params, garmentSource);

  return {
    torsoOutline,
    ribCageShape,
    clavicleLines,
    clothing,
    shoulders,
    landmarks,
    ribCageGuide,
    shoulderTopLeft,
    shoulderTopRight,
    neckBottomLeft,
    neckBottomRight,
    garmentSource
  };
}

function solveArmor(params, pose, structure, body) {
  const empty = { pauldronLeft: null, pauldronRight: null, breastplate: null };

  if (!params.showArmor || !body.shoulderTopLeft || !body.shoulderTopRight || body.shoulders.length < 2) {
    return empty;
  }

  const breastplate = solveBreastplate(params, body.garmentSource);

  if (params.showPauldrons === false) {
    return { ...empty, breastplate };
  }

  const pauldronReference = interpolatePauldronLandmarks(defaultPauldronLandmarks, pose.amount);
  const mirroredReference = mirrorPauldronReference(pauldronReference);

  // As yaw swings a shoulder toward the far/back side, the pauldron's own
  // anchor point (point1, on the shoulder-to-neck line) or its inner shoulder
  // point (point2 - authored as the neck-side point) can cross inward past
  // that side's neck-bottom corner - past that point the shoulder has
  // rotated behind the torso, so the pauldron should draw behind it too
  // instead of floating on top. Checking both, not just point1, matters
  // because point2 sits on the shoulder circle at its own authored angle and
  // can cross before or after the shoulder-to-neck lerp point does; point3
  // is the outer/lateral point and by design moves away from the neck, so
  // it's not part of this check. mirror=true (left side) flips which
  // direction counts as "inward" (right side, toward the anchor's left).
  //
  // Only the actual far shoulder for this yaw direction is eligible to flip
  // - at extreme yaw both shoulders' orbit converges back toward center
  // (true profile: near and far shoulder visually coincide), so the x-cross
  // alone would trigger on both sides at once. orbitPoint's guideAngle
  // (baseAngle - yaw * PI/2) puts the right shoulder (+SHOULDER_BASE_ANGLE)
  // nearer as yaw goes positive and the left shoulder nearer as yaw goes
  // negative, matching pose.sign - so gate eligibility on that.
  const buildPauldron = (shoulder, shoulderTop, neckBottom, reference, mirror, isFarSide) => {
    const point1 = {
      x: lerp(shoulderTop.x, neckBottom.x, params.pauldronPosition),
      y: lerp(shoulderTop.y, neckBottom.y, params.pauldronPosition) + params.pauldronYOffset
    };
    const point2 = shoulderPolarPoint(shoulder, reference.point2);
    const point3 = shoulderPolarPoint(shoulder, reference.point3);
    const isInward = point => (mirror ? point.x > neckBottom.x : point.x < neckBottom.x);
    const crossedInward = isInward(point1) || isInward(point2);

    return {
      points: [point1, point2, point3],
      fill: params.armorColor,
      stroke: "black",
      curve: params.pauldronCurve,
      behindTorso: isFarSide && crossedInward
    };
  };

  return {
    pauldronLeft: buildPauldron(body.shoulders[0], body.shoulderTopLeft, body.neckBottomLeft, mirroredReference, true, pose.sign > 0),
    pauldronRight: buildPauldron(body.shoulders[1], body.shoulderTopRight, body.neckBottomRight, pauldronReference, false, pose.sign < 0),
    breastplate
  };
}

// Each ear is a three-point polygon: a straight, unstroked edge attached to the
// side of the face plus an outward apex. Through 3/4 view the roots follow the
// real outline; from there they converge on one authored profile attachment.
// Pitch scales the pitch-zero eye-to-nose height explicitly, instead of letting
// the eyes' and nose's different depths change the ear size accidentally.
const EAR_PROFILE_BLEND_START = 0.5;
const EAR_ATTACH_OVERLAP = 5;
const EAR_NEGATIVE_PITCH_HEIGHT_RATIO = 0.5;
const EAR_POSITIVE_PITCH_HEIGHT_RATIO = 0.8;
const EAR_PITCH_LIMIT = 0.5;

function solveEars(params, pose, structure, features, outline) {
  const skull = structure.skull;
  const lowerFace = structure.lowerFace;
  const eyeCenter = averageProjectedPoints(features.eyes[0].center, features.eyes[1].center);
  const neutralEye = unprojectStructurePoint(eyeCenter, params.pitch);
  const neutralNose = [
    features.nose.bridge,
    features.nose.tip,
    features.nose.leftNostril,
    features.nose.rightNostril
  ]
    .map(point => unprojectStructurePoint(point, params.pitch))
    .reduce((lowest, point) => point.y > lowest.y ? point : lowest);
  const neutralGap = Math.max(20, neutralNose.y - neutralEye.y);
  const neutralCenter = averageProjectedPoints(neutralEye, neutralNose);
  const projectStructure = createStructureProjector(params);
  const projectedCenter = projectStructure(0, neutralCenter.y, neutralCenter.z);
  const edgeH = neutralGap * earPitchHeightRatio(params.pitch);
  const topY = projectedCenter.y - edgeH / 2;
  const bottomY = projectedCenter.y + edgeH / 2;
  const apexY = topY - edgeH * 0.4;
  const frontWidth = 1 - params.earFlatten;
  const profileBlend = smoothstep(EAR_PROFILE_BLEND_START, 1, pose.amount);
  const sideEars = withFeatureLandmarkFallbacks(params.featureLandmarks).side.ears;
  const profileTopX = 250 + pose.sign * sideEars.topX * skull.rx;
  const profileBottomX = 250 + pose.sign * sideEars.bottomX * skull.rx;

  const buildEar = screenSide => {
    // Attach where each Y line crosses the real face outline (falling back to the
    // head ellipse if it somehow misses), so the roots land on the contour and
    // move with it under yaw/pitch.
    const topOutlineX = outlineEdgeX(outline, topY, screenSide)
      ?? fallbackHeadEdgeX(skull, lowerFace, topY, screenSide, params.pitch);
    const bottomOutlineX = outlineEdgeX(outline, bottomY, screenSide)
      ?? fallbackHeadEdgeX(skull, lowerFace, bottomY, screenSide, params.pitch);
    const topX = lerp(topOutlineX, profileTopX, profileBlend);
    const bottomX = lerp(bottomOutlineX, profileBottomX, profileBlend);

    // Near side (opposite the nose = back of head) fills out with the turn; the
    // far side collapses so it never pokes past the head. earFlatten (0..1) =
    // how much flatter the ears are head-on.
    const faces = screenSide * pose.sign;               // +1 near, -1 far
    const width = faces > 0
      ? frontWidth + pose.amount * (1 - frontWidth)
      : frontWidth * (1 - pose.amount);
    const apexOut = params.earStickOut * width;
    const layer = pose.amount > EAR_PROFILE_BLEND_START
      ? (faces > 0 ? "front" : "back")
      : "back";

    return {
      topAttach: { x: topX, y: topY },
      bottomAttach: { x: bottomX, y: bottomY },
      attachControl: {
        x: (topX + bottomX) / 2 - screenSide * EAR_ATTACH_OVERLAP,
        y: (topY + bottomY) / 2
      },
      apex: { x: topX + screenSide * apexOut, y: apexY },
      curve: params.earCurve,
      fill: params.skinColor,
      layer
    };
  };

  return { left: buildEar(-1), right: buildEar(1) };
}

function averageProjectedPoints(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? a.depth) + (b.z ?? b.depth)) / 2
  };
}

// Inverse of createStructureProjector's pitch rotation. This recovers the
// pitch-zero model-space Y/Z values without re-solving the facial features.
function unprojectStructurePoint(point, pitch) {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const screenY = point.y - 250;
  const depth = point.z ?? point.depth;

  return {
    x: point.x - 250,
    y: screenY * cp + depth * sp,
    z: -screenY * sp + depth * cp
  };
}

function earPitchHeightRatio(pitch) {
  const normalized = clamp(pitch / EAR_PITCH_LIMIT, -1, 1);

  return normalized < 0
    ? lerp(1, EAR_NEGATIVE_PITCH_HEIGHT_RATIO, -normalized)
    : lerp(1, EAR_POSITIVE_PITCH_HEIGHT_RATIO, normalized);
}

function fallbackHeadEdgeX(skull, lowerFace, screenY, screenSide, pitch) {
  const cp = Math.cos(pitch);
  const modelY = Math.abs(cp) > 1e-6 ? (screenY - 250) / cp : screenY - 250;

  return 250 + screenSide * headHalfWidthAtY(skull, lowerFace, modelY);
}

// X where the horizontal line at `y` crosses the outline polygon, on the given
// side (+1 = rightmost crossing, -1 = leftmost). Returns null if it misses.
function outlineEdgeX(outline, y, side) {
  let best = null;

  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j];
    const b = outline[i];

    if ((a.y > y) !== (b.y > y)) {
      const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);

      if (best === null || (side > 0 ? x > best : x < best)) {
        best = x;
      }
    }
  }

  return best;
}

// Half-width of the head silhouette at model Y - the wider of the skull ellipse
// and the lower-face ellipse. modelY is screen Y minus the 250 origin. Only used
// as a fallback when a Y line misses the outline.
function headHalfWidthAtY(skull, lowerFace, modelY) {
  return Math.max(ellipseHalfWidthAtY(skull, modelY), ellipseHalfWidthAtY(lowerFace, modelY));
}

function ellipseHalfWidthAtY(ellipse, modelY) {
  const t = (modelY - ellipse.cy) / ellipse.ry;

  if (Math.abs(t) >= 1) {
    return 0;
  }

  return ellipse.rx * Math.sqrt(1 - t * t);
}

function makeHelmetShell(project, skull, pose) {
  return [
    ...sampleHelmetSkullArc(project, skull, pose, 196, 344, 22, 14, -7, -28),
    ...sampleHelmetSkullArc(project, skull, pose, 344, 196, 10, -13, 18, -18)
  ];
}

function makeHelmetFacePlate(project, skull, pose, eyes) {
  const slots = makeHelmetEyeOpenings(project, eyes, pose, skull);

  if (!slots.length) {
    return sampleHelmetSkullArc(project, skull, pose, 0, 360, 54, 16, 0, 46);
  }

  const path = [];
  const boundarySteps = 72;
  const sortedSlots = slots.sort((a, b) => a.entryTheta - b.entryTheta);
  let slotIndex = 0;

  for (let i = 0; i <= boundarySteps; i += 1) {
    const theta = i / boundarySteps * Math.PI * 2;
    let insertedSlot = false;

    while (slotIndex < sortedSlots.length && theta >= sortedSlots[slotIndex].entryTheta) {
      path.push(...sortedSlots[slotIndex].path);
      insertedSlot = true;
      slotIndex += 1;
    }

    if (!insertedSlot && !sortedSlots.some(slot => theta > slot.entryTheta && theta < slot.exitTheta)) {
      path.push(helmetFacePlatePoint(project, skull, theta));
    }
  }

  return path;
}

function makeHelmetEyeOpenings(project, eyes, pose, skull) {
  return eyes
    .filter(eye => eye.visible)
    .map(eye => makeHelmetEyeOpening(project, eye, pose, skull));
}

function makeHelmetEyeOpening(project, eye, pose, skull) {
  const profileNarrowing = lerp(1, 0.62, smoothstep(0.55, 1, pose.amount));
  const width = Math.max(34, eye.rx * 2.35 * profileNarrowing);
  const upperOpen = Math.max(10, eye.upperOpen * 1.15);
  const { x, y } = eye.center;
  const leftX = x - width * 0.34;
  const rightX = x + width * 0.34;
  const entry = helmetFacePlateBoundaryPoint(project, skull, rightX);
  const exit = helmetFacePlateBoundaryPoint(project, skull, leftX);

  return {
    entryTheta: entry.theta,
    exitTheta: exit.theta,
    path: [
      entry.point,
      { x: x + width * 0.5, y },
      { x: x + width * 0.32, y: y - upperOpen },
      { x: x - width * 0.32, y: y - upperOpen },
      { x: x - width * 0.5, y },
      exit.point
    ]
  };
}

function helmetFacePlateBoundaryPoint(project, skull, screenX) {
  const rx = skull.rx + 16;
  const x = clamp(screenX - 250, -rx * 0.96, rx * 0.96);
  const theta = Math.acos(x / rx);

  return {
    theta,
    point: helmetFacePlatePoint(project, skull, theta)
  };
}

function helmetFacePlatePoint(project, skull, theta) {
  const rx = skull.rx + 16;
  const ry = skull.ry + 16;

  return project(
    Math.cos(theta) * rx,
    skull.cy + Math.sin(theta) * ry,
    46
  );
}

function makeHelmetCheekGuard(project, skull, lowerFace, pose, side) {
  const direction = side === "near" ? pose.sign : -pose.sign;
  const sideScale = side === "near" ? 1 : 0.82;
  const top = skullPolarPoint(skull, direction, 28, 6 * sideScale, 18);
  const upper = lowerFacePolarPoint(lowerFace, direction, 342, 8 * sideScale, -2);
  const lower = lowerFacePolarPoint(lowerFace, direction, 45, 2 * sideScale, 8);
  const tip = lowerFacePolarPoint(lowerFace, direction, 72, -7 * sideScale, 16);
  const inner = lowerFacePolarPoint(lowerFace, direction, 21, -22 * sideScale, -8);

  return [top, upper, lower, tip, inner].map(point => project(point.x, point.y, 32));
}

function makeHelmetNoseGuard(project, skull, pose, reference, profile) {
  const bridge = referenceToModelPoint(skull, pose.sign, reference.nose.bridge, -24);
  const tip = referenceToModelPoint(skull, pose.sign, reference.nose.tip, 18);
  const widthTop = lerp(12, 8, profile);
  const widthTip = lerp(7, 4, profile);
  const bridgeX = bridge.x + pose.sign * lerp(0, -5, profile);
  const tipX = tip.x + pose.sign * lerp(0, -10, profile);

  return [
    project(bridgeX - widthTop, bridge.y, 68),
    project(bridgeX + widthTop, bridge.y, 68),
    project(tipX + widthTip, tip.y, 74),
    project(tipX, tip.y + 18, 76),
    project(tipX - widthTip, tip.y, 74)
  ];
}

function sampleHelmetSkullArc(project, skull, pose, startAngle, endAngle, segments, radiusOffset, yOffset, z) {
  const points = [];
  const startTheta = startAngle * Math.PI / 180;
  let endTheta = endAngle * Math.PI / 180;

  if (endTheta < startTheta) {
    endTheta += Math.PI * 2;
  }

  for (let i = 0; i <= segments; i += 1) {
    const theta = lerp(startTheta, endTheta, i / segments);
    const point = skullPolarPoint(skull, pose.sign, theta * 180 / Math.PI, radiusOffset, yOffset);

    points.push(project(point.x, point.y, z));
  }

  return points;
}

function skullPolarPoint(skull, poseSignValue, angle, radiusOffset, yOffset) {
  const theta = angle * Math.PI / 180;

  return {
    x: poseSignValue * Math.cos(theta) * (skull.rx + radiusOffset),
    y: skull.cy + Math.sin(theta) * (skull.ry + radiusOffset) + yOffset
  };
}

function lowerFacePolarPoint(lowerFace, poseSignValue, angle, radiusOffset, yOffset) {
  const theta = angle * Math.PI / 180;

  return {
    x: lowerFace.cx + poseSignValue * Math.cos(theta) * (lowerFace.rx + radiusOffset),
    y: lowerFace.cy + Math.sin(theta) * (lowerFace.ry + radiusOffset) + yOffset
  };
}

function referenceToModelPoint(skull, poseSignValue, referencePoint, yOffset = 0) {
  return {
    x: poseSignValue * referencePoint[0] * skull.rx,
    y: skull.cy + referencePoint[1] * skull.ry + yOffset
  };
}

function interpolateReferencePose(featureLandmarks, amount) {
  if (amount <= 0.5) {
    return blendReferencePose(featureLandmarks.front, featureLandmarks.threeQuarter, amount / 0.5);
  }

  return blendReferencePose(featureLandmarks.threeQuarter, featureLandmarks.side, (amount - 0.5) / 0.5);
}

function interpolateOutlineLandmarks(outlineLandmarks, amount) {
  if (amount <= 0.5) {
    return blendOutlineLandmarks(outlineLandmarks.front, outlineLandmarks.threeQuarter, amount / 0.5);
  }

  return blendOutlineLandmarks(outlineLandmarks.threeQuarter, outlineLandmarks.side, (amount - 0.5) / 0.5);
}

function transformOutlineGapRatios(outlineLandmarks, params) {
  return {
    front: transformOutlinePoseGapRatios(outlineLandmarks.front, params),
    threeQuarter: transformOutlinePoseGapRatios(outlineLandmarks.threeQuarter, params),
    side: transformOutlinePoseGapRatios(outlineLandmarks.side, params)
  };
}

function transformOutlinePoseGapRatios(outlinePose, params) {
  const lower = outlinePose.lower.map(point => ({ ...point }));
  const [startTemple, endTemple] = transformTemplePoints(
    outlinePose.startTemple,
    outlinePose.endTemple,
    params.outlineArcGap
  );
  const endTempleAngle = angleForCirclePointDegrees(endTemple);
  const startTempleAngle = angleForCirclePointDegrees(startTemple);
  const baseLower1 = lower[0].angle;
  const baseLower2 = lower[1].angle;
  const baseLower4 = lower[3].angle;
  const baseLower5 = lower[4].angle;

  lower[0].angle = endTempleAngle + (baseLower1 - endTempleAngle) * params.outlineOuterGap;
  lower[4].angle = startTempleAngle + (baseLower5 - startTempleAngle) * params.outlineOuterGap;
  lower[1].angle = lower[0].angle + (baseLower2 - baseLower1) * params.outlineInnerGap;
  lower[3].angle = lower[4].angle + (baseLower4 - baseLower5) * params.outlineInnerGap;

  return {
    startTemple,
    endTemple,
    lower
  };
}

function transformTemplePoints(startPoint, endPoint, ratio) {
  const startAngle = angleForCirclePoint(startPoint);
  let endAngle = angleForCirclePoint(endPoint);

  if (endAngle <= startAngle) {
    endAngle += Math.PI * 2;
  }

  const midpoint = (startAngle + endAngle) / 2;
  const start = midpoint + (startAngle - midpoint) * ratio;
  const end = midpoint + (endAngle - midpoint) * ratio;

  return [
    [Math.cos(start), Math.sin(start)],
    [Math.cos(end), Math.sin(end)]
  ];
}

function angleForCirclePointDegrees(point) {
  return angleForCirclePoint(point) * 180 / Math.PI;
}

function blendReferencePose(fromPose, toPose, amount) {
  return {
    lowerFace: blendObject(fromPose.lowerFace, toPose.lowerFace, amount),
    eyes: fromPose.eyes.map((eye, index) => blendObject(eye, toPose.eyes[index], amount)),
    nose: {
      bridge: blendPair(fromPose.nose.bridge, toPose.nose.bridge, amount),
      tip: blendPair(fromPose.nose.tip, toPose.nose.tip, amount),
      base: blendPair(fromPose.nose.base, toPose.nose.base, amount)
    },
    mouth: {
      left: blendPair(fromPose.mouth.left, toPose.mouth.left, amount),
      mid: blendPair(fromPose.mouth.mid, toPose.mouth.mid, amount),
      right: blendPair(fromPose.mouth.right, toPose.mouth.right, amount)
    },
    moustache: {
      left: blendPair(fromPose.moustache.left, toPose.moustache.left, amount),
      right: blendPair(fromPose.moustache.right, toPose.moustache.right, amount)
    },
    soulPatch: {
      root: blendPair(fromPose.soulPatch.root, toPose.soulPatch.root, amount)
    },
    pecs: {
      left: blendPair(fromPose.pecs.left, toPose.pecs.left, amount),
      right: blendPair(fromPose.pecs.right, toPose.pecs.right, amount)
    }
  };
}

function blendOutlineLandmarks(fromOutline, toOutline, amount) {
  return {
    startTemple: blendPair(fromOutline.startTemple, toOutline.startTemple, amount),
    endTemple: blendPair(fromOutline.endTemple, toOutline.endTemple, amount),
    lower: fromOutline.lower.map((point, index) => ({
      angle: lerp(point.angle, toOutline.lower[index].angle, amount),
      offsetX: lerp(point.offsetX, toOutline.lower[index].offsetX, amount),
      offsetY: lerp(point.offsetY, toOutline.lower[index].offsetY, amount)
    }))
  };
}

function blendObject(fromObject, toObject, amount) {
  const blended = {};

  for (const key in fromObject) {
    blended[key] = lerp(fromObject[key], toObject[key], amount);
  }

  return blended;
}

function blendPair(fromPair, toPair, amount) {
  return [
    lerp(fromPair[0], toPair[0], amount),
    lerp(fromPair[1], toPair[1], amount)
  ];
}

function makeReferenceEye(project, skull, poseSignValue, referenceEye, scale, params, yOffset, visible, anatomicalSide) {
  const center = projectReferencePoint(project, skull, poseSignValue, [referenceEye.cx, referenceEye.cy], 35, yOffset);
  const s = center.scale;

  // Half-extents in local eye space (+x outward toward temple, +y down).
  const w = referenceEye.rx * skull.rx * scale;
  const baseRy = referenceEye.ry * skull.ry * scale;
  const upper = baseRy * params.eyeUpperOpen;
  const lower = baseRy * params.eyeLowerOpen;
  const trap = params.eyeTrapezoid;
  const outerOut = params.eyeOuterCornerOut * w;
  const outerUp = params.eyeOuterCornerUp * (upper + lower);

  const topHalf = w * (1 + trap);
  const bottomHalf = w * (1 - trap);

  // Corner points, local frame.
  const localCorners = {
    topInner: { x: -w, y: -upper },
    topOuter: { x: topHalf + outerOut, y: -upper - outerUp },
    bottomOuter: { x: bottomHalf, y: lower },
    bottomInner: { x: -w, y: lower }
  };
  const topControl = {
    x: (localCorners.topInner.x + localCorners.topOuter.x) / 2,
    y: (localCorners.topInner.y + localCorners.topOuter.y) / 2 - params.eyeTopCurve * (upper + lower) * 0.9
  };
  const bottomControl = {
    x: (localCorners.bottomInner.x + localCorners.bottomOuter.x) / 2,
    y: (localCorners.bottomInner.y + localCorners.bottomOuter.y) / 2 + params.eyeBottomCurve * (upper + lower) * 0.9
  };

  // Outward direction is tied to anatomical eye identity in face space, then
  // mirrored with the pose. This keeps screen-left/right eyes stable as yaw
  // crosses zero without letting a profile eye flip just because it crosses
  // screen center.
  const outwardSign = anatomicalSide * poseSignValue;
  const rotation = params.eyeRotation * outwardSign;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const place = local => {
    const lx = local.x * outwardSign;
    const rx = lx * cos - local.y * sin;
    const ry = lx * sin + local.y * cos;

    return { x: center.x + rx * s, y: center.y + ry * s };
  };

  const quad = {
    topInner: place(localCorners.topInner),
    topOuter: place(localCorners.topOuter),
    bottomOuter: place(localCorners.bottomOuter),
    bottomInner: place(localCorners.bottomInner),
    topControl: place(topControl),
    bottomControl: place(bottomControl)
  };

  const irisRadius = params.eyeIrisSize * scale * s;
  const iris = { cx: center.x, cy: center.y, r: irisRadius };
  const pupil = { cx: center.x, cy: center.y, r: Math.min(params.eyePupilSize * scale * s, irisRadius * 0.95) };
  const shineRadius = irisRadius * params.eyeShineSize;
  const shine = params.eyeShine && shineRadius > 0.5
    ? {
        cx: center.x + irisRadius * 0.4,
        cy: center.y - irisRadius * 0.4,
        r: shineRadius
      }
    : null;

  // Per-edge lid stroke widths (0 = no line on that edge).
  const lidWidths = {
    upper: params.eyeUpperLidWidth,
    outer: params.eyeOuterCornerWidth,
    lower: params.eyeLowerLidWidth,
    inner: params.eyeInnerCornerWidth
  };

  // Eyelashes as individual segments sampled along each lid curve. Upper lashes
  // run topInner -> topOuter (outer corner at t=1); lower run bottomOuter ->
  // bottomInner (outer corner at t=0).
  const lashes = {
    upper: params.showUpperLashes
      ? makeLashSegments(localCorners.topInner, topControl, localCorners.topOuter, params.eyeLashCount, params.eyeLashLength, place, false, true)
      : [],
    lower: params.showLowerLashes
      ? makeLashSegments(localCorners.bottomOuter, bottomControl, localCorners.bottomInner, params.eyeLashCount, params.eyeLashLength, place, true, false)
      : []
  };

  // Corner triangle behind the eye: base at inner-top and outer-bottom, tip past
  // the outer-top corner, with each edge to the tip curved.
  const cornerMakeup = params.showEyeCorner
    ? (() => {
        const baseTopLeft = localCorners.topInner;
        const baseBottomRight = localCorners.bottomOuter;
        const tipLocal = {
          x: localCorners.topOuter.x + params.eyeCornerExtend,
          y: localCorners.topOuter.y - params.eyeCornerExtend
        };

        return {
          baseTopLeft: place(baseTopLeft),
          ctrlTop: place(curvedEdgeControl(baseTopLeft, tipLocal, params.eyeCornerTopCurve)),
          tip: place(tipLocal),
          ctrlBottom: place(curvedEdgeControl(tipLocal, baseBottomRight, params.eyeCornerBottomCurve)),
          baseBottomRight: place(baseBottomRight)
        };
      })()
    : null;

  return {
    side: anatomicalSide,
    center,
    quad,
    iris,
    pupil,
    shine,
    lidWidths,
    lashes,
    cornerMakeup,
    irisColor: isHexColor(params.eyeIrisColor) ? params.eyeIrisColor : "#5b4433",
    irisGradient: Boolean(params.eyeIrisGradient),
    // Compatibility fields for the helmet faceplate eye openings.
    rx: Math.max(topHalf, bottomHalf, w) * s,
    upperOpen: (upper + outerUp) * s,
    visible
  };
}

// Evaluate a quadratic bezier and its tangent in local eye space.
function quadPoint(p0, c, p1, t) {
  const mt = 1 - t;

  return {
    x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y
  };
}

function quadTangent(p0, c, p1, t) {
  const mt = 1 - t;

  return {
    x: 2 * mt * (c.x - p0.x) + 2 * t * (p1.x - c.x),
    y: 2 * mt * (c.y - p0.y) + 2 * t * (p1.y - c.y)
  };
}

// Control point for a curved corner edge: midpoint pushed perpendicular by a
// signed fraction of the edge length.
function curvedEdgeControl(a, b, curveAmount) {
  const edge = { x: b.x - a.x, y: b.y - a.y };
  const length = Math.hypot(edge.x, edge.y) || 1;
  const normal = { x: -edge.y / length, y: edge.x / length };

  return {
    x: (a.x + b.x) / 2 + normal.x * curveAmount * length * 0.5,
    y: (a.y + b.y) / 2 + normal.y * curveAmount * length * 0.5
  };
}

// Lash segments along a lid curve (local frame), placed to screen space. Lashes
// point away from the eye interior (up for the upper lid, down for the lower)
// and grow longer + flare outward toward the outer corner.
function makeLashSegments(p0, c, p1, count, length, place, outerAtStart, up) {
  const n = Math.round(count);

  if (n <= 0 || length <= 0) {
    return [];
  }

  const segments = [];

  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const point = quadPoint(p0, c, p1, t);
    const tangent = quadTangent(p0, c, p1, t);
    const tlen = Math.hypot(tangent.x, tangent.y) || 1;
    let normal = { x: -tangent.y / tlen, y: tangent.x / tlen };

    if (up ? normal.y > 0 : normal.y < 0) {
      normal = { x: -normal.x, y: -normal.y };
    }

    const outerness = outerAtStart ? 1 - t : t;
    const direction = normalizePoint({ x: normal.x + 0.6 * outerness, y: normal.y });
    const lashLength = length * lerp(0.45, 1, outerness);
    const end = { x: point.x + direction.x * lashLength, y: point.y + direction.y * lashLength };

    segments.push({ start: place(point), end: place(end) });
  }

  return segments;
}

function makeMouth(project, skull, poseSignValue, referenceMouth, mouthScale, params, yOffset) {
  // Project each anchor independently, like before this quad existed: left/right
  // use their own yaw-blended reference positions (so the corners keep the
  // natural asymmetric warp as the head turns) and a shallower z, while mid uses
  // a deeper z for its slight 3D bulge under pitch. Mouth Height and the lip
  // curves are then layered on as vertical screen-space offsets from these
  // already-warped anchors, so the new shape controls don't undo the old warp.
  const leftBase = projectMouthPoint(project, skull, poseSignValue, referenceMouth.left, referenceMouth.mid, mouthScale, 45, yOffset);
  const rightBase = projectMouthPoint(project, skull, poseSignValue, referenceMouth.right, referenceMouth.mid, mouthScale, 45, yOffset);
  const midBase = projectReferencePoint(project, skull, poseSignValue, referenceMouth.mid, 60, yOffset);
  const s = midBase.scale;

  const halfWidth = Math.abs(rightBase.x - leftBase.x) / 2;
  // reference.mouth.mid is its own authored point, not exactly the midpoint of
  // left/right, and left/right now warp independently and asymmetrically under
  // yaw. Use the true corner-line center for x (so controls/teeth stay centered
  // between the actual corners at every yaw) but keep midBase.y, with its own
  // z=60 depth, for the vertical bulge under pitch.
  const centerX = (leftBase.x + rightBase.x) / 2;
  // Four distinct corners (like the eye quad) so Mouth Height is a real, visible
  // gap between the top and bottom edges, not something the lip curve fights
  // against. Each curve then bows its own edge relative to that edge's own
  // corners, so it is free to swing fully convex or concave in either direction.
  const heightHalf = (params.mouthHeight * s) / 2;
  const upperBow = params.upperLipCurve * halfWidth * 0.8;
  const lowerBow = params.lowerLipCurve * halfWidth * 0.8;

  const quad = {
    topLeft: { x: leftBase.x, y: leftBase.y - heightHalf },
    topRight: { x: rightBase.x, y: rightBase.y - heightHalf },
    bottomRight: { x: rightBase.x, y: rightBase.y + heightHalf },
    bottomLeft: { x: leftBase.x, y: leftBase.y + heightHalf },
    topControl: { x: centerX, y: midBase.y - heightHalf - upperBow },
    bottomControl: { x: centerX, y: midBase.y + heightHalf + lowerBow }
  };

  const cavityTop = Math.min(quad.topLeft.y, quad.topRight.y, quad.topControl.y);
  const cavityBottom = Math.max(quad.bottomLeft.y, quad.bottomRight.y, quad.bottomControl.y);
  const cavityHeight = cavityBottom - cavityTop;
  const gapPx = clamp(params.teethGap * cavityHeight * 0.6, 0, cavityHeight);
  const blockHeight = Math.max(0, (cavityHeight - gapPx) / 2);
  const pad = Math.max(1, cavityHeight * 0.05);
  const teethX = halfWidth * 0.82;

  const upperTeeth = {
    corners: makeTeethRect(centerX - teethX, centerX + teethX, cavityTop + pad, cavityTop + pad + blockHeight),
    visible: Boolean(params.showUpperTeeth) && blockHeight > 0.5
  };
  const lowerTeeth = {
    corners: makeTeethRect(centerX - teethX, centerX + teethX, cavityBottom - pad - blockHeight, cavityBottom - pad),
    visible: Boolean(params.showLowerTeeth) && blockHeight > 0.5
  };

  return {
    quad,
    upperTeeth,
    lowerTeeth,
    cavityColor: isHexColor(params.mouthCavityColor) ? params.mouthCavityColor : "#4a1f1f",
    // Compatibility: the profile-outline extension reads mouth.mid as a single point.
    mid: midBase
  };
}

function makeTeethRect(xLeft, xRight, yTop, yBottom) {
  return [
    { x: xLeft, y: yTop },
    { x: xRight, y: yTop },
    { x: xRight, y: yBottom },
    { x: xLeft, y: yBottom }
  ];
}

function makeNostrils(project, skull, pose, referenceBase, yOffset, widthScale = 1) {
  const nostrilGap = lerp(0.18, 0.035, pose.amount) * widthScale;
  const hiddenBase = [
    referenceBase[0] - nostrilGap,
    referenceBase[1]
  ];

  return {
    visible: projectReferencePoint(project, skull, pose.sign, referenceBase, 58, yOffset),
    hidden: projectReferencePoint(project, skull, pose.sign, hiddenBase, 58, yOffset)
  };
}

function projectReferencePoint(project, skull, poseSignValue, referencePoint, z = 0, yOffset = 0) {
  return project(
    poseSignValue * referencePoint[0] * skull.rx,
    skull.cy + referencePoint[1] * skull.ry + yOffset,
    z
  );
}

function projectMouthPoint(project, skull, poseSignValue, referencePoint, referenceMidpoint, scale, z, yOffset) {
  const scaledPoint = [
    referenceMidpoint[0] + (referencePoint[0] - referenceMidpoint[0]) * scale,
    referencePoint[1]
  ];

  return projectReferencePoint(project, skull, poseSignValue, scaledPoint, z, yOffset);
}

function makeEye(project, side, x, y, size, widthScale, visible) {
  return {
    side,
    center: project(x, y, 35),
    rx: size * widthScale,
    ry: size / 2,
    pupilRadius: size / 4,
    visible
  };
}

function makeBrow(project, x, y, params, visible, anatomicalSide, poseSignValue, eye, fillColor) {
  const defaultHalfWidth = 20;
  const halfWidth = params.eyebrowLength / 2;
  const baseHalfHeight = Math.max(0.5, params.eyebrowHeight / 2);
  const sharpen = clamp(params.eyebrowSharpen, -1, 1);
  const halfInnerHeight = Math.max(0, baseHalfHeight * (sharpen < 0 ? 1 + sharpen : 1));
  const halfOuterHeight = Math.max(0, baseHalfHeight * (sharpen > 0 ? 1 - sharpen : 1));
  const tilt = params.eyebrowTilt;
  const curveOffset = params.eyebrowCurve * defaultHalfWidth * 0.65;
  const outwardSign = anatomicalSide * poseSignValue;
  const browY = y + params.eyebrowY;
  const centerlineY = localX => -tilt * defaultHalfWidth * (localX / halfWidth);
  const innerX = -halfWidth;
  const outerX = halfWidth;
  const localPoints = {
    topInner: { x: innerX, y: centerlineY(innerX) - halfInnerHeight },
    topOuter: { x: outerX, y: centerlineY(outerX) - halfOuterHeight },
    bottomOuter: { x: outerX, y: centerlineY(outerX) + halfOuterHeight },
    bottomInner: { x: innerX, y: centerlineY(innerX) + halfInnerHeight }
  };
  const topMidY = (localPoints.topInner.y + localPoints.topOuter.y) / 2;
  const bottomMidY = (localPoints.bottomInner.y + localPoints.bottomOuter.y) / 2;

  localPoints.topControl = { x: 0, y: topMidY - curveOffset };
  localPoints.bottomControl = { x: 0, y: bottomMidY - curveOffset };

  const place = local => project(
    x + local.x * outwardSign,
    browY + local.y,
    35
  );
  const brow = {
    side: anatomicalSide,
    topInner: place(localPoints.topInner),
    topOuter: place(localPoints.topOuter),
    bottomOuter: place(localPoints.bottomOuter),
    bottomInner: place(localPoints.bottomInner),
    topControl: place(localPoints.topControl),
    bottomControl: place(localPoints.bottomControl),
    fillColor,
    strokeVisible: Boolean(params.showEyebrowStroke),
    visible
  };
  const eyeTopY = Math.min(eye.quad.topInner.y, eye.quad.topOuter.y, eye.quad.topControl.y) + 10;
  const browBottomY = Math.max(brow.bottomInner.y, brow.bottomOuter.y, brow.bottomControl.y);

  if (browBottomY > eyeTopY) {
    shiftBrowY(brow, eyeTopY - browBottomY);
  }

  return brow;
}

function makeEyeShading(eye, brow, skinColor, enabled, bagEnabled) {
  const scaleFromEyeCenter = point => ({
    x: eye.center.x + (point.x - eye.center.x) * EYE_SHADING_SCALE,
    y: eye.center.y + (point.y - eye.center.y) * EYE_SHADING_SCALE
  });
  const eyeShape = Object.fromEntries(
    Object.entries(eye.quad).map(([key, point]) => [key, scaleFromEyeCenter(point)])
  );
  const innerDistance = pointDistance(eyeShape.topInner, brow.bottomInner);
  const outerDistance = pointDistance(eyeShape.topOuter, brow.bottomOuter);
  const shortestDistance = Math.min(innerDistance, outerDistance);
  const minimumFraction = shortestDistance <= Number.EPSILON
    ? 1
    : EYE_SHADING_MIN_RISE / shortestDistance;
  const interpolation = clamp(Math.max(0.5, minimumFraction), 0.5, 1);
  const bridgeShape = {
    bottomInner: eyeShape.topInner,
    bottomControl: eyeShape.topControl,
    bottomOuter: eyeShape.topOuter,
    topOuter: interpolatePoint(eyeShape.topOuter, brow.bottomOuter, interpolation),
    topControl: interpolatePoint(eyeShape.topControl, brow.bottomControl, interpolation),
    topInner: interpolatePoint(eyeShape.topInner, brow.bottomInner, interpolation)
  };
  const bagShape = makeBaggyEyeShadingShape(eye, eyeShape);
  const baseColor = isHexColor(skinColor) ? skinColor : DEFAULT_SKIN_COLOR;

  return {
    visible: enabled && eye.visible && brow.visible,
    bagVisible: bagEnabled && eye.visible,
    fillColor: darkenHex(baseColor, EYE_SHADING_DARKEN_FACTOR),
    interpolation,
    eyeShape,
    bridgeShape,
    bagShape
  };
}

function makeBaggyEyeShadingShape(eye, eyeShape) {
  const innerMid = midpoint(eye.quad.topInner, eye.quad.bottomInner);
  const outerMid = midpoint(eye.quad.topOuter, eye.quad.bottomOuter);
  const upperMid = midpoint(eye.quad.topInner, eye.quad.topOuter);
  const lowerMid = midpoint(eye.quad.bottomInner, eye.quad.bottomOuter);
  const outward = normalizePoint(subtractPoints(outerMid, innerMid));
  const rawDown = subtractPoints(lowerMid, upperMid);
  const downRemainder = subtractPoints(rawDown, scalePoint(outward, dotPoints(rawDown, outward)));
  let down = Math.hypot(downRemainder.x, downRemainder.y) > Number.EPSILON
    ? normalizePoint(downRemainder)
    : { x: -outward.y, y: outward.x };

  if (dotPoints(down, rawDown) < 0) {
    down = scalePoint(down, -1);
  }

  const innerAnchor = eyeShape.bottomInner;
  const innerOuter = quadPoint(
    eyeShape.bottomInner,
    eyeShape.bottomControl,
    eyeShape.bottomOuter,
    EYE_BAG_INNER_SAMPLE
  );
  const outwardSpan = Math.max(
    pointProjection(eye.quad.topOuter, innerAnchor, outward),
    pointProjection(eye.quad.bottomOuter, innerAnchor, outward),
    Number.EPSILON
  );
  const outerAnchor = pointInFrame(
    innerAnchor,
    outward,
    down,
    outwardSpan,
    EYE_BAG_OUTER_DOWN * outwardSpan
  );
  const innerPairDistance = pointDistance(innerAnchor, innerOuter);
  const sampleOuterPairDistance = Math.hypot(
    EYE_BAG_OUTER_PAIR_INWARD,
    EYE_BAG_OUTER_PAIR_DOWN
  ) * outwardSpan;
  const outerPairDistance = Math.max(
    sampleOuterPairDistance,
    innerPairDistance * EYE_BAG_OUTER_PAIR_SCALE
  );
  const outerPairDirection = normalizePoint(addPoints(
    scalePoint(outward, -EYE_BAG_OUTER_PAIR_INWARD),
    scalePoint(down, EYE_BAG_OUTER_PAIR_DOWN)
  ));
  const lowerOuter = addPoints(outerAnchor, scalePoint(outerPairDirection, outerPairDistance));

  return {
    innerAnchor,
    firstControl: pointInFrame(
      innerAnchor,
      outward,
      down,
      EYE_BAG_FIRST_CONTROL_OUT * outwardSpan,
      EYE_BAG_FIRST_CONTROL_DOWN * outwardSpan
    ),
    lowerOuter,
    outerAnchor,
    secondControl: pointInFrame(
      innerAnchor,
      outward,
      down,
      EYE_BAG_SECOND_CONTROL_OUT * outwardSpan,
      EYE_BAG_SECOND_CONTROL_DOWN * outwardSpan
    ),
    innerOuter
  };
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function dotPoints(a, b) {
  return a.x * b.x + a.y * b.y;
}

function pointProjection(point, origin, axis) {
  return dotPoints(subtractPoints(point, origin), axis);
}

function pointInFrame(origin, outward, down, outwardDistance, downDistance) {
  return addPoints(
    origin,
    addPoints(
      scalePoint(outward, outwardDistance),
      scalePoint(down, downDistance)
    )
  );
}

function interpolatePoint(from, to, amount) {
  return {
    x: lerp(from.x, to.x, amount),
    y: lerp(from.y, to.y, amount)
  };
}

function pointDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function shiftBrowY(brow, amount) {
  for (const key of ["topInner", "topOuter", "bottomOuter", "bottomInner", "topControl", "bottomControl"]) {
    brow[key] = {
      ...brow[key],
      y: brow[key].y + amount
    };
  }
}

function solveVisibility(amount) {
  return {
    farFeatureOpacity: 1 - smoothstep(0.55, 0.95, amount),
    profileFeatureOpacity: smoothstep(0.55, 1, amount)
  };
}

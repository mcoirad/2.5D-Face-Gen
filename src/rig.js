import {
  clamp,
  lerp,
  poseSign,
  smoothstep
} from "./geometry.js";
import { solveHairV2 } from "./hairV2.js";

const FACE_CENTER_Y = 10;
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
const REFERENCE_POSES = {
  front: {
    lowerFace: { cx: 0.0269, cy: 0.8788, rx: 0.8411, ry: 0.555 },
    eyes: [
      { cx: -0.5407, cy: 0.5635, rx: 0.1845, ry: 0.1822 },
      { cx: 0.5945, cy: 0.5525, rx: 0.1845, ry: 0.1822 }
    ],
    nose: {
      bridge: [-0.000, 1.0271],
      tip: [-0.0008, 1.0551],
      base: [0.1063, 1.0239]
    },
    mouth: {
      left: [-0.1679, 1.1889],
      mid: [-0.0197, 1.2605],
      right: [0.1505, 1.1889]
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
    }
  },
  side: {
    lowerFace: { cx: -0.4523, cy: 0.976, rx: 0.6469, ry: 0.5582 },
    eyes: [
      { cx: -0.5053, cy: 0.5575, rx: 0.1845, ry: 0.1822 },
      { cx: -0.5053, cy: 0.5575, rx: 0.1845, ry: 0.1822 }
    ],
    nose: {
      bridge: [-1.0627+ 0.05, 0.6257],
      tip: [-1.2257 + 0.05, 0.8647],
      base: [-1.1313+ 0.05, 1.04]
    },
    mouth: {
      left: [-1.0353+ 0.05 , 1.1194],
      mid: [-1.0849+ 0.1, 1.275],
      right: [-0.8422+ 0.05, 1.1723]
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
      { angle: 85, offsetX: 0, offsetY: -0.06 },
      { angle: 138, offsetX: 0, offsetY: -0.06 },
      { angle: 180, offsetX: 0, offsetY: -0.06 },
      { angle: 215, offsetX: 0, offsetY: 0 }
    ]
  }
};

const HAIR_MIRROR_GUIDES = [4, 3, 2, 1, 0, 7, 6, 5];
const HAIR_MIRROR_SOURCE_GUIDES = [0, 1, 2, 5, 6];
const OUTLINE_UPPER_ARC_POINT_COUNT = 19;
// Profile outline tuning: when the first protruding feature would pull the
// preceding lower-face point into a strong inward notch, drop that lower point
// and retry. This keeps nose landmarks available while removing bad connectors.
const PROFILE_LOWER_CONCAVITY_LIMIT = 60 * Math.PI / 180;

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

  return {
    showGuides: params.showGuides,
    removeStrokes: params.removeStrokes,
    showHelmet: params.showHelmet,
    pose: {
      ...pose,
      turn,
      profile
    },
    head,
    hair: solveHair(params, pose, head.structure),
    hairV2: params.showHairV2 ? solveHairV2(params, pose, head.structure) : null,
    body: solveBody(params, pose, head.structure),
    helmet: solveHelmet(params, pose, head.structure, features),
    features,
    visibility: solveVisibility(pose.amount)
  };
}

function solveHead(params, pose) {
  const projectStructure = createStructureProjector(params);
  const reference = interpolateReferencePose(pose.amount);
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

function sampleEllipse(project, ellipse, segments) {
  return sampleEllipseArc(project, ellipse, 0, Math.PI * 2, segments);
}

function sampleEllipseArc(project, ellipse, startTheta, endTheta, segments) {
  const points = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const theta = lerp(startTheta, endTheta, t);

    points.push(project(
      ellipse.cx + ellipse.rx * Math.cos(theta),
      ellipse.cy + ellipse.ry * Math.sin(theta),
      ellipse.z
    ));
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
  const mouthProtrudes = !ignoreMouthProtrusion && !pointInPolygon(mouth, outline);
  const outlineForExtension = outline;
  const candidates = [
    ...(mouthProtrudes ? [mouth] : []),
    outlinePoint(features.nose.leftNostril),
    outlinePoint(features.nose.tip),
    outlinePoint(features.nose.bridge)
  ];
  const protruding = candidates.filter(point => !pointInPolygon(point, outlineForExtension));

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

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = (yi > point.y) !== (yj > point.y)
      && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function solveFeatures(params, pose, structure) {
  const projectStructure = createStructureProjector(params);
  const reference = structure.reference;
  const eyeScale = params.eyeSize / DEFAULTS.eyeSize;
  const eyeYOffset = params.eyeY - DEFAULTS.eyeY;
  const referenceEyes = spaceReferenceEyes(reference.eyes, params.eyeSpacing / DEFAULTS.eyeSpacing);
  const noseYOffset = (params.noseLength - DEFAULTS.noseLength) * 0.45;
  const mouthScale = params.mouthWidth / DEFAULTS.mouthWidth;

  const eyes = [
    makeReferenceEye(projectStructure, structure.skull, pose.sign, referenceEyes[0], eyeScale, params, eyeYOffset, true, -1),
    makeReferenceEye(projectStructure, structure.skull, pose.sign, referenceEyes[1], eyeScale, params, eyeYOffset, true, 1)
  ];

  // Width scales the nose about its own bridge on X (grows in place, not shifting
  // across the face at yaw). noseY translates the whole nose vertically (bridge
  // included), while noseLength only drops the tip/nostrils for protrusion.
  const noseBridgeX = reference.nose.bridge[0];
  const noseRef = point => [
    noseBridgeX + (point[0] - noseBridgeX) * params.noseWidth,
    point[1]
  ];
  const noseBase = noseRef(reference.nose.base);
  const nostrils = makeNostrils(projectStructure, structure.skull, pose, noseBase, noseYOffset + params.noseY, params.noseWidth);
  const nose = {
    bridge: projectReferencePoint(projectStructure, structure.skull, pose.sign, noseRef(reference.nose.bridge), 55, eyeYOffset * 0.55 + params.noseY),
    tip: projectReferencePoint(projectStructure, structure.skull, pose.sign, noseRef(reference.nose.tip), 75, noseYOffset + params.noseY),
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
  const browTiltDirections = browX[0] <= browX[1] ? [-1, 1] : [1, -1];
  const brows = [
    makeBrow(projectStructure, pose.sign, browX[0], browY, params.eyeTilt, 1, featureVisibility[0], browTiltDirections[0]),
    makeBrow(projectStructure, -pose.sign, browX[1], browY, params.eyeTilt, 1, featureVisibility[1], browTiltDirections[1])
  ];

  // Anchor the mouth vertically between the bottom of the nose and the chin,
  // then let mouthPosition slide it between those two points (0 = nose, 1 = chin).
  const skull = structure.skull;
  const noseBottomY = skull.cy + noseBase[1] * skull.ry + noseYOffset + params.noseY;
  const chinY = structure.lowerFaceBottomY;
  const targetMouthMidY = lerp(noseBottomY, chinY, params.mouthPosition);
  const mouthYShift = targetMouthMidY - (skull.cy + reference.mouth.mid[1] * skull.ry);
  const mouth = makeMouth(projectStructure, skull, pose.sign, reference.mouth, mouthScale, params, mouthYShift);

  return {
    eyes,
    brows,
    nose,
    mouth
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

function spaceReferenceEyes(referenceEyes, spacingScale) {
  const midpoint = (referenceEyes[0].cx + referenceEyes[1].cx) / 2;

  return referenceEyes.map(eye => ({
    ...eye,
    cx: midpoint + (eye.cx - midpoint) * spacingScale
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

// Shoulders sit directly left/right of the skull's central axis at yaw 0. This
// is the "at rest" longitude each orbits from as the head yaws.
const SHOULDER_BASE_ANGLE = Math.PI / 2;

function solveBody(params, pose, structure) {
  if (!params.showBody) {
    return { neck: null, torso: null, shoulders: [], connectors: [] };
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

  const neck = {
    points: [neckTopLeft, neckTopRight, neckBottomRight, neckBottomLeft],
    fill: params.bodyColor,
    stroke: "black"
  };

  // Shoulders orbit the skull's own vertical (Y) axis as the head yaws, the
  // same guideAngle/sin/cos rotation hairV2's scalpPoint uses for locks
  // placed around the head, rather than sliding sideways with the jaw.
  // Center is one radius plus the gap below the neck bottom, so each circle's
  // top edge lands on the neck's bottom edge at gap=0 and can be pushed
  // further down without needing to be re-tuned against the radius.
  const shoulderModelY = bottomY + params.shoulderRadius + params.shoulderGap;
  const orbitRadius = params.torsoWidth / 2;

  const orbitPoint = baseAngle => {
    const guideAngle = baseAngle - pose.yaw * Math.PI / 2;
    const x = anchorX + Math.sin(guideAngle) * orbitRadius;
    const z = skull.z + Math.cos(guideAngle) * orbitRadius;

    return projectStructure(x, shoulderModelY, z);
  };

  const shoulderLeft = orbitPoint(-SHOULDER_BASE_ANGLE);
  const shoulderRight = orbitPoint(SHOULDER_BASE_ANGLE);
  const shoulders = [
    { cx: shoulderLeft.x, cy: shoulderLeft.y, r: params.shoulderRadius },
    { cx: shoulderRight.x, cy: shoulderRight.y, r: params.shoulderRadius }
  ];

  const shoulderTopLeft = { x: shoulders[0].cx, y: shoulders[0].cy - shoulders[0].r };
  const shoulderTopRight = { x: shoulders[1].cx, y: shoulders[1].cy - shoulders[1].r };

  const connectors = [
    [neckBottomLeft, shoulderTopLeft],
    [neckBottomRight, shoulderTopRight]
  ];

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

  const torso = {
    points: [shoulderTopLeft, shoulderTopRight, torsoBottomRight, torsoBottomLeft],
    fill: params.bodyColor,
    stroke: "black"
  };

  return { neck, torso, shoulders, connectors };
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

function interpolateReferencePose(amount) {
  if (amount <= 0.5) {
    return blendReferencePose(REFERENCE_POSES.front, REFERENCE_POSES.threeQuarter, amount / 0.5);
  }

  return blendReferencePose(REFERENCE_POSES.threeQuarter, REFERENCE_POSES.side, (amount - 0.5) / 0.5);
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

function makeBrow(project, side, x, y, tilt, widthScale, visible, tiltDirection) {
  const halfWidth = 20 * widthScale;

  return {
    side,
    start: project(x - halfWidth, y + tilt * 20 * tiltDirection, 35),
    end: project(x + halfWidth, y - tilt * 20 * tiltDirection, 35),
    visible
  };
}

function solveVisibility(amount) {
  return {
    farFeatureOpacity: 1 - smoothstep(0.55, 0.95, amount),
    profileFeatureOpacity: smoothstep(0.55, 1, amount)
  };
}

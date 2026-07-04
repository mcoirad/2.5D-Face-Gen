import {
  clamp,
  lerp,
  poseSign,
  smoothstep
} from "./geometry.js";

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
      left: [-0.4424, 1.1501],
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
      bridge: [-1.0627, 0.6257],
      tip: [-1.2257, 0.8647],
      base: [-1.1313, 1.04]
    },
    mouth: {
      left: [-1.1353, 1.1194],
      mid: [-1.0849, 1.275],
      right: [-0.8422, 1.1723]
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

const NOSE_OUTLINE_WEIGHTS = [0, 0, 0, 1, 0.35];

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

  return {
    showGuides: params.showGuides,
    showHelmet: params.showHelmet,
    pose: {
      ...pose,
      turn,
      profile
    },
    head,
    hair: solveHair(params, pose, head.structure),
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

function createStructureProjector(params) {
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
  const noseWeight = NOSE_OUTLINE_WEIGHTS[index] * pose.amount;
  const noseLengthOffset = (params.noseLength - DEFAULTS.noseLength) / skull.rx;
  const mirroredAngle = pose.sign < 0 ? 180 - landmark.angle : landmark.angle;
  const theta = mirroredAngle * Math.PI / 180;

  return {
    x: lowerFace.cx
      + Math.cos(theta) * lowerFace.rx
      + pose.sign * landmark.offsetX * skull.rx
      - pose.sign * noseLengthOffset * noseWeight * 0.55 * skull.rx,
    y: lowerFace.cy + Math.sin(theta) * lowerFace.ry + landmark.offsetY * skull.ry
  };
}

function solveFeatures(params, pose, structure) {
  const projectStructure = createStructureProjector(params);
  const reference = structure.reference;
  const eyeScale = params.eyeSize / DEFAULTS.eyeSize;
  const eyeYOffset = params.eyeY - DEFAULTS.eyeY;
  const eyeShape = {
    upperOpen: params.eyeUpperOpen / DEFAULTS.eyeUpperOpen,
    lowerOpen: params.eyeLowerOpen / DEFAULTS.eyeLowerOpen
  };
  const referenceEyes = spaceReferenceEyes(reference.eyes, params.eyeSpacing / DEFAULTS.eyeSpacing);
  const noseYOffset = (params.noseLength - DEFAULTS.noseLength) * 0.45;
  const mouthScale = params.mouthWidth / DEFAULTS.mouthWidth;

  const eyes = [
    makeReferenceEye(projectStructure, structure.skull, pose.sign, referenceEyes[0], eyeScale, eyeShape, eyeYOffset, true),
    makeReferenceEye(projectStructure, structure.skull, pose.sign, referenceEyes[1], eyeScale, eyeShape, eyeYOffset, true)
  ];

  const nostrils = makeNostrils(projectStructure, structure.skull, pose, reference.nose.base, noseYOffset);
  const nose = {
    bridge: projectReferencePoint(projectStructure, structure.skull, pose.sign, reference.nose.bridge, 55, eyeYOffset * 0.55),
    tip: projectReferencePoint(projectStructure, structure.skull, pose.sign, reference.nose.tip, 75, noseYOffset),
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

  const mouth = {
    left: projectMouthPoint(projectStructure, structure.skull, pose.sign, reference.mouth.left, reference.mouth.mid, mouthScale, 45, params.smile * 0.15),
    right: projectMouthPoint(projectStructure, structure.skull, pose.sign, reference.mouth.right, reference.mouth.mid, mouthScale, 45, params.smile * 0.15),
    mid: projectMouthPoint(projectStructure, structure.skull, pose.sign, reference.mouth.mid, reference.mouth.mid, mouthScale, 60, params.smile)
  };

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
  return [-1, -0.5, 0, 0.5, 1].map(sideOffset => {
    const sideWeight = Math.abs(sideOffset);
    const baldnessScale = lerp(1, 0.55 + 0.45 * sideWeight, params.hairMalePatternBaldnessBias);
    const shapeScale = hairlineShapeScale(params.hairlineShape, sideWeight);
    const bangsShift = params.hairBangsBias * (sideWeight - 0.5) * 0.8;
    const hairlineAmount = clamp(params.hairline * params.hairPartDepth * baldnessScale * shapeScale + bangsShift, 0.05, 1.2);

    return makeHairGuide(params, pose, structure, sideOffset, hairlineAmount);
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

function makeHairGuide(params, pose, structure, sideOffset, hairlineAmount) {
  const projectStructure = createStructureProjector(params);
  const { skull } = structure;
  const partShift = params.hairPartPosition * Math.PI * 0.35;
  const guideAngle = sideOffset * Math.PI / 2 + partShift - pose.yaw * Math.PI / 2;
  const sidePosition = Math.sin(guideAngle);
  const depthPosition = Math.cos(guideAngle);
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

  return points;
}

function makeScalpAnchors(guides, params) {
  return guides.flatMap((guide, guideIndex) => {
    const guideSideWeight = Math.abs(guideIndex - ((guides.length - 1) / 2)) / ((guides.length - 1) / 2);

    return Array.from({ length: 9 }, (_, pointIndex) => {
      const guidePosition = pointIndex / 8;
      const sample = samplePolyline(guide, guidePosition);
      const crownCoverage = lerp(params.hairCrownCoverage, 1, guidePosition);
      const sideCoverage = lerp(1, params.hairSideCoverage, guideSideWeight);
      const coverage = clamp(crownCoverage * sideCoverage, 0, 1);

      return {
        point: sample.point,
        tangent: sample.tangent,
        sideWeight: guideSideWeight,
        guideIndex,
        pointIndex,
        guidePosition,
        depth: sample.depth,
        layer: sample.depth < -65 && guideSideWeight > 0.9 ? "back" : "front",
        coverage
      };
    });
  });
}

function makeHairStrands(anchors, params, pose) {
  const count = Math.round(params.hairStrandCount);
  const eligibleAnchors = filterCoveredAnchors(anchors, 12);

  if (count <= 0 || !eligibleAnchors.length) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const anchor = eligibleAnchors[index % eligibleAnchors.length];

    return makeHairStrand(
      anchor,
      params,
      pose,
      index + anchor.guideIndex * 101 + anchor.pointIndex * 17
    );
  });
}

function filterCoveredAnchors(anchors, salt) {
  return anchors.filter(anchor => seededRandom(anchor.guideIndex * 41 + anchor.pointIndex * 13, salt) <= anchor.coverage);
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

function makeHairStrand(anchor, params, pose, randomIndex) {
  const hairColor = resolveHairColor(params);
  const t = anchor.guidePosition;
  const randomSide = seededRandom(randomIndex, 1) < 0.5 ? -1 : 1;
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
  const curve = params.hairStrandCurve * length * lerp(-0.55, 0.85, seededRandom(randomIndex, 4));
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
    fill: hairColor.fill,
    stroke: hairColor.stroke,
    opacity: 0.92
  };
}

function makeHairLocks(anchors, params, pose) {
  const count = Math.round(params.hairLockCount);
  const eligibleAnchors = filterCoveredAnchors(anchors, 29)
    .filter(anchor => anchor.guidePosition > 0.08);

  if (count <= 0 || !eligibleAnchors.length) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const anchor = eligibleAnchors[Math.floor(index * eligibleAnchors.length / count) % eligibleAnchors.length];

    return makeHairLock(
      anchor,
      params,
      pose,
      index + anchor.guideIndex * 131 + anchor.pointIndex * 19
    );
  });
}

function makeHairLock(anchor, params, pose, randomIndex) {
  const hairColor = resolveHairColor(params);
  const randomSide = seededRandom(randomIndex, 1) < 0.5 ? -1 : 1;
  const guideSide = Math.sign(anchor.point.x - 250);
  const outwardSide = guideSide === 0 ? randomSide : -guideSide;
  const side = seededRandom(randomIndex, 2) < smoothstep(0.35, 1, pose.amount)
    ? outwardSide
    : randomSide;
  const asymmetry = (seededRandom(randomIndex, 6) - 0.5) * params.hairLockAsymmetry;
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
  const curve = params.hairLockCurve * length * lerp(-0.4, 0.8, seededRandom(randomIndex, 5));
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
    fill: hairColor.fill,
    stroke: hairColor.stroke,
    opacity: 0.94
  };
}

function makeHairCurveControls({
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

function resolveHairCurveType(type, randomIndex) {
  if (type === "c" || type === "s") {
    return type;
  }

  return seededRandom(randomIndex, 10) < 0.45 ? "s" : "c";
}

function makeHairLockDetailLines(rootLeft, rootRight, tip, curveOffset, count, stroke) {
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

function resolveHairColor(params) {
  const fill = isHexColor(params.hairColor) ? params.hairColor : "#2a241e";

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

function normalizePoint(point) {
  const length = Math.hypot(point.x, point.y) || 1;

  return {
    x: point.x / length,
    y: point.y / length
  };
}

function offsetPoint(point, direction, distance) {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance
  };
}

function addPoints(first, second) {
  return {
    x: first.x + second.x,
    y: first.y + second.y
  };
}

function scalePoint(point, amount) {
  return {
    x: point.x * amount,
    y: point.y * amount
  };
}

function seededRandom(index, salt) {
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

function makeReferenceEye(project, skull, poseSignValue, referenceEye, scale, eyeShape, yOffset, visible) {
  const rx = referenceEye.rx * skull.rx * scale;
  const baseRy = referenceEye.ry * skull.ry * scale;
  const upperOpen = baseRy * eyeShape.upperOpen;
  const lowerOpen = baseRy * eyeShape.lowerOpen;
  const irisRadius = Math.min(rx * 0.34, (upperOpen + lowerOpen) * 0.42);

  return {
    side: poseSignValue,
    center: projectReferencePoint(project, skull, poseSignValue, [referenceEye.cx, referenceEye.cy], 35, yOffset),
    rx,
    upperOpen,
    lowerOpen,
    irisRadius,
    pupilRadius: irisRadius * 0.42,
    visible
  };
}

function makeNostrils(project, skull, pose, referenceBase, yOffset) {
  const nostrilGap = lerp(0.18, 0.035, pose.amount);
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

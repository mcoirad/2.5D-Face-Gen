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
  eyeSize: 18,
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
      bridge: [-0.0891, 1.0271],
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
      bridge: [-1.0627, 0.5257],
      tip: [-1.2257, 0.8647],
      base: [-1.1313, 1.1104]
    },
    mouth: {
      left: [-1.1353, 1.1194],
      mid: [-1.0849, 1.275],
      right: [-0.8422, 1.1723]
    }
  }
};

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

  return {
    showGuides: params.showGuides,
    pose: {
      ...pose,
      turn,
      profile
    },
    head,
    features: solveFeatures(params, pose, head.structure),
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

  const joinY = clamp(
    lowerFace.cy - lowerFace.ry * 0.9,
    skull.cy - skull.ry * 0.15,
    skull.cy + skull.ry * 0.72
  );
  const joinRatio = clamp((joinY - skull.cy) / skull.ry, -0.95, 0.95);
  const skullRightTheta = Math.asin(joinRatio);
  const skullLeftTheta = -Math.PI - skullRightTheta;
  const lowerJoinRatio = clamp((joinY - lowerFace.cy) / lowerFace.ry, -0.95, 0.95);
  const lowerRightTheta = Math.asin(lowerJoinRatio);
  const lowerLeftTheta = Math.PI - lowerRightTheta;

  const skullGuide = sampleEllipse(projectStructure, skull, 48);
  const lowerFaceGuide = sampleEllipse(projectStructure, lowerFace, 48);
  const upperOutline = sampleEllipseArc(projectStructure, skull, skullLeftTheta, skullRightTheta, 24);
  const lowerOutline = sampleEllipseArc(projectStructure, lowerFace, lowerRightTheta, lowerLeftTheta, 24);

  const outline = [
    ...upperOutline,
    ...lowerOutline
  ];

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

function solveFeatures(params, pose, structure) {
  const projectStructure = createStructureProjector(params);
  const reference = structure.reference;
  const eyeScale = params.eyeSize / DEFAULTS.eyeSize;
  const eyeYOffset = params.eyeY - DEFAULTS.eyeY;
  const noseYOffset = (params.noseLength - DEFAULTS.noseLength) * 0.45;
  const mouthScale = params.mouthWidth / DEFAULTS.mouthWidth;
  const showFarFeature = pose.amount < 0.92;

  const eyes = [
    makeReferenceEye(projectStructure, structure.skull, pose.sign, reference.eyes[0], eyeScale, eyeYOffset, true),
    makeReferenceEye(projectStructure, structure.skull, pose.sign, reference.eyes[1], eyeScale, eyeYOffset, showFarFeature)
  ];

  const browY = reference.eyes[0].cy * structure.skull.ry + structure.skull.cy - 30 + eyeYOffset;
  const brows = [
    makeBrow(projectStructure, pose.sign, pose.sign * reference.eyes[0].cx * structure.skull.rx, browY, params.eyeTilt, 1, true),
    makeBrow(projectStructure, -pose.sign, pose.sign * reference.eyes[1].cx * structure.skull.rx, browY, params.eyeTilt, 1, showFarFeature)
  ];

  const nostrils = makeNostrils(projectStructure, structure.skull, pose, reference.nose.base, noseYOffset);
  const nose = {
    bridge: projectReferencePoint(projectStructure, structure.skull, pose.sign, reference.nose.bridge, 55, eyeYOffset * 0.55),
    tip: projectReferencePoint(projectStructure, structure.skull, pose.sign, reference.nose.tip, 75, noseYOffset),
    leftNostril: nostrils.visible,
    rightNostril: nostrils.hidden
  };

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

function interpolateReferencePose(amount) {
  if (amount <= 0.5) {
    return blendReferencePose(REFERENCE_POSES.front, REFERENCE_POSES.threeQuarter, amount / 0.5);
  }

  return blendReferencePose(REFERENCE_POSES.threeQuarter, REFERENCE_POSES.side, (amount - 0.5) / 0.5);
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

function makeReferenceEye(project, skull, poseSignValue, referenceEye, scale, yOffset, visible) {
  return {
    side: poseSignValue,
    center: projectReferencePoint(project, skull, poseSignValue, [referenceEye.cx, referenceEye.cy], 35, yOffset),
    rx: referenceEye.rx * skull.rx * scale,
    ry: referenceEye.ry * skull.ry * scale,
    pupilRadius: Math.min(referenceEye.rx * skull.rx, referenceEye.ry * skull.ry) * scale / 4,
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

function makeBrow(project, side, x, y, tilt, widthScale, visible) {
  return {
    side,
    start: project(x - side * 20 * widthScale, y - tilt * 20 * side, 35),
    end: project(x + side * 20 * widthScale, y + tilt * 20 * side, 35),
    visible
  };
}

function solveVisibility(amount) {
  return {
    farFeatureOpacity: 1 - smoothstep(0.55, 0.95, amount),
    profileFeatureOpacity: smoothstep(0.55, 1, amount)
  };
}

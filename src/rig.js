import {
  clamp,
  createProjector,
  lerp,
  poseSign,
  smoothstep
} from "./geometry.js";

const FACE_CENTER_Y = 10;

export function solveFaceRig(params) {
  const yaw = clamp(params.yaw, -1, 1);
  const pose = {
    yaw,
    amount: Math.abs(yaw),
    sign: poseSign(yaw)
  };
  const turn = smoothstep(0, 1, pose.amount);
  const profile = smoothstep(0.58, 1, pose.amount);
  const project = createProjector(params, pose);

  const head = solveHead(params, pose, turn, profile);

  return {
    showGuides: params.showGuides,
    pose: {
      ...pose,
      turn,
      profile
    },
    head,
    features: solveFeatures(params, pose, turn, profile, project, head.structure),
    visibility: solveVisibility(pose.amount)
  };
}

function solveHead(params, pose, turn, profile) {
  const projectStructure = createStructureProjector();
  const skull = {
    cx: 0,
    cy: FACE_CENTER_Y,
    rx: params.faceWidth / 2,
    ry: params.faceHeight / 2,
    z: 0
  };
  const lowerFace = {
    cx: -pose.sign * params.lowerFaceSideShift * turn,
    cy: FACE_CENTER_Y + params.lowerFaceY,
    rx: lerp(params.lowerFaceWidth / 2, params.lowerFaceHeight / 2, profile),
    ry: params.lowerFaceHeight / 2,
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
      lowerFaceBottomY: lowerFace.cy + lowerFace.ry,
      featureCenterX: lowerFace.cx * 0.32
    }
  };
}

function createStructureProjector() {
  return function projectStructure(x, y, z = 0) {
    return {
      x: 250 + x,
      y: 250 + y,
      scale: 1,
      depth: z
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

function solveFeatures(params, pose, turn, profile, project, structure) {
  const nearSide = pose.sign;
  const farSide = -pose.sign;
  const eyeSize = params.eyeSize;
  const featureCenterX = structure.featureCenterX;
  const featureSpan = structure.lowerFaceBottomY - params.eyeY;
  const noseLengthOffset = (params.noseLength - 48) * 0.45;
  const nearEyeX = featureCenterX + nearSide * lerp(params.eyeSpacing, 42, turn);
  const farEyeX = featureCenterX + farSide * lerp(params.eyeSpacing, 18, turn);
  const browY = params.eyeY - 30;
  const noseX = featureCenterX + pose.sign * lerp(0, 30, turn);
  const mouthX = featureCenterX + pose.sign * lerp(0, 18, turn);
  const noseBridgeY = params.eyeY + featureSpan * 0.3;
  const noseBaseY = params.eyeY + featureSpan * 0.58 + noseLengthOffset;
  const mouthY = params.eyeY + featureSpan * 0.82;
  const showFarFeature = pose.amount < 0.92;

  const eyes = [
    makeEye(project, nearSide, nearEyeX, params.eyeY, eyeSize, lerp(1, 0.8, profile), true),
    makeEye(project, farSide, farEyeX, params.eyeY + turn * 3, eyeSize, lerp(1, 0.42, turn), showFarFeature)
  ];

  const brows = [
    makeBrow(project, nearSide, nearEyeX, browY, params.eyeTilt, lerp(1, 0.82, profile), true),
    makeBrow(project, farSide, farEyeX, browY + turn * 3, params.eyeTilt, lerp(1, 0.45, turn), showFarFeature)
  ];

  const nose = {
    bridge: project(noseX, noseBridgeY, 55),
    tip: project(noseX + pose.sign * lerp(0, 12, turn), noseBaseY, 75),
    leftNostril: project(noseX - 14, noseBaseY + 10, 58),
    rightNostril: project(noseX + 14, noseBaseY + 10, 58)
  };

  const mouth = {
    left: project(mouthX - params.mouthWidth / 2, mouthY, 45),
    right: project(mouthX + params.mouthWidth / 2, mouthY, 45),
    mid: project(mouthX, mouthY + params.smile, 60)
  };

  return {
    eyes,
    brows,
    nose,
    mouth
  };
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

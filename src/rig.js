import {
  clamp,
  createHeadProjector,
  createProjector,
  lerp,
  poseSign,
  smoothstep
} from "./geometry.js";

const FACE_CENTER_Y = 10;
const BASE_EYE_Y = -35;

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
  const projectHead = createHeadProjector(params, pose);

  const featureYOffset = params.eyeY - BASE_EYE_Y;
  const featureOffsets = {
    eye: featureYOffset,
    brow: featureYOffset,
    nose: featureYOffset * 0.55,
    mouth: featureYOffset * 0.25
  };

  return {
    pose: {
      ...pose,
      turn,
      profile
    },
    head: solveHead(params, pose, profile, projectHead),
    features: solveFeatures(params, pose, turn, profile, project, featureOffsets),
    visibility: solveVisibility(pose.amount)
  };
}

function solveHead(params, pose, profile, projectHead) {
  const halfWidth = params.faceWidth / 2;
  const halfHeight = params.faceHeight / 2;
  const halfChin = params.chinWidth / 2;
  const jawWidth = Math.max(halfChin + 18, halfWidth * 0.45);
  const divideRatio = clamp(params.sphereDivide / halfHeight, -0.65, 0.65);
  const divideY = FACE_CENTER_Y + halfHeight * divideRatio;
  const lowerSpan = FACE_CENTER_Y + halfHeight - divideY;
  const rightTheta = Math.asin(divideRatio);
  const leftTheta = -Math.PI - rightTheta;
  const domeSegments = 22;
  const dome = [];
  const backExtension = halfWidth * 1.15 * profile;
  const backDepth = halfWidth * 0.95 * profile;

  function outlinePoint(x, y, z = 0) {
    if (x * pose.sign <= 0) {
      return projectHead(x, y, z);
    }

    const backWeight = lerp(0.62, 1, clamp(Math.abs(x) / halfWidth, 0, 1));
    return projectHead(
      x + pose.sign * backExtension * backWeight,
      y,
      z - backDepth * backWeight
    );
  }

  for (let i = 0; i <= domeSegments; i += 1) {
    const t = i / domeSegments;
    const theta = leftTheta + (rightTheta - leftTheta) * t;
    const z = -5 * Math.max(0, -Math.sin(theta));

    dome.push(outlinePoint(
      pose.sign * halfWidth * Math.cos(theta),
      FACE_CENTER_Y + halfHeight * Math.sin(theta),
      z
    ));
  }

  const faceSide = dome[dome.length - 1];
  const backSide = dome[0];
  const faceJaw = outlinePoint(pose.sign * lerp(jawWidth, jawWidth * 0.88, profile), divideY + lowerSpan * 0.72, 24);
  const backJaw = outlinePoint(-pose.sign * lerp(jawWidth, jawWidth * 0.72, profile), divideY + lowerSpan * 0.72, 24);
  const faceChin = outlinePoint(pose.sign * lerp(halfChin, halfChin + 10, profile), FACE_CENTER_Y + halfHeight, 34);
  const backChin = outlinePoint(-pose.sign * lerp(halfChin, halfChin * 0.45, profile), FACE_CENTER_Y + halfHeight, 34);

  const lower = {
    variant: "continuous",
    faceCheekControl: outlinePoint(pose.sign * lerp(halfWidth * 0.96, halfWidth * 0.82, profile), divideY + lowerSpan * 0.22, 12),
    faceJawControl: outlinePoint(pose.sign * lerp(jawWidth + 10, jawWidth * 0.92, profile), divideY + lowerSpan * 0.58, 22),
    faceJaw,
    faceChin,
    backChin,
    backJaw,
    backJawControl: outlinePoint(-pose.sign * lerp(jawWidth + 10, jawWidth * 0.78, profile), divideY + lowerSpan * 0.58, 22),
    backCheekControl: outlinePoint(-pose.sign * lerp(halfWidth * 0.96, halfWidth * 0.72, profile), divideY + lowerSpan * 0.22, 12)
  };

  return {
    dome,
    backSide,
    faceSide,
    lower
  };
}

function solveFeatures(params, pose, turn, profile, project, featureOffsets) {
  const nearSide = pose.sign;
  const farSide = -pose.sign;
  const eyeSize = params.eyeSize;
  const nearEyeX = nearSide * lerp(params.eyeSpacing, 42, turn);
  const farEyeX = farSide * lerp(params.eyeSpacing, 18, turn);
  const noseBridgeY = -10 + featureOffsets.nose;
  const noseBaseY = params.noseLength + featureOffsets.nose;
  const mouthY = 85 + featureOffsets.mouth;
  const showFarFeature = pose.amount < 0.92;

  const eyes = [
    makeEye(project, nearSide, nearEyeX, params.eyeY, eyeSize, lerp(1, 0.8, profile), true),
    makeEye(project, farSide, farEyeX, params.eyeY + turn * 3, eyeSize, lerp(1, 0.42, turn), showFarFeature)
  ];

  const brows = [
    makeBrow(project, nearSide, nearEyeX, -65 + featureOffsets.brow, params.eyeTilt, lerp(1, 0.82, profile), true),
    makeBrow(project, farSide, farEyeX, -65 + featureOffsets.brow + turn * 3, params.eyeTilt, lerp(1, 0.45, turn), showFarFeature)
  ];

  const nose = {
    bridge: project(0, noseBridgeY, 55),
    tip: project(0, noseBaseY, 75),
    leftNostril: project(-14, noseBaseY + 10, 58),
    rightNostril: project(14, noseBaseY + 10, 58)
  };

  const mouth = {
    left: project(-params.mouthWidth / 2, mouthY, 45),
    right: project(params.mouthWidth / 2, mouthY, 45),
    mid: project(0, mouthY + params.smile, 60)
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

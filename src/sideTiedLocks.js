import { clamp, lerp } from "./geometry.js";
import { createHairV2Scalp, makeHairV2Lock, resolveHairV2Layer } from "./hairV2.js";
import {
  normalizePoint,
  resolveHairColor,
  resolveHairShineColor,
  subtractPoints
} from "./rig.js";
import { makeHairTie } from "./tiedHair.js";

const ROOT_V = 0.88;
const SIDE_SEEDS = { left: 51000, right: 52000 };

export function solveSideTiedLocks(params, pose, structure) {
  if (!params.showHairV2SideTiedLocks) {
    return null;
  }

  const scalp = createHairV2Scalp(params, pose, structure);
  const requestedSide = params.hairV2SideTiedLocksSide;
  const sides = requestedSide === "left"
    ? ["left"]
    : requestedSide === "right"
      ? ["right"]
      : ["left", "right"];
  const color = resolveHairColor(params, "hairV2Color");
  const shineColor = resolveHairShineColor(params, "hairV2Color");
  const tieColor = resolveHairColor(params, "hairV2SideTiedLocksTieColor");

  return {
    sections: sides.map(side => makeSideSection({
      side,
      scalp,
      params,
      structure,
      color,
      shineColor,
      tieColor
    })),
    sharedOutline: Boolean(params.hairV2SharedOutline)
  };
}

function makeSideSection({ side, scalp, params, structure, color, shineColor, tieColor }) {
  const sign = side === "left" ? -1 : 1;
  const count = clamp(Math.round(params.hairV2SideTiedLocksCount), 1, 6);
  const length = params.hairV2SideTiedLocksLength;
  const width = params.hairV2SideTiedLocksWidth;
  const tieFraction = clamp(params.hairV2SideTiedLocksTiePosition, 0.55, 0.95);
  const upperLength = length * tieFraction;
  const lowerLength = length - upperLength;
  const rootCenterU = sign * lerp(0.32, 0.98, clamp(params.hairV2SideTiedLocksRootPosition, 0, 1));
  const uSpread = clamp(width / Math.max(structure.skull.rx * 2.7, 1), 0.08, 0.38);
  const rootSpecs = Array.from({ length: count }, (_, index) => {
    const across = count === 1 ? 0 : index / (count - 1) - 0.5;
    const u = rootCenterU + sign * across * uSpread;
    const v = clamp(ROOT_V + across * 0.04, 0.76, 0.98);
    return { index, across, point: scalp(u, v) };
  });
  const centerRoot = averagePoints(rootSpecs.map(spec => spec.point));
  const tiePoint = {
    x: centerRoot.x + sign * width * 0.08,
    y: centerRoot.y + upperLength,
    depthPosition: centerRoot.depthPosition,
    sidePosition: centerRoot.sidePosition
  };
  const layer = resolveHairV2Layer(centerRoot.depthPosition);
  const upperParams = { ...params, hairV2CurlAngle: params.hairV2CurlAngle * 0.25 };
  const lowerParams = { ...params, hairV2CurlAngle: params.hairV2CurlAngle * 0.7 };
  const individualWidth = Math.min(
    params.hairV2LockWidth * 0.72,
    width / Math.max(1.4, count * 0.72)
  );
  const seedBase = SIDE_SEEDS[side];
  const upperResults = rootSpecs.map(spec => makeHairV2Lock({
    index: seedBase + spec.index,
    base: spec.point,
    direction: normalizePoint(subtractPoints(tiePoint, spec.point)),
    params: upperParams,
    lengthOverride: Math.hypot(tiePoint.x - spec.point.x, tiePoint.y - spec.point.y),
    widthOverride: individualWidth,
    tipOverride: tiePoint,
    color,
    shineColor,
    curveMirror: sign,
    sidePosition: spec.point.sidePosition,
    depthPosition: spec.point.depthPosition,
    layer
  }));
  const lowerResults = rootSpecs.map(spec => {
    const rootOffset = spec.across * width * 0.16;
    const outward = sign * lowerLength * (0.06 + 0.08 * Math.abs(spec.across));
    const lowerRoot = {
      ...tiePoint,
      x: tiePoint.x + rootOffset
    };
    const tip = {
      x: lowerRoot.x + outward + spec.across * width * 0.14,
      y: tiePoint.y + lowerLength
    };
    return makeHairV2Lock({
      index: seedBase + 100 + spec.index,
      base: lowerRoot,
      direction: normalizePoint(subtractPoints(tip, lowerRoot)),
      params: lowerParams,
      lengthOverride: Math.hypot(tip.x - lowerRoot.x, tip.y - lowerRoot.y),
      widthOverride: individualWidth * 0.68,
      tipOverride: tip,
      color,
      shineColor,
      curveMirror: sign * (spec.index % 2 === 0 ? 1 : -1),
      sidePosition: centerRoot.sidePosition,
      depthPosition: centerRoot.depthPosition,
      layer
    });
  });

  return {
    side,
    layer,
    upperLocks: upperResults.map(result => result.lock),
    upperShines: upperResults.flatMap(result => result.shine ? [result.shine] : []),
    lowerLocks: lowerResults.map(result => result.lock),
    lowerShines: lowerResults.flatMap(result => result.shine ? [result.shine] : []),
    tie: makeHairTie(tiePoint, { x: 0, y: 1 }, width, tieColor, layer),
    tiePoint
  };
}

function averagePoints(points) {
  const total = points.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
    depthPosition: sum.depthPosition + point.depthPosition,
    sidePosition: sum.sidePosition + point.sidePosition
  }), { x: 0, y: 0, depthPosition: 0, sidePosition: 0 });
  const scale = 1 / points.length;
  return {
    x: total.x * scale,
    y: total.y * scale,
    depthPosition: total.depthPosition * scale,
    sidePosition: total.sidePosition * scale
  };
}

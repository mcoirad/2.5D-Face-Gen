import { clamp, lerp } from "./geometry.js";
import { createHairV2Scalp, resolveHairV2Layer } from "./hairV2.js";
import { resolveHairColor, resolveHairShineColor } from "./rig.js";
import { solveTailInstance } from "./tiedHair.js";

const REAR_U = 2;
const DETAIL_SEEDS = [41000, 42000];

export function solveDoublePonytail(params, pose, structure) {
  if (!params.showHairV2DoublePonytail) {
    return null;
  }

  const scalp = createHairV2Scalp(params, pose, structure);
  const layout = params.hairV2DoublePonytailLayout === "vertical" ? "vertical" : "horizontal";
  const centerV = lerp(0.92, 0.25, clamp(params.hairV2DoublePonytailHeight, 0, 1));
  const separation = clamp(params.hairV2DoublePonytailSeparation, 0, 1);
  const anchors = layout === "vertical"
    ? makeVerticalAnchors(scalp, centerV, separation)
    : makeHorizontalAnchors(scalp, centerV, separation);
  const color = resolveHairColor(params, "hairV2Color");
  const shineColor = resolveHairShineColor(params, "hairV2Color");
  const tieColor = resolveHairColor(params, "hairV2DoublePonytailTieColor");
  const viewSide = Math.sin(pose.yaw * Math.PI / 2);
  const authoredVisibility = Math.cos(pose.yaw * Math.PI / 2);
  const splay = clamp(params.hairV2DoublePonytailSplay, -1, 1);
  const tails = anchors.map((anchor, index) => {
    const sideSign = index === 0 ? -1 : 1;
    const lateral = clamp(viewSide + sideSign * splay * authoredVisibility, -1, 1);
    const layer = resolveHairV2Layer(anchor.tiePoint.depthPosition);
    return {
      ...solveTailInstance({
        params,
        tiePoint: anchor.tiePoint,
        length: params.hairV2DoublePonytailLength,
        width: params.hairV2DoublePonytailWidth,
        lift: params.hairV2DoublePonytailLift,
        lateral,
        detailSeed: DETAIL_SEEDS[index],
        color,
        shineColor,
        tieColor,
        layer
      }),
      tiePoint: anchor.tiePoint,
      tieU: anchor.tieU,
      tieV: anchor.tieV
    };
  });
  const area = clamp(params.hairV2DoublePonytailAttractionArea, 0, 1);

  return {
    layout,
    tails,
    attractionTargets: tails.map((tail, index) => ({
      id: `double-${index}`,
      tiePoint: tail.tiePoint,
      tieU: tail.tieU,
      tieV: tail.tieV,
      area
    })),
    sharedOutline: Boolean(params.hairV2SharedOutline)
  };
}

function makeHorizontalAnchors(scalp, tieV, separation) {
  const sideU = lerp(1.9, 1.05, separation);
  return [-sideU, sideU].map(tieU => ({
    tieU,
    tieV,
    tiePoint: scalp(tieU, tieV)
  }));
}

function makeVerticalAnchors(scalp, centerV, separation) {
  const halfSeparation = lerp(0.035, 0.24, separation);
  const upperV = clamp(centerV - halfSeparation, 0.03, 0.96);
  const lowerV = clamp(Math.max(centerV + halfSeparation, upperV + 0.02), 0.05, 1);
  return [upperV, lowerV].map(tieV => ({
    tieU: REAR_U,
    tieV,
    tiePoint: rearCenterPoint(scalp, tieV)
  }));
}

function rearCenterPoint(scalp, tieV) {
  const left = scalp(-REAR_U, tieV);
  const right = scalp(REAR_U, tieV);
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    depthPosition: (left.depthPosition + right.depthPosition) / 2,
    sidePosition: (left.sidePosition + right.sidePosition) / 2
  };
}

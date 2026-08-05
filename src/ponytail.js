import { clamp, lerp } from "./geometry.js";
import { createHairV2Scalp } from "./hairV2.js";
import { resolveHairColor, resolveHairShineColor } from "./rig.js";
import { ponytailTailWidthAt, solveTailInstance } from "./tiedHair.js";

const U_RANGE = 2;
const DETAIL_SEED = 40000;

export { ponytailTailWidthAt };

export function solvePonytail(params, pose, structure) {
  if (!params.showHairV2Ponytail || params.showHelmet) {
    return null;
  }

  const scalp = createHairV2Scalp(params, pose, structure);
  const tieV = lerp(0.92, 0.25, clamp(params.hairV2PonytailHeight, 0, 1));
  const tieLeft = scalp(-U_RANGE, tieV);
  const tieRight = scalp(U_RANGE, tieV);
  const tiePoint = {
    x: (tieLeft.x + tieRight.x) / 2,
    y: (tieLeft.y + tieRight.y) / 2,
    depthPosition: -1,
    sidePosition: (tieLeft.sidePosition + tieRight.sidePosition) / 2
  };
  const width = params.hairV2PonytailWidth;
  const viewSide = Math.sin(pose.yaw * Math.PI / 2);
  const authoredSwing = params.hairV2PonytailSwing * Math.cos(pose.yaw * Math.PI / 2);
  const lateral = clamp(viewSide + authoredSwing, -1, 1);

  return {
    ...solveTailInstance({
      params,
      tiePoint,
      length: params.hairV2PonytailLength,
      width,
      lift: params.hairV2PonytailLift,
      lateral,
      detailSeed: DETAIL_SEED,
      color: resolveHairColor(params, "hairV2Color"),
      shineColor: resolveHairShineColor(params, "hairV2Color"),
      tieColor: resolveHairColor(params, "hairV2PonytailTieColor")
    }),
    tiePoint,
    tieV,
    sharedOutline: Boolean(params.hairV2SharedOutline)
  };
}

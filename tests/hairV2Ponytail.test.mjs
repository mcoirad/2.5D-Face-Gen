import assert from "node:assert/strict";
import test from "node:test";

import { ponytailTailWidthAt } from "../src/hairV2.js";
import { HAIR_V2_LENGTH_PRESETS } from "../src/hairV2Profiles.js";
import { defaultParams } from "../src/params.js";
import {
  defaultFeatureLandmarks,
  defaultOutlineLandmarks,
  solveFaceRig
} from "../src/rig.js";

const EPSILON = 1e-6;

function makeParams(overrides = {}) {
  return {
    ...defaultParams,
    showHairV2: true,
    showHelmet: false,
    outlineLandmarks: structuredClone(defaultOutlineLandmarks),
    featureLandmarks: structuredClone(defaultFeatureLandmarks),
    ...overrides
  };
}

function solveHair(overrides = {}) {
  return solveFaceRig(makeParams(overrides)).hairV2;
}

function assertFiniteGeometry(value, path = "geometry") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} should be finite`);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteGeometry(item, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    assertFiniteGeometry(item, `${path}.${key}`);
  }
}

test("disabled ponytail preserves existing hair v2 output", () => {
  const explicit = solveHair({ showHairV2Ponytail: false });
  const legacyParams = makeParams();
  delete legacyParams.showHairV2Ponytail;
  delete legacyParams.hairV2PonytailHeight;
  delete legacyParams.hairV2PonytailLength;
  delete legacyParams.hairV2PonytailWidth;
  delete legacyParams.hairV2PonytailLift;
  delete legacyParams.hairV2PonytailSwing;
  delete legacyParams.hairV2PonytailTieColor;
  const legacy = solveFaceRig(legacyParams).hairV2;

  assert.deepEqual(explicit, legacy);
  assert.equal(explicit.ponytail, null);
});

test("ponytail requires hair v2 and is suppressed by the helmet", () => {
  assert.equal(
    solveFaceRig(makeParams({ showHairV2: false, showHairV2Ponytail: true })).hairV2,
    null
  );

  const visible = solveHair({ showHairV2Ponytail: true });
  const helmet = solveHair({ showHairV2Ponytail: true, showHelmet: true });
  const ordinary = solveHair({ showHairV2Ponytail: false, showHelmet: true });

  assert.ok(visible.ponytail);
  assert.equal(helmet.ponytail, null);
  assert.deepEqual(helmet, ordinary);
});

test("height, length, width, and swing control the solved tail", () => {
  const low = solveHair({ showHairV2Ponytail: true, hairV2PonytailHeight: 0 }).ponytail;
  const high = solveHair({ showHairV2Ponytail: true, hairV2PonytailHeight: 1 }).ponytail;
  assert.ok(high.tiePoint.y < low.tiePoint.y);

  const short = solveHair({ showHairV2Ponytail: true, hairV2PonytailLength: 60 }).ponytail;
  const long = solveHair({ showHairV2Ponytail: true, hairV2PonytailLength: 280 }).ponytail;
  assert.ok(long.tailMass.spinePoints.at(-1).y > short.tailMass.spinePoints.at(-1).y);

  const narrow = solveHair({ showHairV2Ponytail: true, hairV2PonytailWidth: 30 }).ponytail;
  const wide = solveHair({ showHairV2Ponytail: true, hairV2PonytailWidth: 150 }).ponytail;
  assert.ok(Math.max(...wide.tailMass.widthSamples) > Math.max(...narrow.tailMass.widthSamples));

  const left = solveHair({ showHairV2Ponytail: true, hairV2PonytailSwing: -1 }).ponytail;
  const center = solveHair({ showHairV2Ponytail: true, hairV2PonytailSwing: 0 }).ponytail;
  const right = solveHair({ showHairV2Ponytail: true, hairV2PonytailSwing: 1 }).ponytail;
  const leftTip = left.tailMass.spinePoints.at(-1);
  const centerTip = center.tailMass.spinePoints.at(-1);
  const rightTip = right.tailMass.spinePoints.at(-1);

  assert.ok(leftTip.x < centerTip.x && centerTip.x < rightTip.x);
  assert.ok(Math.abs(leftTip.x + rightTip.x - centerTip.x * 2) < EPSILON);
});

test("swing and rear projection remain continuous and finite across yaw", () => {
  let previousTip = null;

  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    const ponytail = solveHair({
      showHairV2Ponytail: true,
      hairV2PonytailSwing: 0.4,
      yaw
    }).ponytail;
    const tip = ponytail.tailMass.spinePoints.at(-1);

    assertFiniteGeometry(ponytail);
    if (previousTip) {
      assert.ok(Math.hypot(tip.x - previousTip.x, tip.y - previousTip.y) < 180);
    }
    previousTip = tip;
  }
});

test("gathered ribbons compress by distance and converge beneath the tie", () => {
  const ponytail = solveHair({ showHairV2Ponytail: true }).ponytail;
  const backRuns = ponytail.gatheredRibbons.filter(ribbon => ribbon.layer === "back");

  assert.equal(backRuns.length, 6);
  for (const ribbon of backRuns) {
    assert.ok(ribbon.widthSamples[0] > ribbon.widthSamples.at(-1));
    assert.ok(ribbon.widthSamples.at(-1) > 0);
    const endpoint = ribbon.spinePoints.at(-1);
    assert.ok(Math.hypot(
      endpoint.x - ponytail.tiePoint.x,
      endpoint.y - ponytail.tiePoint.y
    ) < EPSILON);
  }

  assert.ok(new Set(backRuns.map(ribbon => ribbon.widthSamples[0].toFixed(4))).size > 1);
});

test("tail width expands after the tie and reaches zero at the tip", () => {
  const tieWidth = 14;
  const fullWidth = 80;

  assert.equal(ponytailTailWidthAt(0, tieWidth, fullWidth), tieWidth);
  assert.ok(ponytailTailWidthAt(0.22, tieWidth, fullWidth) > tieWidth);
  assert.equal(ponytailTailWidthAt(1, tieWidth, fullWidth), 0);

  const samples = Array.from({ length: 101 }, (_, index) => (
    ponytailTailWidthAt(index / 100, tieWidth, fullWidth)
  ));
  assert.ok(samples.every(width => Number.isFinite(width) && width >= 0));
});

test("fully gathered hair retains only explicit fringe and face-frame locks", () => {
  const uniform = solveHair({ showHairV2Ponytail: true });
  assert.equal(uniform.locks.length, 0);

  const bangs = solveHair({
    showHairV2Ponytail: true,
    ...HAIR_V2_LENGTH_PRESETS.fullBangs.values
  });
  assert.ok(bangs.locks.length > 0);
  assert.ok(bangs.locks.every(lock => lock.layer === "front"));

  const faceFrame = solveHair({
    showHairV2Ponytail: true,
    hairV2FaceFrameLengthScale: 1.4
  });
  assert.ok(faceFrame.locks.length > 0);
  assert.ok(faceFrame.locks.length < solveHair({ showHairV2Ponytail: false }).locks.length);
});

test("active ponytail forces full scalp coverage without mutating its controls", () => {
  const withoutToggle = solveHair({
    showHairV2Ponytail: true,
    showHairV2ScalpBase: false,
    hairV2ScalpBaseCoverage: 0.1
  });
  const withToggle = solveHair({
    showHairV2Ponytail: true,
    showHairV2ScalpBase: true,
    hairV2ScalpBaseCoverage: 0.9
  });
  const loose = solveHair({
    showHairV2Ponytail: false,
    showHairV2ScalpBase: true,
    hairV2ScalpBaseCoverage: 0.1
  });

  assert.deepEqual(withoutToggle.scalpBase, withToggle.scalpBase);
  assert.ok(withoutToggle.scalpBase.length > loose.scalpBase.length);
});

test("tail shine obeys shine visibility and detail locks inherit curl", () => {
  const noShine = solveHair({
    showHairV2Ponytail: true,
    showHairV2Shine: false
  }).ponytail;
  const shine = solveHair({
    showHairV2Ponytail: true,
    showHairV2Shine: true,
    hairV2ShineLength: 0.7
  }).ponytail;

  assert.equal(noShine.tailShine, null);
  assert.equal(noShine.detailShines.length, 0);
  assert.ok(shine.tailShine);
  assert.ok(shine.detailShines.length > 0);

  const straight = solveHair({
    showHairV2Ponytail: true,
    hairV2CurlInterval: 20,
    hairV2CurlAngle: 0
  }).ponytail;
  const curled = solveHair({
    showHairV2Ponytail: true,
    hairV2CurlInterval: 20,
    hairV2CurlAngle: 30
  }).ponytail;

  assert.notDeepEqual(curled.detailLocks, straight.detailLocks);
  assert.deepEqual(curled.tailMass, straight.tailMass);
});

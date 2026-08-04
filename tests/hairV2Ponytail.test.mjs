import assert from "node:assert/strict";
import test from "node:test";

import {
  hairV2PonytailAttractionDistance
} from "../src/hairV2.js";
import { defaultParams } from "../src/params.js";
import { ponytailTailWidthAt } from "../src/ponytail.js";
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

function solveRig(overrides = {}) {
  return solveFaceRig(makeParams(overrides));
}

function solvePonytail(overrides = {}) {
  return solveRig({ showHairV2Ponytail: true, ...overrides }).ponytail;
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

function attractedIndices(hairV2) {
  return hairV2.locks.flatMap((lock, index) => lock.attracted ? [index] : []);
}

test("ponytail at attraction zero leaves complete hair v2 output unchanged", () => {
  const baseline = solveRig({
    showHairV2Ponytail: false,
    hairV2PonytailAttractionArea: 0
  });
  const alongside = solveRig({
    showHairV2Ponytail: true,
    hairV2PonytailAttractionArea: 0
  });

  assert.deepEqual(alongside.hairV2, baseline.hairV2);
  assert.ok(alongside.ponytail);
  assert.equal("ponytail" in alongside.hairV2, false);
});

test("ponytail is independent of hair v2 and temporarily suppressed by helmet", () => {
  const independent = solveRig({
    showHairV2: false,
    showHairV2Ponytail: true
  });
  const helmet = solveRig({
    showHairV2: false,
    showHairV2Ponytail: true,
    showHelmet: true
  });
  const restored = solveRig({
    showHairV2: false,
    showHairV2Ponytail: true,
    showHelmet: false
  });

  assert.equal(independent.hairV2, null);
  assert.ok(independent.ponytail);
  assert.equal(helmet.ponytail, null);
  assert.deepEqual(restored.ponytail, independent.ponytail);
});

test("ponytail does not override normal scalp base visibility or coverage", () => {
  const hidden = solveRig({
    showHairV2Ponytail: true,
    showHairV2ScalpBase: false
  }).hairV2;

  assert.deepEqual(hidden.scalpBase, []);

  for (const coverage of [0.1, 0.9]) {
    const loose = solveRig({
      showHairV2Ponytail: false,
      showHairV2ScalpBase: true,
      hairV2ScalpBaseCoverage: coverage
    }).hairV2;
    const alongside = solveRig({
      showHairV2Ponytail: true,
      showHairV2ScalpBase: true,
      hairV2ScalpBaseCoverage: coverage
    }).hairV2;

    assert.deepEqual(alongside.scalpBase, loose.scalpBase);
  }
});

test("height, length, width, and swing control the independent tail", () => {
  const low = solvePonytail({ hairV2PonytailHeight: 0 });
  const high = solvePonytail({ hairV2PonytailHeight: 1 });
  assert.ok(high.tiePoint.y < low.tiePoint.y);

  const short = solvePonytail({ hairV2PonytailLength: 60 });
  const long = solvePonytail({ hairV2PonytailLength: 280 });
  assert.ok(long.tailMass.spinePoints.at(-1).y > short.tailMass.spinePoints.at(-1).y);

  const narrow = solvePonytail({ hairV2PonytailWidth: 30 });
  const wide = solvePonytail({ hairV2PonytailWidth: 150 });
  assert.ok(Math.max(...wide.tailMass.widthSamples) > Math.max(...narrow.tailMass.widthSamples));

  const left = solvePonytail({ hairV2PonytailSwing: -1 });
  const center = solvePonytail({ hairV2PonytailSwing: 0 });
  const right = solvePonytail({ hairV2PonytailSwing: 1 });
  const leftTip = left.tailMass.spinePoints.at(-1);
  const centerTip = center.tailMass.spinePoints.at(-1);
  const rightTip = right.tailMass.spinePoints.at(-1);

  assert.ok(leftTip.x < centerTip.x && centerTip.x < rightTip.x);
  assert.ok(Math.abs(leftTip.x + rightTip.x - centerTip.x * 2) < EPSILON);
});

test("swing and rear projection remain continuous and finite across yaw", () => {
  let previousTip = null;

  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    const ponytail = solvePonytail({
      hairV2PonytailSwing: 0.4,
      yaw
    });
    const tip = ponytail.tailMass.spinePoints.at(-1);

    assertFiniteGeometry(ponytail);
    if (previousTip) {
      assert.ok(Math.hypot(tip.x - previousTip.x, tip.y - previousTip.y) < 180);
    }
    previousTip = tip;
  }
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

test("tail styling continues to inherit shine, curl, and shared outline controls", () => {
  const noShine = solvePonytail({ showHairV2Shine: false });
  const shine = solvePonytail({
    showHairV2Shine: true,
    hairV2ShineLength: 0.7
  });

  assert.equal(noShine.tailShine, null);
  assert.equal(noShine.detailShines.length, 0);
  assert.ok(shine.tailShine);
  assert.ok(shine.detailShines.length > 0);

  const straight = solvePonytail({
    hairV2CurlInterval: 20,
    hairV2CurlAngle: 0,
    hairV2SharedOutline: false
  });
  const curled = solvePonytail({
    hairV2CurlInterval: 20,
    hairV2CurlAngle: 30,
    hairV2SharedOutline: true
  });

  assert.notDeepEqual(curled.detailLocks, straight.detailLocks);
  assert.deepEqual(curled.tailMass, straight.tailMass);
  assert.equal(straight.sharedOutline, false);
  assert.equal(curled.sharedOutline, true);
});

test("attraction distance excludes the front and spans the eligible region", () => {
  const tieV = 0.6;

  assert.equal(hairV2PonytailAttractionDistance(0.64, tieV, tieV), Infinity);
  assert.equal(hairV2PonytailAttractionDistance(-0.64, tieV, tieV), Infinity);
  assert.equal(hairV2PonytailAttractionDistance(2, tieV, tieV), 0);
  assert.ok(hairV2PonytailAttractionDistance(0.65, 0, tieV) <= 1);
  assert.ok(hairV2PonytailAttractionDistance(-0.65, 1, tieV) <= 1);
});

test("attraction membership is monotonic and stable across yaw", () => {
  const counts = [0, 0.35, 0.7, 1].map(area => attractedIndices(solveRig({
    showHairV2Ponytail: true,
    hairV2PonytailAttractionArea: area
  }).hairV2).length);

  assert.equal(counts[0], 0);
  assert.ok(counts[0] <= counts[1] && counts[1] <= counts[2] && counts[2] <= counts[3]);
  assert.ok(counts[3] > 0);

  const left = solveRig({
    showHairV2Ponytail: true,
    hairV2PonytailAttractionArea: 0.7,
    yaw: -1
  }).hairV2;
  const front = solveRig({
    showHairV2Ponytail: true,
    hairV2PonytailAttractionArea: 0.7,
    yaw: 0
  }).hairV2;
  const right = solveRig({
    showHairV2Ponytail: true,
    hairV2PonytailAttractionArea: 0.7,
    yaw: 1
  }).hairV2;

  assert.deepEqual(attractedIndices(left), attractedIndices(front));
  assert.deepEqual(attractedIndices(right), attractedIndices(front));
  assert.ok(front.locks.filter(lock => lock.attracted)
    .every(lock => Math.abs(lock.rootUV.u) >= 0.65));
});

test("attracted locks pin exactly to the tie under straight and extreme curls", () => {
  for (const curlAngle of [0, 60]) {
    const rig = solveRig({
      showHairV2Ponytail: true,
      hairV2PonytailAttractionArea: 1,
      hairV2CurlInterval: curlAngle === 0 ? 1000 : 8,
      hairV2CurlAngle: curlAngle,
      hairV2CurlPeriod: 1
    });
    const attracted = rig.hairV2.locks.filter(lock => lock.attracted);

    assert.ok(attracted.length > 0);
    for (const lock of attracted) {
      assert.ok(Math.hypot(
        lock.tip.x - rig.ponytail.tiePoint.x,
        lock.tip.y - rig.ponytail.tiePoint.y
      ) < EPSILON);
    }
  }
});

test("locks outside the attraction area remain exactly baseline geometry", () => {
  const baseline = solveRig({
    showHairV2Ponytail: false,
    hairV2PonytailAttractionArea: 0
  }).hairV2;
  const attracted = solveRig({
    showHairV2Ponytail: true,
    hairV2PonytailAttractionArea: 0.55
  }).hairV2;

  assert.equal(attracted.locks.length, baseline.locks.length);
  assert.ok(attracted.locks.some(lock => lock.attracted));

  attracted.locks.forEach((lock, index) => {
    if (!lock.attracted) {
      assert.deepEqual(lock, baseline.locks[index]);
    }
  });
});

test("attraction default is disabled for existing saves", () => {
  assert.equal(defaultParams.hairV2PonytailAttractionArea, 0);
});

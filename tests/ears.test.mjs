import assert from "node:assert/strict";
import test from "node:test";

import { defaultParams } from "../src/params.js";
import {
  defaultFeatureLandmarks,
  defaultOutlineLandmarks,
  solveFaceRig,
  withFeatureLandmarkFallbacks
} from "../src/rig.js";

const EPSILON = 1e-6;

function makeParams(overrides = {}) {
  return {
    ...defaultParams,
    outlineLandmarks: structuredClone(defaultOutlineLandmarks),
    featureLandmarks: structuredClone(defaultFeatureLandmarks),
    ...overrides
  };
}

function almostEqual(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function outlineEdgeX(outline, y, side) {
  let best = null;

  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j];
    const b = outline[i];

    if ((a.y > y) !== (b.y > y)) {
      const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);

      if (best === null || (side > 0 ? x > best : x < best)) {
        best = x;
      }
    }
  }

  return best;
}

test("front and three-quarter ear roots stay on the outline", () => {
  for (const yaw of [0, 0.5, -0.5]) {
    const rig = solveFaceRig(makeParams({ yaw, pitch: 0 }));

    for (const [ear, side] of [[rig.ears.left, -1], [rig.ears.right, 1]]) {
      almostEqual(ear.topAttach.x, outlineEdgeX(rig.head.outline, ear.topAttach.y, side), `top root at yaw ${yaw}`);
      almostEqual(ear.bottomAttach.x, outlineEdgeX(rig.head.outline, ear.bottomAttach.y, side), `bottom root at yaw ${yaw}`);
    }
  }
});

test("the unstroked attachment edge bows into the head", () => {
  const rig = solveFaceRig(makeParams({ yaw: 0, pitch: 0 }));

  for (const [ear, side] of [[rig.ears.left, -1], [rig.ears.right, 1]]) {
    almostEqual(ear.attachControl.x, (ear.topAttach.x + ear.bottomAttach.x) / 2 - side * 2, "attachment overlap X");
    almostEqual(ear.attachControl.y, (ear.topAttach.y + ear.bottomAttach.y) / 2, "attachment overlap Y");
  }
});

test("both ears converge on the mirrored side landmarks at full profile", () => {
  const positive = solveFaceRig(makeParams({ yaw: 1, pitch: 0 }));
  const negative = solveFaceRig(makeParams({ yaw: -1, pitch: 0 }));

  almostEqual(positive.ears.left.topAttach.x, positive.ears.right.topAttach.x, "positive profile top roots");
  almostEqual(positive.ears.left.bottomAttach.x, positive.ears.right.bottomAttach.x, "positive profile bottom roots");
  almostEqual(negative.ears.left.topAttach.x, negative.ears.right.topAttach.x, "negative profile top roots");
  almostEqual(negative.ears.left.bottomAttach.x, negative.ears.right.bottomAttach.x, "negative profile bottom roots");
  almostEqual(positive.ears.left.topAttach.x + negative.ears.left.topAttach.x, 500, "mirrored top target");
  almostEqual(positive.ears.left.bottomAttach.x + negative.ears.left.bottomAttach.x, 500, "mirrored bottom target");
});

test("custom side landmarks affect only yaw beyond three-quarter", () => {
  const defaults = makeParams();
  const customized = makeParams();
  customized.featureLandmarks.side.ears = { topX: 0.4, bottomX: 0.2 };

  for (const yaw of [0, 0.5]) {
    const beforeProfile = solveFaceRig({ ...defaults, yaw });
    const customBeforeProfile = solveFaceRig({ ...customized, yaw });
    almostEqual(customBeforeProfile.ears.left.topAttach.x, beforeProfile.ears.left.topAttach.x, `top unchanged at yaw ${yaw}`);
    almostEqual(customBeforeProfile.ears.right.bottomAttach.x, beforeProfile.ears.right.bottomAttach.x, `bottom unchanged at yaw ${yaw}`);
  }

  const profile = solveFaceRig({ ...customized, yaw: 1 });
  const skullRadius = defaultParams.faceWidth / 2;
  almostEqual(profile.ears.left.topAttach.x, 250 + 0.4 * skullRadius, "custom profile top");
  almostEqual(profile.ears.right.bottomAttach.x, 250 + 0.2 * skullRadius, "custom profile bottom");
});

test("pitch scales neutral ear height linearly without scaling stick-out or curve", () => {
  const yaw = 0.25;
  const neutral = solveFaceRig(makeParams({ yaw, pitch: 0 }));
  const negative = solveFaceRig(makeParams({ yaw, pitch: -0.5 }));
  const negativeMid = solveFaceRig(makeParams({ yaw, pitch: -0.25 }));
  const positiveMid = solveFaceRig(makeParams({ yaw, pitch: 0.25 }));
  const positive = solveFaceRig(makeParams({ yaw, pitch: 0.5 }));
  const neutralHeight = neutral.ears.left.bottomAttach.y - neutral.ears.left.topAttach.y;
  const featureGap = neutral.features.nose.tip.y
    - (neutral.features.eyes[0].center.y + neutral.features.eyes[1].center.y) / 2;

  almostEqual(neutralHeight, Math.max(20, featureGap), "neutral height uses eye-to-nose gap");
  almostEqual(negative.ears.left.bottomAttach.y - negative.ears.left.topAttach.y, neutralHeight * 0.5, "negative pitch height");
  almostEqual(negativeMid.ears.left.bottomAttach.y - negativeMid.ears.left.topAttach.y, neutralHeight * 0.75, "negative midpoint height");
  almostEqual(positiveMid.ears.left.bottomAttach.y - positiveMid.ears.left.topAttach.y, neutralHeight * 0.9, "positive midpoint height");
  almostEqual(positive.ears.left.bottomAttach.y - positive.ears.left.topAttach.y, neutralHeight * 0.8, "positive pitch height");

  const neutralStickOut = Math.abs(neutral.ears.left.apex.x - neutral.ears.left.topAttach.x);
  const pitchedStickOut = Math.abs(positive.ears.left.apex.x - positive.ears.left.topAttach.x);
  almostEqual(pitchedStickOut, neutralStickOut, "stick-out remains unchanged");
  almostEqual(positive.ears.left.curve, neutral.ears.left.curve, "curve remains unchanged");
});

test("ear layers remain unchanged through three-quarter then split by depth", () => {
  const front = solveFaceRig(makeParams({ yaw: 0 }));
  const turned = solveFaceRig(makeParams({ yaw: 0.4 }));
  const threeQuarter = solveFaceRig(makeParams({ yaw: 0.5 }));
  const positiveProfile = solveFaceRig(makeParams({ yaw: 0.75 }));
  const negativeProfile = solveFaceRig(makeParams({ yaw: -0.75 }));

  assert.deepEqual([front.ears.left.layer, front.ears.right.layer], ["front", "front"]);
  assert.deepEqual([turned.ears.left.layer, turned.ears.right.layer], ["back", "back"]);
  assert.deepEqual([threeQuarter.ears.left.layer, threeQuarter.ears.right.layer], ["back", "back"]);
  assert.deepEqual([positiveProfile.ears.left.layer, positiveProfile.ears.right.layer], ["back", "front"]);
  assert.deepEqual([negativeProfile.ears.left.layer, negativeProfile.ears.right.layer], ["front", "back"]);
});

test("older feature landmarks receive side-ear defaults", () => {
  const legacy = structuredClone(defaultFeatureLandmarks);
  delete legacy.side.ears;
  const restored = withFeatureLandmarkFallbacks(legacy);

  assert.deepEqual(restored.side.ears, defaultFeatureLandmarks.side.ears);
});

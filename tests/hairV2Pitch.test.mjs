import assert from "node:assert/strict";
import test from "node:test";

import { createHairV2Scalp } from "../src/hairV2.js";
import { defaultParams } from "../src/params.js";
import {
  defaultFeatureLandmarks,
  defaultOutlineLandmarks,
  solveFaceRig
} from "../src/rig.js";

const EPSILON = 1e-8;
const U_RANGE = 2;

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

function makeScalp(overrides = {}) {
  const params = makeParams({ showHairV2: false, ...overrides });
  const rig = solveFaceRig(params);
  return {
    params,
    rig,
    scalp: createHairV2Scalp(params, rig.pose, rig.head.structure)
  };
}

function almostEqual(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`
  );
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

test("all scalp longitudes converge at the crown across pitch and yaw", () => {
  for (const pitch of [-0.5, 0, 0.5]) {
    for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
      const { scalp } = makeScalp({ pitch, yaw });
      const crown = scalp(-U_RANGE, 0);

      for (const u of [-1.5, -0.5, 0, 0.5, 1.5, U_RANGE]) {
        const point = scalp(u, 0);
        almostEqual(point.x, crown.x, `crown x at pitch ${pitch}, yaw ${yaw}, u ${u}`);
        almostEqual(point.y, crown.y, `crown y at pitch ${pitch}, yaw ${yaw}, u ${u}`);
        almostEqual(
          point.depthPosition,
          crown.depthPosition,
          `crown facing at pitch ${pitch}, yaw ${yaw}, u ${u}`
        );
      }
    }
  }
});

test("front-back screen separation grows smoothly away from the crown", () => {
  const front = makeScalp({ pitch: -0.5, yaw: 1 }).scalp;
  const back = makeScalp({ pitch: -0.5, yaw: -1 }).scalp;
  const separations = [0, 0.2, 0.4, 0.6].map(v => (
    Math.abs(front(1, v).y - back(1, v).y)
  ));

  almostEqual(separations[0], 0, "front/back crown separation");
  assert.ok(separations[1] > separations[0]);
  assert.ok(separations[2] > separations[1]);
  assert.ok(separations[3] > separations[2]);

  const neutralFront = makeScalp({ pitch: 0, yaw: 1 }).scalp;
  const neutralBack = makeScalp({ pitch: 0, yaw: -1 }).scalp;
  almostEqual(neutralFront(1, 0.6).y, neutralBack(1, 0.6).y, "pitch-zero depth projection");
});

test("crown facing follows pitch while side position remains yaw-based", () => {
  const negative = makeScalp({ pitch: -0.5, yaw: 0 }).scalp(0, 0);
  const neutral = makeScalp({ pitch: 0, yaw: 0 }).scalp(0, 0);
  const positive = makeScalp({ pitch: 0.5, yaw: 0 }).scalp(0, 0);

  assert.ok(negative.depthPosition > 0);
  almostEqual(neutral.depthPosition, 0, "neutral crown facing");
  assert.ok(positive.depthPosition < 0);
  almostEqual(negative.sidePosition, neutral.sidePosition, "negative-pitch side position");
  almostEqual(positive.sidePosition, neutral.sidePosition, "positive-pitch side position");
});

test("pitch zero preserves the existing projected scalp coordinates", () => {
  const { scalp, rig } = makeScalp({ pitch: 0, yaw: 0.35 });
  const { skull } = rig.head.structure;

  for (const [u, v] of [[-2, 0], [-1.2, 0.25], [0, 0.5], [0.8, 0.75], [2, 1]]) {
    const headLongitude = u * Math.PI / 2;
    const guideAngle = headLongitude - rig.pose.yaw * Math.PI / 2;
    const backness = Math.max(0, Math.min(1, (1 - Math.cos(headLongitude)) / 2));
    const hairlineTheta = (-0.1 * Math.PI) * (1 - backness) + (0.16 * Math.PI) * backness;
    const theta = (-Math.PI / 2) * (1 - v) + hairlineTheta * v;
    const point = scalp(u, v);

    almostEqual(point.x, 250 + Math.cos(theta) * skull.rx * Math.sin(guideAngle), `pitch-zero x at ${u}, ${v}`);
    almostEqual(point.y, 250 + skull.cy + Math.sin(theta) * skull.ry, `pitch-zero y at ${u}, ${v}`);
  }
});

test("negative pitch keeps the complete crown lock row in the front pass", () => {
  const lockCount = 40;
  const rows = Math.max(2, Math.round(Math.sqrt(lockCount / 3)));
  const crownRowCount = Math.ceil(lockCount / rows);

  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    const hairV2 = solveRig({
      pitch: -0.5,
      yaw,
      hairV2LockCount: lockCount
    }).hairV2;

    assert.ok(hairV2.locks.slice(0, crownRowCount).every(lock => lock.layer === "front"));
    assertFiniteGeometry(hairV2, `hairV2 at yaw ${yaw}`);
  }
});

test("dependent scalp geometry stays finite and continuous across pitch", () => {
  let previousTie = null;

  for (const pitch of [-0.5, -0.25, 0, 0.25, 0.5]) {
    const rig = solveRig({
      pitch,
      showHairV2Headband: true,
      showHairV2Ponytail: true,
      hairV2PonytailAttractionArea: 0
    });

    assertFiniteGeometry(rig.hairV2.scalpBase, `scalp base at pitch ${pitch}`);
    assertFiniteGeometry(rig.hairV2.partGuide, `part guide at pitch ${pitch}`);
    assertFiniteGeometry(rig.headband, `headband at pitch ${pitch}`);
    assertFiniteGeometry(rig.ponytail, `ponytail at pitch ${pitch}`);
    assert.ok(rig.hairV2.scalpBase.every(run => ["front", "back"].includes(run.layer)));
    assert.ok(rig.headband.belt.every(run => ["front", "back"].includes(run.layer)));

    if (previousTie) {
      assert.ok(Math.hypot(
        rig.ponytail.tiePoint.x - previousTie.x,
        rig.ponytail.tiePoint.y - previousTie.y
      ) < 80);
    }
    previousTie = rig.ponytail.tiePoint;
  }
});

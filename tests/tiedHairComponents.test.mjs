import assert from "node:assert/strict";
import test from "node:test";

import { defaultParams } from "../src/params.js";
import {
  defaultFeatureLandmarks,
  defaultOutlineLandmarks,
  solveFaceRig
} from "../src/rig.js";
import { renderFaceSvg } from "../src/svgRenderer.js";

const EPSILON = 1e-6;

function solve(overrides = {}) {
  return solveFaceRig({
    ...defaultParams,
    showHairV2: true,
    showHelmet: false,
    outlineLandmarks: structuredClone(defaultOutlineLandmarks),
    featureLandmarks: structuredClone(defaultFeatureLandmarks),
    ...overrides
  });
}

function assertFinite(value, path = "geometry") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} should be finite`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => assertFinite(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => assertFinite(item, `${path}.${key}`));
  }
}

test("new tied-hair components are independent, opt-in, and helmet compatible", () => {
  const disabled = solve();
  assert.equal(disabled.doublePonytail, null);
  assert.equal(disabled.sideTiedLocks, null);

  const active = solve({
    showHairV2: false,
    showHelmet: true,
    showHairV2DoublePonytail: true,
    showHairV2SideTiedLocks: true
  });
  assert.equal(active.hairV2, null);
  assert.ok(active.doublePonytail);
  assert.ok(active.sideTiedLocks);
  assertFinite(active.doublePonytail);
  assertFinite(active.sideTiedLocks);
});

test("horizontal and vertical double-tail anchors obey their layout", () => {
  const horizontal = solve({
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailLayout: "horizontal"
  }).doublePonytail;
  const [left, right] = horizontal.tails;
  assert.equal(left.tieV, right.tieV);
  assert.ok(Math.abs(left.tiePoint.x + right.tiePoint.x - 500) < EPSILON);
  assert.ok(left.tiePoint.x < right.tiePoint.x);

  const vertical = solve({
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailLayout: "vertical"
  }).doublePonytail;
  const [upper, lower] = vertical.tails;
  assert.equal(upper.tieU, lower.tieU);
  assert.ok(upper.tieV < lower.tieV);
  assert.ok(upper.tiePoint.y < lower.tiePoint.y);
  assert.ok(Math.abs(upper.tiePoint.x - lower.tiePoint.x) < EPSILON);
});

test("double tails inherit the Hair-v2 layer of their head-fixed anchors", () => {
  const front = solve({
    yaw: 0,
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailLayout: "horizontal"
  }).doublePonytail;
  assert.ok(front.tails.every(tail => tail.tailMass.layer === "back"));

  const profile = solve({
    yaw: 1,
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailLayout: "horizontal"
  }).doublePonytail;
  assert.deepEqual(profile.tails.map(tail => tail.tailMass.layer), ["back", "front"]);
  for (const tail of profile.tails) {
    const expected = tail.tailMass.layer;
    assert.equal(tail.tie.layer, expected);
    assert.ok(tail.detailLocks.every(lock => lock.layer === expected));
    assert.ok(tail.detailShines.every(shine => shine.layer === expected));
    if (tail.tailShine) assert.equal(tail.tailShine.layer, expected);
  }

  const mirrored = solve({
    yaw: -1,
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailLayout: "horizontal"
  }).doublePonytail;
  assert.deepEqual(mirrored.tails.map(tail => tail.tailMass.layer), ["front", "back"]);
});

test("double-tail dimensions, separation, and splay are monotonic and deterministic", () => {
  const close = solve({
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailSeparation: 0
  }).doublePonytail;
  const wide = solve({
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailSeparation: 1
  }).doublePonytail;
  assert.ok(Math.abs(wide.tails[1].tiePoint.x - wide.tails[0].tiePoint.x)
    > Math.abs(close.tails[1].tiePoint.x - close.tails[0].tiePoint.x));

  const inward = solve({
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailSplay: -1
  }).doublePonytail;
  const outward = solve({
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailSplay: 1
  }).doublePonytail;
  assert.ok(outward.tails[0].tailMass.tip.x < inward.tails[0].tailMass.tip.x);
  assert.ok(outward.tails[1].tailMass.tip.x > inward.tails[1].tailMass.tip.x);
  assert.notDeepEqual(outward.tails[0].detailLocks, outward.tails[1].detailLocks);

  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    for (const pitch of [-0.5, 0, 0.5]) {
      assertFinite(solve({
        showHairV2DoublePonytail: true,
        yaw,
        pitch,
        hairV2DoublePonytailHeight: 1,
        hairV2DoublePonytailLength: 280,
        hairV2DoublePonytailWidth: 120,
        hairV2DoublePonytailLift: 1
      }).doublePonytail);
    }
  }
});

test("single and double attractions assign eligible locks once to the nearest stable target", () => {
  const rig = solve({
    showHairV2Ponytail: true,
    hairV2PonytailAttractionArea: 1,
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailAttractionArea: 1,
    hairV2LockCount: 60
  });
  const attracted = rig.hairV2.locks.filter(lock => lock.attracted);
  assert.ok(attracted.length > 0);
  assert.ok(attracted.every(lock => Math.abs(lock.rootUV.u) >= 0.65));
  assert.ok(attracted.every(lock => ["single", "double-0", "double-1"].includes(lock.attractionTargetId)));
  assert.ok(new Set(attracted.map(lock => lock.attractionTargetId)).size >= 2);
  for (const lock of attracted) {
    const target = lock.attractionTargetId === "single"
      ? rig.ponytail
      : rig.doublePonytail.tails[Number(lock.attractionTargetId.at(-1))];
    assert.ok(Math.abs(lock.tip.x - target.tiePoint.x) < EPSILON);
    assert.ok(Math.abs(lock.tip.y - target.tiePoint.y) < EPSILON);
  }

  const membershipByYaw = [-1, -0.5, 0, 0.5, 1].map(yaw => solve({
    yaw,
    showHairV2Ponytail: true,
    hairV2PonytailAttractionArea: 0.55,
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailAttractionArea: 0.55
  }).hairV2.locks.map(lock => lock.attractionTargetId ?? null));
  membershipByYaw.slice(1).forEach(membership => assert.deepEqual(membership, membershipByYaw[0]));
});

test("side tied sections support side modes, counts, root movement, and exact tie fractions", () => {
  for (const [mode, expectedSides] of [
    ["left", ["left"]],
    ["right", ["right"]],
    ["both", ["left", "right"]]
  ]) {
    const sections = solve({
      showHairV2SideTiedLocks: true,
      hairV2SideTiedLocksSide: mode,
      hairV2SideTiedLocksCount: 6
    }).sideTiedLocks.sections;
    assert.deepEqual(sections.map(section => section.side), expectedSides);
    assert.ok(sections.every(section => section.upperLocks.length === 6));
    assert.ok(sections.every(section => section.lowerLocks.length === 6));
  }

  const front = solve({
    showHairV2SideTiedLocks: true,
    hairV2SideTiedLocksSide: "right",
    hairV2SideTiedLocksRootPosition: 0
  }).sideTiedLocks.sections[0];
  const temple = solve({
    showHairV2SideTiedLocks: true,
    hairV2SideTiedLocksSide: "right",
    hairV2SideTiedLocksRootPosition: 1
  }).sideTiedLocks.sections[0];
  assert.ok(temple.tiePoint.x > front.tiePoint.x);

  for (const tieFraction of [0.55, 0.82, 0.95]) {
    const length = 240;
    const section = solve({
      showHairV2SideTiedLocks: true,
      hairV2SideTiedLocksSide: "left",
      hairV2SideTiedLocksLength: length,
      hairV2SideTiedLocksTiePosition: tieFraction,
      hairV2SideTiedLocksCount: 3
    }).sideTiedLocks.sections[0];
    assert.ok(section.upperLocks.every(lock => (
      Math.abs(lock.tip.x - section.tiePoint.x) < EPSILON
      && Math.abs(lock.tip.y - section.tiePoint.y) < EPSILON
    )));
    assert.ok(section.lowerLocks.every(lock => (
      Math.abs(lock.tip.y - (section.tiePoint.y + length * (1 - tieFraction))) < EPSILON
    )));
  }
});

test("side tied locks inherit hair-v2 styling while retaining reduced curl tiers", () => {
  const straight = solve({
    showHairV2SideTiedLocks: true,
    hairV2CurlAngle: 0,
    showHairV2Shine: true,
    hairV2Color: "#654321",
    hairV2SharedOutline: false
  }).sideTiedLocks;
  const curled = solve({
    showHairV2SideTiedLocks: true,
    hairV2CurlAngle: 60,
    hairV2CurlInterval: 12,
    showHairV2Shine: true,
    hairV2Color: "#654321",
    hairV2SharedOutline: false
  }).sideTiedLocks;
  assert.equal(straight.sharedOutline, false);
  assert.ok(straight.sections.every(section => section.upperShines.length > 0));
  assert.equal(straight.sections[0].upperLocks[0].fill, "#654321");
  assert.notDeepEqual(curled.sections[0].upperLocks[0], straight.sections[0].upperLocks[0]);
  assert.notDeepEqual(curled.sections[0].lowerLocks[0], straight.sections[0].lowerLocks[0]);
});

test("SVG pass order keeps tail extensions rearward and near-side locks below facial features", () => {
  const rig = solve({
    yaw: 1,
    showHelmet: true,
    showHairV2Ponytail: true,
    showHairV2DoublePonytail: true,
    showHairV2SideTiedLocks: true,
    hairV2DoublePonytailTieColor: "#00aa11",
    hairV2SideTiedLocksTieColor: "#1100ee",
    skinColor: "#fedcba",
    eyeIrisColor: "#aabbcc"
  });
  const svg = renderFaceSvg(rig);
  const doubleTie = svg.indexOf("#00aa11");
  const skinOccurrences = [...svg.matchAll(/#fedcba/g)].map(match => match.index);
  const head = skinOccurrences[1];
  const eye = svg.lastIndexOf("#aabbcc");
  const sideTieOccurrences = [...svg.matchAll(/#1100ee/g)].map(match => match.index);
  assert.ok(doubleTie >= 0 && doubleTie < head);
  assert.ok(sideTieOccurrences.some(index => index < head));
  assert.ok(sideTieOccurrences.some(index => index > head && index < eye));
});

test("front-classified double tails render above front Hair-v2 locks", () => {
  const rig = solve({
    yaw: 1,
    showHairV2: true,
    showHairV2DoublePonytail: true,
    hairV2DoublePonytailLayout: "horizontal",
    hairV2SharedOutline: false
  });
  const frontTail = rig.doublePonytail.tails.find(tail => tail.tailMass.layer === "front");
  assert.ok(frontTail);

  for (const lock of rig.hairV2.locks.filter(lock => lock.layer === "front")) {
    lock.fill = "#11aa22";
    lock.stroke = "#11aa22";
  }
  frontTail.tailMass.fill = "#cc2299";
  frontTail.tailMass.stroke = "#cc2299";
  for (const lock of frontTail.detailLocks) {
    lock.fill = "#cc2299";
    lock.stroke = "#cc2299";
  }

  const svg = renderFaceSvg(rig);
  assert.ok(svg.lastIndexOf("#cc2299") > svg.lastIndexOf("#11aa22"));
});

test("new controls have save-compatible defaults", () => {
  assert.equal(defaultParams.showHairV2DoublePonytail, false);
  assert.equal(defaultParams.hairV2DoublePonytailLayout, "horizontal");
  assert.equal(defaultParams.hairV2DoublePonytailAttractionArea, 0);
  assert.equal(defaultParams.showHairV2SideTiedLocks, false);
  assert.equal(defaultParams.hairV2SideTiedLocksSide, "both");
  assert.equal(defaultParams.hairV2SideTiedLocksCount, 3);
});

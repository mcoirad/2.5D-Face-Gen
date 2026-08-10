import assert from "node:assert/strict";
import test from "node:test";

import { defaultParams } from "../src/params.js";
import {
  defaultFeatureLandmarks,
  defaultOutlineLandmarks,
  solveFaceRig
} from "../src/rig.js";
import { renderFaceSvg } from "../src/svgRenderer.js";

function solve(overrides = {}) {
  return solveFaceRig({
    ...defaultParams,
    showHelmet: false,
    outlineLandmarks: structuredClone(defaultOutlineLandmarks),
    featureLandmarks: structuredClone(defaultFeatureLandmarks),
    ...overrides
  });
}

function segmentPath(svg, className) {
  const match = svg.match(new RegExp(`class="${className}"\\s+d="([^"]+)"`));
  return match?.[1] ?? null;
}

function pathElement(svg, className) {
  return svg.match(new RegExp(`<path\\s+class="${className}"[\\s\\S]*?/>`))?.[0] ?? null;
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

test("the bridge-to-tip segment hides only when the projected bridge is above", () => {
  const above = solve();
  above.features.nose.bridge.y = above.features.nose.tip.y - 1;
  assert.equal(segmentPath(renderFaceSvg(above), "nose-bridge-segment"), null);
  assert.ok(segmentPath(renderFaceSvg(above), "nose-near-nostril-segment"));
  assert.ok(segmentPath(renderFaceSvg(above), "nose-far-nostril-segment"));

  const level = solve();
  level.features.nose.bridge.y = level.features.nose.tip.y;
  assert.ok(segmentPath(renderFaceSvg(level), "nose-bridge-segment"));

  const below = solve();
  below.features.nose.bridge.y = below.features.nose.tip.y + 1;
  assert.ok(segmentPath(renderFaceSvg(below), "nose-bridge-segment"));
});

test("absolute yaw 0.5 restores the bridge-to-tip segment regardless of height", () => {
  for (const yaw of [-1, -0.5, 0.5, 1]) {
    const rig = solve({ yaw });
    rig.features.nose.bridge.y = rig.features.nose.tip.y - 1;
    assert.ok(
      segmentPath(renderFaceSvg(rig), "nose-bridge-segment"),
      `bridge segment at yaw ${yaw}`
    );
  }

  for (const yaw of [-0.4999, 0, 0.4999]) {
    const rig = solve({ yaw });
    rig.features.nose.bridge.y = rig.features.nose.tip.y - 1;
    assert.equal(
      segmentPath(renderFaceSvg(rig), "nose-bridge-segment"),
      null,
      `hidden bridge segment at yaw ${yaw}`
    );
  }
});

test("the far nostril segment hides only past absolute yaw 0.5", () => {
  for (const yaw of [-0.5, 0, 0.5]) {
    const svg = renderFaceSvg(solve({ yaw }));
    assert.ok(segmentPath(svg, "nose-near-nostril-segment"), `near segment at yaw ${yaw}`);
    assert.ok(segmentPath(svg, "nose-far-nostril-segment"), `far segment at yaw ${yaw}`);
  }

  for (const yaw of [-1, -0.5001, 0.5001, 1]) {
    const svg = renderFaceSvg(solve({ yaw }));
    assert.ok(segmentPath(svg, "nose-near-nostril-segment"), `near segment at yaw ${yaw}`);
    assert.equal(segmentPath(svg, "nose-far-nostril-segment"), null, `far segment at yaw ${yaw}`);
  }
});

test("the far segment targets the nostril furthest outward on either side", () => {
  for (const yaw of [-0.5, 0.5]) {
    const rig = solve({ yaw });
    const { leftNostril, rightNostril } = rig.features.nose;
    const expectedFar = Math.abs(leftNostril.x - 250) > Math.abs(rightNostril.x - 250)
      ? leftNostril
      : rightNostril;
    const expectedNear = expectedFar === leftNostril ? rightNostril : leftNostril;
    const svg = renderFaceSvg(rig);
    const farPath = segmentPath(svg, "nose-far-nostril-segment");
    const nearPath = segmentPath(svg, "nose-near-nostril-segment");

    assert.ok(farPath.endsWith(`L ${expectedFar.x} ${expectedFar.y}`), `far endpoint at yaw ${yaw}`);
    assert.ok(nearPath.endsWith(`L ${expectedNear.x} ${expectedNear.y}`), `near endpoint at yaw ${yaw}`);
  }
});

test("nostril curves are opt-in paired geometry that curls outward and upward", () => {
  const defaults = solve();
  assert.equal(defaults.features.nose.leftNostrilCurve, null);
  assert.equal(defaults.features.nose.rightNostrilCurve, null);
  assert.equal(segmentPath(renderFaceSvg(defaults), "nose-near-nostril-curve"), null);
  assert.equal(segmentPath(renderFaceSvg(defaults), "nose-far-nostril-curve"), null);

  const { nose } = solve({ showNostrilCurves: true }).features;
  const pairs = [
    [nose.leftNostril, nose.leftNostrilCurve],
    [nose.rightNostril, nose.rightNostrilCurve]
  ];
  const midpointX = (nose.leftNostril.x + nose.rightNostril.x) / 2;

  for (const [nostril, curve] of pairs) {
    assert.strictEqual(curve.start, nostril);
    assert.ok(curve.control1.y > curve.start.y, "curve initially bends down");
    assert.ok(curve.end.y < curve.start.y, "curve finishes above its nostril");
    assert.ok(
      Math.abs(curve.end.x - curve.start.x) < Math.abs(curve.control2.x - curve.start.x) * 0.2,
      "curve wraps back to finish nearly above its attachment"
    );
    assert.ok(
      (curve.control2.x - curve.start.x) * (curve.start.x - midpointX) > 0,
      "curve bows outward from the nostril pair"
    );
    const startTangent = {
      x: curve.control1.x - curve.start.x,
      y: curve.control1.y - curve.start.y
    };
    const endTangent = {
      x: curve.end.x - curve.control2.x,
      y: curve.end.y - curve.control2.y
    };
    const tangentCosine = (
      startTangent.x * endTangent.x + startTangent.y * endTangent.y
    ) / (Math.hypot(startTangent.x, startTangent.y) * Math.hypot(endTangent.x, endTangent.y));
    assert.ok(tangentCosine < -0.99, "curve reverses direction by almost 180 degrees");
  }

  assertClose(
    nose.leftNostrilCurve.control2.x - nose.leftNostrilCurve.start.x,
    -(nose.rightNostrilCurve.control2.x - nose.rightNostrilCurve.start.x),
    "front-view curve bow mirrors"
  );
  assertClose(
    nose.leftNostrilCurve.end.y - nose.leftNostrilCurve.start.y,
    nose.rightNostrilCurve.end.y - nose.rightNostrilCurve.start.y,
    "front-view curve rise matches"
  );
});

test("nostril curve scale changes offsets without moving the attachments", () => {
  const small = solve({ showNostrilCurves: true, nostrilCurveScale: 0.5 }).features.nose;
  const large = solve({ showNostrilCurves: true, nostrilCurveScale: 2 }).features.nose;

  for (const side of ["left", "right"]) {
    const nostrilKey = `${side}Nostril`;
    const curveKey = `${side}NostrilCurve`;
    const smallCurve = small[curveKey];
    const largeCurve = large[curveKey];

    assert.deepEqual(small[nostrilKey], large[nostrilKey]);
    assertClose(largeCurve.end.x - largeCurve.start.x, 4 * (smallCurve.end.x - smallCurve.start.x), `${side} reach scales`);
    assertClose(largeCurve.end.y - largeCurve.start.y, 4 * (smallCurve.end.y - smallCurve.start.y), `${side} rise scales`);
    for (const control of ["control1", "control2"]) {
      assertClose(largeCurve[control].x - largeCurve.start.x, 4 * (smallCurve[control].x - smallCurve.start.x), `${side} ${control} X scales`);
      assertClose(largeCurve[control].y - largeCurve.start.y, 4 * (smallCurve[control].y - smallCurve.start.y), `${side} ${control} Y scales`);
    }
  }
});

test("nostril curves inherit the existing near and far yaw visibility", () => {
  for (const yaw of [-0.5, 0, 0.5]) {
    const svg = renderFaceSvg(solve({ yaw, showNostrilCurves: true }));
    assert.ok(segmentPath(svg, "nose-near-nostril-curve"), `near curve at yaw ${yaw}`);
    assert.ok(segmentPath(svg, "nose-far-nostril-curve"), `far curve at yaw ${yaw}`);
  }

  for (const yaw of [-1, -0.5001, 0.5001, 1]) {
    const svg = renderFaceSvg(solve({ yaw, showNostrilCurves: true }));
    assert.ok(segmentPath(svg, "nose-near-nostril-curve"), `near curve at yaw ${yaw}`);
    assert.equal(segmentPath(svg, "nose-far-nostril-curve"), null, `hidden far curve at yaw ${yaw}`);
  }
});

test("near and far nostril curve classes remain paired with their endpoints", () => {
  for (const yaw of [-0.5, 0.5]) {
    const rig = solve({ yaw, showNostrilCurves: true });
    const { nose } = rig.features;
    const leftIsFar = Math.abs(nose.leftNostril.x - 250) > Math.abs(nose.rightNostril.x - 250);
    const expectedFar = leftIsFar ? nose.leftNostrilCurve : nose.rightNostrilCurve;
    const expectedNear = leftIsFar ? nose.rightNostrilCurve : nose.leftNostrilCurve;
    const svg = renderFaceSvg(rig);

    assert.ok(
      segmentPath(svg, "nose-far-nostril-curve").startsWith(`M ${expectedFar.start.x} ${expectedFar.start.y}`),
      `far curve attachment at yaw ${yaw}`
    );
    assert.ok(
      segmentPath(svg, "nose-near-nostril-curve").startsWith(`M ${expectedNear.start.x} ${expectedNear.start.y}`),
      `near curve attachment at yaw ${yaw}`
    );
  }
});

test("nostril curves render as finite ordinary cubic nose strokes", () => {
  const cases = [
    { yaw: -1, pitch: -0.5, faceWidth: 120, faceHeight: 220, noseWidth: 0.3, noseY: -16, nostrilCurveScale: 0.25 },
    { yaw: -0.5, pitch: 0.5, faceWidth: 220, faceHeight: 120, noseWidth: 2, noseY: 16, nostrilCurveScale: 2 },
    { yaw: 0.5, pitch: -0.5, faceWidth: 220, faceHeight: 220, noseWidth: 0.3, noseY: 16, nostrilCurveScale: 2 },
    { yaw: 1, pitch: 0.5, faceWidth: 120, faceHeight: 120, noseWidth: 2, noseY: -16, nostrilCurveScale: 0.25 }
  ];

  for (const overrides of cases) {
    const rig = solve({ ...overrides, showNostrilCurves: true });
    for (const curve of [rig.features.nose.leftNostrilCurve, rig.features.nose.rightNostrilCurve]) {
      for (const point of [curve.start, curve.control1, curve.control2, curve.end]) {
        assert.ok(Number.isFinite(point.x));
        assert.ok(Number.isFinite(point.y));
      }
    }
  }

  const svg = renderFaceSvg(solve({ showNostrilCurves: true, removeStrokes: true }));
  const nearPath = pathElement(svg, "nose-near-nostril-curve");
  assert.match(nearPath, /d="M [^\"]+ C [^\"]+"/);
  assert.match(nearPath, /fill="none"/);
  assert.match(nearPath, /stroke="black"/);
  assert.match(nearPath, /stroke-width="3"/);
  assert.match(nearPath, /stroke-linecap="round"/);
  assert.doesNotMatch(nearPath, /preserve-material-stroke/);
  assert.match(svg, /\*:not\(\.preserve-material-stroke\)[\s\S]*stroke: none !important/);
});

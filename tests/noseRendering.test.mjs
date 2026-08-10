import assert from "node:assert/strict";
import test from "node:test";

import { defaultParams, sliderConfig } from "../src/params.js";
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
  const large = solve({ showNostrilCurves: true, nostrilCurveScale: 3 }).features.nose;

  for (const side of ["left", "right"]) {
    const nostrilKey = `${side}Nostril`;
    const curveKey = `${side}NostrilCurve`;
    const smallCurve = small[curveKey];
    const largeCurve = large[curveKey];

    assert.deepEqual(small[nostrilKey], large[nostrilKey]);
    assertClose(largeCurve.end.x - largeCurve.start.x, 6 * (smallCurve.end.x - smallCurve.start.x), `${side} reach scales`);
    assertClose(largeCurve.end.y - largeCurve.start.y, 6 * (smallCurve.end.y - smallCurve.start.y), `${side} rise scales`);
    for (const control of ["control1", "control2"]) {
      assertClose(largeCurve[control].x - largeCurve.start.x, 6 * (smallCurve[control].x - smallCurve.start.x), `${side} ${control} X scales`);
      assertClose(largeCurve[control].y - largeCurve.start.y, 6 * (smallCurve[control].y - smallCurve.start.y), `${side} ${control} Y scales`);
    }
  }
});

test("nostril curve scale increases continuously from seventy-five percent at front view", () => {
  const front = solve({ yaw: 0, showNostrilCurves: true, nostrilCurveScale: 2 }).features.nose;
  const threeQuarter = solve({ yaw: 0.5, showNostrilCurves: true, nostrilCurveScale: 2 }).features.nose;
  const profiles = [
    solve({ yaw: -1, showNostrilCurves: true, nostrilCurveScale: 2 }).features.nose,
    solve({ yaw: 1, showNostrilCurves: true, nostrilCurveScale: 2 }).features.nose
  ];
  const curveLength = curve => Math.hypot(
    curve.control1.x - curve.start.x,
    curve.control1.y - curve.start.y
  );
  const profileLength = curveLength(profiles[0].leftNostrilCurve);

  assertClose(curveLength(front.leftNostrilCurve), profileLength * 0.75, "front-view effective scale");
  assertClose(curveLength(threeQuarter.leftNostrilCurve), profileLength * 0.875, "three-quarter effective scale");
  for (const profile of profiles) {
    assertClose(curveLength(profile.leftNostrilCurve), profileLength, "profile effective scale");
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
    { yaw: -1, pitch: -0.5, faceWidth: 120, faceHeight: 220, noseWidth: 0.3, noseY: -16, nostrilCurveScale: 0.5 },
    { yaw: -0.5, pitch: 0.5, faceWidth: 220, faceHeight: 120, noseWidth: 2, noseY: 16, nostrilCurveScale: 3 },
    { yaw: 0.5, pitch: -0.5, faceWidth: 220, faceHeight: 220, noseWidth: 0.3, noseY: 16, nostrilCurveScale: 3 },
    { yaw: 1, pitch: 0.5, faceWidth: 120, faceHeight: 120, noseWidth: 2, noseY: -16, nostrilCurveScale: 0.5 }
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

test("nose roundedness is save-compatible and zero preserves straight paths", () => {
  assert.equal(defaultParams.noseRoundedness, 0);
  assert.deepEqual(sliderConfig.noseRoundedness, [-1, 1, 0.01]);

  const nose = solve({ noseRoundedness: 0 }).features.nose;
  assert.equal(nose.bridgeControl, null);
  assert.equal(nose.leftNostrilArc, null);
  assert.equal(nose.rightNostrilArc, null);

  const svg = renderFaceSvg(solve({ yaw: 0.5, noseRoundedness: 0 }));
  assert.match(segmentPath(svg, "nose-bridge-segment"), / L /);
  assert.doesNotMatch(segmentPath(svg, "nose-bridge-segment"), / Q | A /);
  assert.match(segmentPath(svg, "nose-near-nostril-segment"), / L /);
  assert.doesNotMatch(segmentPath(svg, "nose-near-nostril-segment"), / Q | A /);
});

test("negative roundedness curves only the projected bridge inward", () => {
  const negative = solve({ yaw: 0.75, pitch: 0.25, noseRoundedness: -0.6 }).features.nose;
  const positive = solve({ yaw: 0.75, pitch: 0.25, noseRoundedness: 0.6 }).features.nose;
  const midpoint = {
    x: (negative.bridge.x + negative.tip.x) / 2,
    y: (negative.bridge.y + negative.tip.y) / 2
  };

  assert.ok(negative.bridgeControl);
  assert.equal(negative.leftNostrilArc, null);
  assert.equal(negative.rightNostrilArc, null);
  assertClose(
    negative.bridgeControl.x - midpoint.x,
    -(positive.bridgeControl.x - midpoint.x),
    "signed bridge X displacement"
  );
  assertClose(
    negative.bridgeControl.y - midpoint.y,
    -(positive.bridgeControl.y - midpoint.y),
    "signed bridge Y displacement"
  );
});

test("positive roundedness produces outward circular lower arcs", () => {
  const nose = solve({ yaw: 0.25, noseRoundedness: 0.5 }).features.nose;
  const centroid = {
    x: (nose.tip.x + nose.leftNostril.x + nose.rightNostril.x) / 3,
    y: (nose.tip.y + nose.leftNostril.y + nose.rightNostril.y) / 3
  };

  assert.ok(nose.bridgeControl);
  for (const arc of [nose.leftNostrilArc, nose.rightNostrilArc]) {
    assert.ok(arc);
    assertClose(arc.angle, Math.PI / 2, "half-rounded arc angle");
    const midpoint = {
      x: (arc.start.x + arc.end.x) / 2,
      y: (arc.start.y + arc.end.y) / 2
    };
    const outward = {
      x: midpoint.x - centroid.x,
      y: midpoint.y - centroid.y
    };
    const apexOffset = {
      x: arc.apex.x - midpoint.x,
      y: arc.apex.y - midpoint.y
    };
    assert.ok(apexOffset.x * outward.x + apexOffset.y * outward.y > 0);
  }
});

test("lower arcs grow monotonically and stop at an exact semicircle", () => {
  const roundednessValues = [0.1, 0.4, 0.7, 1];
  const arcs = roundednessValues.map(noseRoundedness => (
    solve({ yaw: 0.35, noseRoundedness }).features.nose.leftNostrilArc
  ));

  for (let index = 1; index < arcs.length; index += 1) {
    assert.ok(arcs[index].angle > arcs[index - 1].angle);
    assert.ok(arcs[index].sagitta > arcs[index - 1].sagitta);
  }

  const full = arcs.at(-1);
  const chordLength = Math.hypot(full.end.x - full.start.x, full.end.y - full.start.y);
  assertClose(full.angle, Math.PI, "full roundedness angle");
  assertClose(full.radius, chordLength / 2, "semicircle radius");

  const clamped = solve({ yaw: 0.35, noseRoundedness: 2 }).features.nose.leftNostrilArc;
  assertClose(clamped.angle, Math.PI, "out-of-range value remains capped");
});

test("rounded nose paths preserve near/far visibility and use quadratic and arc commands", () => {
  for (const yaw of [-0.5, 0.5]) {
    const svg = renderFaceSvg(solve({ yaw, noseRoundedness: 0.8 }));
    assert.match(segmentPath(svg, "nose-bridge-segment"), / Q /);
    assert.match(segmentPath(svg, "nose-near-nostril-segment"), / A /);
    assert.match(segmentPath(svg, "nose-far-nostril-segment"), / A /);
  }

  for (const yaw of [-1, 1]) {
    const svg = renderFaceSvg(solve({ yaw, noseRoundedness: 0.8 }));
    assert.match(segmentPath(svg, "nose-near-nostril-segment"), / A /);
    assert.equal(segmentPath(svg, "nose-far-nostril-segment"), null);
  }
});

test("nose roundedness leaves optional nostril curls unchanged", () => {
  const straight = solve({ yaw: 0.4, showNostrilCurves: true, noseRoundedness: 0 }).features.nose;
  const rounded = solve({ yaw: 0.4, showNostrilCurves: true, noseRoundedness: 1 }).features.nose;

  assert.deepEqual(rounded.leftNostrilCurve, straight.leftNostrilCurve);
  assert.deepEqual(rounded.rightNostrilCurve, straight.rightNostrilCurve);
});

test("rounded nose geometry remains finite across pose and control extremes", () => {
  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    for (const pitch of [-0.5, 0.5]) {
      for (const noseRoundedness of [-1, -0.01, 0.01, 1]) {
        const nose = solve({
          yaw,
          pitch,
          faceWidth: yaw < 0 ? 120 : 220,
          faceHeight: pitch < 0 ? 120 : 220,
          noseWidth: yaw === 0 ? 0.3 : 2,
          noseProtrusion: pitch < 0 ? 0.3 : 2,
          noseRoundedness
        }).features.nose;
        const points = [
          nose.bridge,
          nose.bridgeControl,
          nose.tip,
          nose.leftNostril,
          nose.rightNostril,
          nose.leftNostrilArc?.apex,
          nose.rightNostrilArc?.apex
        ].filter(Boolean);

        for (const point of points) {
          assert.ok(Number.isFinite(point.x));
          assert.ok(Number.isFinite(point.y));
        }
        for (const arc of [nose.leftNostrilArc, nose.rightNostrilArc].filter(Boolean)) {
          assert.ok(Number.isFinite(arc.radius));
          assert.ok(arc.angle <= Math.PI);
        }
      }
    }
  }
});
